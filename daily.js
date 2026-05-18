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

async function cloudinaryUpload(buffer) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), 'bg.png');
  form.append('upload_preset', 'fi604fpo');
  const res = await fetch('https://api.cloudinary.com/v1_1/duhfkgxer/image/upload', { method: 'POST', body: form });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary bg upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

// Generate an abstract topical background via OpenAI gpt-image-2. Never throws: returns
// a Cloudinary URL or null so a bad image day degrades to a plain themed slide.
async function genBackground(topic, accent) {
  const okey = process.env.OPENAI_API_KEY;
  if (!okey) { console.log('bg: no OPENAI_API_KEY, skipping'); return null; }
  const prompt = 'Abstract premium editorial background image for a marketing carousel about: ' + topic + '. Dark moody atmosphere, ' + accent + ', cinematic depth, soft volumetric light, subtle geometric shapes and texture, lots of empty negative space. ABSOLUTELY NO text, NO letters, NO words, NO numbers, NO logos, NO charts, NO UI. Vertical poster background only.';
  for (const model of ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + okey, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, size: '1024x1536', n: 1 }),
      });
      const j = await res.json();
      if (!res.ok) { console.log('bg: ' + model + ' -> ' + res.status + ' ' + JSON.stringify(j).slice(0, 160)); continue; }
      const d = (j.data && j.data[0]) || {};
      let buf = null;
      if (d.b64_json) buf = Buffer.from(d.b64_json, 'base64');
      else if (d.url) buf = Buffer.from(await (await fetch(d.url)).arrayBuffer());
      if (!buf) { console.log('bg: ' + model + ' no image in response'); continue; }
      const url = await cloudinaryUpload(buf);
      console.log('bg: generated with ' + model + ' ->', url);
      return url;
    } catch (err) { console.log('bg: ' + model + ' error ' + err.message); }
  }
  console.log('bg: all image models failed, proceeding without background');
  return null;
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
  function extract(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return (a < 0 || b <= a) ? null : t.slice(a, b + 1); }
  async function parseOrRepair(raw) {
    const j0 = extract(raw);
    if (j0) { try { return JSON.parse(j0); } catch (_) {} }
    console.log('content JSON invalid, asking model to repair...');
    const r = await anthropic({
      model: 'claude-sonnet-4-6', max_tokens: 4000,
      system: 'You repair malformed JSON. Output ONLY valid minified JSON, no prose, no code fences. Preserve all Hebrew text exactly.',
      messages: [{ role: 'user', content: 'Return this as one valid JSON object:\n' + raw }],
    });
    const rt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const j1 = extract(rt);
    if (!j1) throw new Error('No JSON after repair');
    return JSON.parse(j1);
  }
  const content = await parseOrRepair(text);
  if (!content.slides || content.slides.length !== 7 || !content.caption) {
    throw new Error('Invalid content JSON (need caption + 7 slides). Got: ' + JSON.stringify(content).slice(0, 300));
  }
  // Enforce the no-AI-tells typography rule in code (model sometimes slips em dashes).
  const clean = (t) => typeof t === 'string'
    ? t.replace(/\s*[—–]\s*/g, ', ').replace(/--+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
    : t;
  content.caption = clean(content.caption);
  content.slides.forEach((sl) => { ['kicker', 'eyebrow', 'h', 'sub', 'pill'].forEach((k) => { if (sl[k] != null) sl[k] = clean(sl[k]); }); });

  // rotate visual theme by day-of-year so the feed never looks the same two days running
  const THEMES = ['t-ink', 't-cream', 't-acid', 't-blue', 't-sun'];
  const doy = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(date.slice(0, 4) + '-01-01T00:00:00Z')) / 86400000);
  content.theme = THEMES[((doy % THEMES.length) + THEMES.length) % THEMES.length];
  console.log('theme:', content.theme);

  // AI background per topic (dark themes only; t-cream stays a clean light editorial look)
  const ACCENT = {
    't-ink': 'electric magenta and cyan accents on near-black',
    't-acid': 'vivid magenta, violet and warm orange energy',
    't-blue': 'teal and cyan technical glow on deep navy',
    't-sun': 'warm sunset orange, pink and purple haze',
  };
  if (content.theme !== 't-cream') {
    const topic = String((content.slides[0] && content.slides[0].h) || content.caption)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    try {
      const bg = await genBackground(topic, ACCENT[content.theme] || 'subtle brand accents');
      if (bg) content.bg = bg;
    } catch (err) { console.log('bg: skipped (' + err.message + ')'); }
  }

  const dir = path.join(__dirname, 'content');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, date + '.json'), JSON.stringify(content, null, 2));
  console.log('content written for', date, '- caption:', content.caption.slice(0, 80));

  execFileSync('node', [path.join(__dirname, 'render.js'), date], { stdio: 'inherit' });
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
