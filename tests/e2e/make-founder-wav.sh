#!/bin/sh
# Generates the e2e "founder microphone": segment 0 = intro, 1-6 = LedgerLoop pitch, 7-9 = Q&A answers, spoken by
# macOS `say` and separated by 3 s of silence, plus founder.json with each segment's [start, duration] in seconds so
# tests/e2e/fake-media.js can play one segment at a time. Needs macOS + ffmpeg.
# Usage: sh tests/e2e/make-founder-wav.sh public/e2e/founder.wav
set -e
OUT=${1:-public/e2e/founder.wav}
TMP=$(mktemp -d)
i=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  say -v Samantha -o "$TMP/$i.aiff" "$line"
  ffmpeg -v error -y -i "$TMP/$i.aiff" -ar 24000 -ac 1 "$TMP/$i.wav"
  i=$((i + 1))
done <<'EOF'
Hi everyone, I'm Priya, founder and CEO of LedgerLoop. Great to meet you all.
LedgerLoop automates month-end close for mid-market finance teams. Today a typical controller at a company with two hundred employees spends nine working days every month reconciling bank feeds, chasing receipts, and fixing journal entries in spreadsheets.
Here's the problem in numbers. There are roughly one hundred and forty thousand mid-market companies in the United States, and finance automation for that segment is a twelve billion dollar market growing at about fourteen percent a year.
Our product connects to NetSuite, QuickBooks and Xero, matches every transaction automatically, and drafts the journal entries for review. Customers close their books in two days instead of nine.
Traction. We have sixty two paying customers, one point four million dollars in annual recurring revenue, and net revenue retention of one hundred and thirty one percent. Forty percent of new bookings come from three fractional CFO firms.
Competition. BlackLine and FloQast serve the enterprise. Our main competitor in the mid-market, Toast, actually went bankrupt last year, so the field is wide open.
We are raising a four million dollar seed round to grow the team to twenty people and reach five million in ARR within eighteen months.
Great question. Our customer acquisition cost is about four thousand dollars and payback is under nine months, because sixty percent of deals come from our fractional CFO partners.
We integrate directly with NetSuite and QuickBooks through their APIs, and our matching model is ninety seven percent accurate on bank reconciliations today.
Churn is very low. We have lost two customers out of sixty two, and both were acquired.
EOF
ffmpeg -v error -y -f lavfi -i anullsrc=r=24000:cl=mono -t 3 "$TMP/sil.wav"
: > "$TMP/list.txt"
echo "file '$TMP/sil.wav'" >> "$TMP/list.txt"
j=0
while [ $j -lt $i ]; do
  echo "file '$TMP/$j.wav'" >> "$TMP/list.txt"
  echo "file '$TMP/sil.wav'" >> "$TMP/list.txt"
  j=$((j + 1))
done
mkdir -p "$(dirname "$OUT")"
ffmpeg -v error -y -f concat -safe 0 -i "$TMP/list.txt" -c pcm_s16le "$OUT"
# Segment offsets: 3 s leading silence, then each segment followed by 3 s of silence.
pos=3
printf '[' > "${OUT%.wav}.json"
j=0
while [ $j -lt $i ]; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/$j.wav")
  [ $j -gt 0 ] && printf ',' >> "${OUT%.wav}.json"
  printf '[%s,%s]' "$pos" "$d" >> "${OUT%.wav}.json"
  pos=$(echo "$pos + $d + 3" | bc -l)
  j=$((j + 1))
done
printf ']\n' >> "${OUT%.wav}.json"
rm -rf "$TMP"
echo "wrote $OUT and ${OUT%.wav}.json"
