// End-to-end smoke in real Chrome. FLOW=founder (default): sign in → practice config → room → meeting → report.
// FLOW=investor: sign in as VC → create panel → open the invite link as a startup → interview (recorded) → /thanks →
// the VC's report (recommendation, criteria, emotions, recording).
// Media is synthetic (tests/e2e/fake-media.js): a scripted founder speaks WAV segments on cue, the screen share cycles
// 4 slides. Costs ~$0.50 of Vertex usage. Needs public/e2e/{founder.wav,founder.json,slide1..4.jpg} in the app
// (sh tests/e2e/make-founder-wav.sh public/e2e/founder.wav; cp tests/e2e/slide*.jpg public/e2e/) BEFORE `next build`.
//
// Usage (app running, e.g. `pnpm build && pnpm start -p 3917`):  node tests/e2e/meeting.mjs [BASE]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3917';
const SEATS = Number(process.env.SEATS ?? 2);
const QA_MIN = `${process.env.QA_MIN ?? 2} min`;
const LEAVE = !!process.env.LEAVE;
const FLOW = process.env.FLOW === 'investor' ? 'investor' : 'founder';
const OUT = path.resolve('tests/e2e/out');
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: process.env.HEADED ? false : true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
await ctx.addInitScript({ content: readFileSync(new URL('./fake-media.js', import.meta.url), 'utf8') });
const page = await ctx.newPage();
const consoleLines = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  consoleLines.push(`${((Date.now() - t0) / 1000).toFixed(1)} ${line}`);
  if (m.type() === 'error') log('console', line.slice(0, 300));
});
page.on('pageerror', (e) => log('PAGEERROR', e.message));

// ---- Sign in (fake login accepts anything) and configure
async function signIn(p, role) {
  await p.goto(`${BASE}/login?role=${role}`);
  await p.getByLabel('Username').fill(role === 'investor' ? 'Demo VC' : 'Priya');
  await p.getByRole('button', { name: 'Sign in →' }).click();
  await p.waitForURL(new RegExp(`/${role}$`), { timeout: 15000 });
}
/** Pitch/Q&A pills + remove seats from the end (default panel: Jay, Vera, Sam, Kira). */
async function format(p) {
  await p.getByRole('radiogroup', { name: 'Pitch length' }).getByRole('radio', { name: '2 min' }).click();
  await p.getByRole('radiogroup', { name: 'Q&A length' }).getByRole('radio', { name: QA_MIN }).click();
  for (const name of ['Remove Kira', 'Remove Sam', 'Remove Vera'].slice(0, 4 - SEATS)) await p.getByRole('button', { name }).click();
}

let vcPage = null;
if (FLOW === 'founder') {
  await signIn(page, 'founder');
  await page.getByLabel('Your name').fill('Priya');
  await page.getByLabel('Startup name').fill('LedgerLoop');
  await page.getByLabel('One-liner').fill('AI that closes the books for mid-market finance teams in a day');
  await format(page);
  await page.screenshot({ path: `${OUT}/01-config.png`, fullPage: true });
  await page.getByRole('button', { name: 'Start pitch →' }).click();
} else {
  // The VC (own browser context = own cookie) builds a panel and copies the invite link.
  const vcCtx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  vcPage = await vcCtx.newPage();
  await signIn(vcPage, 'investor');
  await vcPage.goto(`${BASE}/investor/panels/new`);
  await vcPage.getByLabel('Panel name').fill('E2E Seed screening');
  await format(vcPage);
  await vcPage.getByLabel('Custom instructions for Jay').fill('Ask how confident they are in their revenue numbers. Ask why this is better than FloQast.');
  await vcPage.screenshot({ path: `${OUT}/00-panel-config.png`, fullPage: true });
  await vcPage.getByRole('button', { name: 'Create panel' }).click();
  await vcPage.waitForURL(/\/investor\/panels\/[0-9a-f-]{36}$/, { timeout: 20000 });
  await vcPage.waitForFunction(() => /\/i\//.test(document.querySelector('input[aria-label="Invite link"]')?.value ?? ''));
  const invite = await vcPage.getByLabel('Invite link', { exact: true }).inputValue();
  log('panel created, invite', invite);
  // The startup opens the invite link (no login).
  await page.goto(invite);
  await page.getByLabel('Your name').fill('Priya');
  await page.getByLabel('Startup name').fill('LedgerLoop');
  await page.getByLabel('One-liner').fill('AI that closes the books for mid-market finance teams in a day');
  await page.getByLabel('Email (so the fund can reach you)').fill('priya@ledgerloop.test');
  await page.locator('input[type=checkbox]').check();
  await page.screenshot({ path: `${OUT}/01-invite.png`, fullPage: true });
  await page.getByRole('button', { name: 'Continue to the interview →' }).click();
}
await page.waitForURL(/\/room\//, { timeout: 15000 });
const sessionId = page.url().split('/room/')[1];
log('room', sessionId);

// ---- Lobby
const join = page.getByRole('button', { name: 'Join meeting' });
await page.waitForFunction(
  () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Join meeting') && !b.disabled),
  null,
  { timeout: 15000 },
);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/02-lobby.png` });
await join.click();
log('joined');

// ---- Meeting: a scripted founder. Intro after the host's welcome; pitch segments 1-6 then "Done pitching";
// in Q&A, answer (segments 7-9) whenever an investor's caption ends with a question.
const caption = () =>
  page
    .locator('.meeting-root p.line-clamp-2')
    .first()
    .textContent({ timeout: 500 })
    .catch(() => '');
const phaseText = () =>
  page
    .locator('.meeting-root span.rounded-full')
    .first()
    .textContent({ timeout: 1000 })
    .catch(() => '');
const say = (i) => page.evaluate((n) => window.__founder.play(n), i);
/** True once no investor has been speaking for `ms` (captions run ahead of the avatar's audio). */
async function quietFor(ms) {
  const end = Date.now() + 15_000;
  let since = 0;
  while (Date.now() < end) {
    const speaking = await page.locator('.meeting-root').getAttribute('data-speaking').catch(() => '');
    if (speaking) since = 0;
    else if (!since) since = Date.now();
    else if (Date.now() - since >= ms) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

let lastPhase = '';
let introAt = 0;
let introDone = false;
let pitchStarted = false;
let answer = 7;
let lastAnswered = '';
let shot = 3;
const phaseLog = [];
while (!/\/report\/|\/thanks/.test(page.url())) {
  const phase = await phaseText();
  if (phase && phase !== lastPhase) {
    log('phase →', phase);
    phaseLog.push([((Date.now() - t0) / 1000).toFixed(0), phase]);
    lastPhase = phase;
    if (phase === 'INTRO') introAt = Date.now();
    await page.screenshot({ path: `${OUT}/${String(shot++).padStart(2, '0')}-${phase.replace(/\W/g, '')}.png` });
  }
  const cap = (await caption()) ?? '';
  if (phase === 'INTRO' && !introDone && (/\?\s*$/.test(cap) || Date.now() - introAt > 15_000)) {
    introDone = true;
    await quietFor(700);
    log('founder: intro');
    void say(0);
  }
  if (phase === 'PITCH' && !pitchStarted) {
    pitchStarted = true;
    await page.getByRole('button', { name: /^(share|present)/i }).first().click({ timeout: 5000 }).catch((e) => log('share failed', e.message));
    log('screen shared');
    void (async () => {
      for (let i = 1; i <= 6; i++) {
        if ((await phaseText()) !== 'PITCH') return;
        log(`founder: pitch segment ${i}`);
        await say(i);
        await page.waitForTimeout(1200);
        if (LEAVE && i === 2) {
          // LEAVE=1: walk out mid-pitch — a report must still be produced from the partial meeting.
          await page.getByRole('button', { name: 'Leave' }).click();
          await page.getByRole('button', { name: 'Leave and get report' }).click();
          log('left mid-pitch');
          return;
        }
      }
      await page.screenshot({ path: `${OUT}/${String(shot++).padStart(2, '0')}-pitch-end.png` });
      await page.getByRole('button', { name: 'Done pitching' }).click().catch(() => {});
      log('clicked Done pitching');
    })();
  }
  if (phase === 'Q&A' && /\?\s*$/.test(cap) && cap !== lastAnswered && !(await page.evaluate(() => window.__founder.busy))) {
    await quietFor(700);
    if ((await phaseText()) === 'Q&A') {
      lastAnswered = cap;
      log('investor asked:', cap.slice(0, 140));
      await page.screenshot({ path: `${OUT}/${String(shot++).padStart(2, '0')}-qa.png` });
      log(`founder: answer ${answer}`);
      void say(answer);
      answer = answer === 9 ? 7 : answer + 1;
    }
  }
  if (Date.now() - t0 > 12 * 60_000) throw new Error('meeting did not finish in 12 minutes');
  await page.waitForTimeout(500);
}
log('after meeting', page.url());

// ---- Report: founder sees practice feedback; for interviews the startup sees /thanks and the VC gets the report.
const reportPage = FLOW === 'investor' ? vcPage : page;
if (FLOW === 'investor') {
  await page.screenshot({ path: `${OUT}/80-thanks.png` });
  await vcPage.goto(`${BASE}/investor/reports/${sessionId}`);
}
await reportPage.getByText(/investors are in/).waitFor({ timeout: 240_000 });
await reportPage.waitForTimeout(1500);
await reportPage.screenshot({ path: `${OUT}/90-report.png`, fullPage: true });
log('report ready');
if (FLOW === 'investor') {
  await vcPage.goto(`${BASE}/investor/reports`);
  await vcPage.screenshot({ path: `${OUT}/91-reports-list.png`, fullPage: true });
}

const session = await (await page.request.get(`${BASE}/api/sessions/${sessionId}`)).json();
writeFileSync(`${OUT}/session.json`, JSON.stringify(session, null, 1));
writeFileSync(`${OUT}/console.log`, consoleLines.join('\n'));
log('phases', JSON.stringify(phaseLog));
log('score', session.report?.overall_score, 'verdicts', JSON.stringify(session.verdicts?.map((v) => [v.name, v.decision])));
log('transcript lines', session.transcript?.length, 'fact checks', session.fact_checks?.length, 'hands', session.hand_raises?.length);
log('mode', session.mode, 'recommendation', session.report?.recommendation, 'criteria', session.report?.criteria_scores?.length, 'recording', !!session.recording_path, 'emotions', session.delivery?.[0]?.dominant_emotion);
await browser.close();
