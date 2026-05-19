// Compacts the stored IG insights into a short briefing for daily.js. The model uses
// it to lean into hooks/formats/subjects that resemble TOP performers and to drop
// patterns that resemble the WEAKEST ones. Pure local logic, zero API/model cost.
const fs = require('fs');
const path = require('path');
const STORE = path.join(__dirname, 'insights', 'posts.json');

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function summary() {
  let store;
  try { store = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch (_) { return ''; }
  const posts = (store.posts || []).slice(-14);
  if (!posts.length) return '';
  const reaches = posts.map((p) => p.metrics.reach || 0);
  const saves = posts.map((p) => p.metrics.saved || 0);
  const shares = posts.map((p) => p.metrics.shares || 0);
  const mReach = median(reaches), mSaves = median(saves), mShares = median(shares);
  // Composite growth score: saves and shares matter most for IG reach, follows
  // matter most for the actual goal (new followers).
  const scored = posts.map((p) => ({
    p,
    score: (p.metrics.saved || 0) + 1.5 * (p.metrics.shares || 0) + 3 * (p.metrics.follows || 0),
  }));
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.p);
  const flop = [...scored].sort((a, b) => a.score - b.score).slice(0, 2).map((s) => s.p);
  const fmt = (p) => '- type=' + (p.media_product_type || p.media_type || 'POST')
    + ' reach=' + (p.metrics.reach || 0)
    + ' saves=' + (p.metrics.saved || 0)
    + ' shares=' + (p.metrics.shares || 0)
    + ' follows=' + (p.metrics.follows || 0)
    + ' views=' + (p.metrics.views || p.metrics.plays || 0)
    + ' | "' + (p.caption_snippet || '').slice(0, 120) + '"';
  return [
    'PRIOR-POST PERFORMANCE on @bankhaltershay — last ' + posts.length + ' posts.',
    'Medians: reach=' + mReach + ' saves=' + mSaves + ' shares=' + mShares + '.',
    'TOP performers (weighted: saves + 1.5*shares + 3*follows):',
    ...top.map(fmt),
    'WEAKEST performers:',
    ...flop.map(fmt),
    'LEARNING INSTRUCTION: today, lean into the hook style, format and subject area that resembles the TOP performers. Drop patterns that resemble the WEAKEST. If the audience clearly engages more with one angle (e.g. PPC over AI tools, myth-vs-reality over checklist), bias toward it.',
  ].join('\n');
}

module.exports = { summary };

if (require.main === module) {
  process.stdout.write(summary());
}
