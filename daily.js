// Pink Media daily carousel — one self-contained step (runs on the always-on Hetzner server).
// Usage: ANTHROPIC_API_KEY=.. MAKE_API_TOKEN=.. node daily.js [YYYY-MM-DD]
// 1) Anthropic API (web_search) researches last-3-days AI/SEO/PPC news and writes the
//    content JSON per the editorial spec.  2) hands off to render.js (render -> Cloudinary
//    -> Make queue).  The Make publisher posts it to Instagram at 19:00 Asia/Jerusalem.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('FATAL: ANTHROPIC_API_KEY missing'); process.exit(1); }
if (!process.env.MAKE_API_TOKEN) { console.error('FATAL: MAKE_API_TOKEN missing'); process.exit(1); }

const SYSTEM = `You are a senior marketing, AI and automation strategist at the digital agency Pink Media. Audience: CEOs, marketing managers and business owners who care about the bottom line, ROI and competitive edge. All post text is in HEBREW.

Produce ONE Instagram carousel (exactly 7 slides) about the single strongest AI / SEO / PPC marketing story from the LAST 3 DAYS.

IRONCLAD WRITING RULES (obey all):
- Zero AI style. Banned: 'בעידן הדיגיטלי של היום', 'תחזיקו חזק', 'צללו פנימה', 'הנוף המשתנה', 'חשוב לזכור', and any generic opener, drama or cliche. No em dash, no double hyphen, no rule-of-three patterns, no 'במילים אחרות'.
- Tone: eye-level, direct, sharp, like a professional WhatsApp message to a CEO whose budget you manage.
- No news summary. The audience already read the headline. Interpret the 'so what': how it hits the bottom line or the marketing strategy.
- Clean, short lines.

STRUCTURE across the 7 slides: slide1 = cutting hook (break a myth / hot take / a critical problem the news creates). slides2-5 = strategic interpretation: what really happened under the surface and how it hits campaigns, traffic or conversions. slide6 = one concrete step to take tomorrow morning. slide7 = short natural CTA.
FORMAT: pick ONE presentation for the day and vary it day to day: myth-vs-reality, or manager checklist, or deep tactical analysis.

OUTPUT: return ONLY valid minified JSON, no markdown, no commentary, exactly this shape:
{"caption":"<hebrew caption + 5-7 hashtags starting with #פינקמדיה>","brand":{"kicker":"Pink Media","handle":"@bankhaltershay","sub":"פינק מדיה · שיווק דיגיטלי"},"slides":[{"type":"hook","kicker":"...","eyebrow":"...","h":"... <mark>one phrase</mark> ...","sub":"1-2 short lines"},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"one action for tomorrow"},{"type":"cta","kicker":"Pink Media","eyebrow":"...","h":"...","sub":"...","pill":"short button text"}]}
Keep every "h" short (renders very large). Keep "sub" about 2 short lines. Exactly 7 slides.`;

async function anthropic(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Anthropic API ' + res.status + ': ' + JSON.stringify(j));
  return j;
}

(async () => {
  const j = await anthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
    messages: [{ role: 'user', content: 'Today is ' + date + '. Research the last 3 days of AI, SEO and PPC marketing news, choose the single strongest story for the audience, and output ONLY the content JSON described in the system prompt.' }],
  });
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('No JSON in model output: ' + text.slice(0, 300));
  const content = JSON.parse(text.slice(s, e + 1));
  if (!content.slides || content.slides.length !== 7 || !content.caption) {
    throw new Error('Invalid content JSON (need caption + 7 slides). Got: ' + JSON.stringify(content).slice(0, 300));
  }
  const dir = path.join(__dirname, 'content');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, date + '.json'), JSON.stringify(content, null, 2));
  console.log('content written for', date, '- caption:', content.caption.slice(0, 80));

  execFileSync('node', [path.join(__dirname, 'render.js'), date], { stdio: 'inherit' });
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
