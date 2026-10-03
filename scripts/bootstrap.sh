#!/bin/sh
# One-command PitchRoom scaffold (plan Task 1). Creates a fresh Next.js app, installs the neobrutalism theme +
# components and all dependencies, copies this reference code in, and verifies typecheck + lint + unit tests + build.
#
#   sh "<repo>/reference/scripts/bootstrap.sh" ~/Projects/pitchroom
#
# Then: copy your .env.local into the app (see reference/.env.example) and `pnpm dev`.
set -e
APP=${1:?usage: bootstrap.sh <new-app-dir>}
REF=$(cd "$(dirname "$0")/.." && pwd)
[ -e "$APP" ] && { echo "✘ $APP already exists"; exit 1; }
PARENT=$(dirname "$APP")
NAME=$(basename "$APP")
mkdir -p "$PARENT"
cd "$PARENT"

echo "▶ create-next-app"
CI=1 pnpm dlx create-next-app@latest "$NAME" --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" \
  --use-pnpm --yes --disable-git >/dev/null
cd "$NAME"

echo "▶ neobrutalism theme + components"
CI=1 pnpm dlx shadcn@latest init https://neobrutalism.dev/r/styling/yellow.json --yes >/dev/null
CI=1 pnpm dlx shadcn@latest add --yes --overwrite $(for c in card input textarea select switch label badge accordion \
  progress dialog tooltip radio-group skeleton alert table toast; do printf "https://neobrutalism.dev/r/%s.json " $c; done) >/dev/null

echo "▶ dependencies"
# pnpm 11 exits 1 when a dependency's build script isn't approved → approve them up front.
cat > pnpm-workspace.yaml <<'YAML'
allowBuilds:
  '@google/genai': true
  esbuild: true
  protobufjs: true
  sharp: false
  unrs-resolver: false
YAML
pnpm add @azure/communication-react @fluentui/react zod @google/genai google-auth-library @supabase/supabase-js \
  @supabase/ssr server-only 2>&1 | grep -E "^\+|ERR_" || true
pnpm add -D tsx playwright 2>&1 | grep -E "^\+|ERR_" || true

echo "▶ reference code"
cp -R "$REF"/app "$REF"/components "$REF"/lib "$REF"/public "$REF"/supabase "$REF"/tests "$REF"/scripts .
cp "$REF"/proxy.ts "$REF"/.env.example .
rm -f app/favicon.ico
printf '\n.data/\ntests/e2e/out/\npublic/e2e/\n.env*.local\n' >> .gitignore
node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
  p.name = process.argv[1];
  Object.assign(p.scripts, JSON.parse(fs.readFileSync(process.argv[2], "utf8")).scripts);
  fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
' "$NAME" "$REF/package.json"

echo "▶ verify"
pnpm typecheck
pnpm lint
pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"
pnpm build >/dev/null && echo "✓ next build"
echo "✓ $APP is ready. Next: cp <your .env.local> $APP/ && cd $APP && pnpm dev"
