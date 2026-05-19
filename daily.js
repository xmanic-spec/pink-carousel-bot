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

ART DIRECTION: also output "art" = ONE vivid, specific English sentence describing a DARING conceptual editorial PHOTOGRAPH that stops the scroll dead. It must be a real photograph (fashion / advertising campaign craft), but the staged scene should be bold, surprising, even absurd or surreal, while staying TIGHTLY connected to the meaning of THIS exact story. Favor an intense human moment: a person mid-scream with their mouth wide open, a shocking gesture, an impossible-but-on-point situation. Punchy high-contrast color is welcome. NEVER 3D / CGI / illustration / render (it must look like a real photo). NEVER a bland stock office, NEVER abstract shapes or empty space. Do not describe any text, readable screens or UI, letters, numbers or logos (a separate system renders all text). One concrete, evocative sentence.

OUTPUT: return ONLY valid minified JSON, no markdown, no commentary, exactly this shape:
{"caption":"<hebrew caption + 5-7 hashtags starting with #פינקמדיה>","art":"<one vivid English sentence: the single unforgettable conceptual hero image for this story, strong visual metaphor, no text/UI>","brand":{"kicker":"Pink Media","handle":"@bankhaltershay","sub":"פינק מדיה · שיווק דיגיטלי"},"slides":[{"type":"hook","kicker":"...","eyebrow":"...","h":"... <mark>one phrase</mark> ...","sub":"1-2 short lines"},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"one action for tomorrow"},{"type":"cta","kicker":"Pink Media","eyebrow":"...","h":"...","sub":"...","pill":"short button text"}]}
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

// Generate a BOLD, topical hero image via OpenAI gpt-image-2. The day's "art" concept
// (art-directed by the content model for this exact story) is the heart of the prompt.
// Never throws: returns a Cloudinary URL or null so a bad image day still renders.
async function genBackground(art, topic, accent) {
  const okey = process.env.OPENAI_API_KEY;
  if (!okey) { console.log('bg: no OPENAI_API_KEY, skipping'); return null; }
  const concept = (art && String(art).trim())
    ? String(art).trim()
    : ('A single bold conceptual hero image that captures the core tension of: ' + topic);
  const prompt = concept
    + '. A daring conceptual editorial photograph with the craft of a high-end fashion or advertising campaign, shot on a full-frame camera with a fast prime lens, real photographic detail, real skin texture and natural grain. A bold, surprising, even absurd or surreal STAGED scene that stays tightly connected to the subject, one striking human subject with an intense expression or gesture (a wide-open-mouth scream, shock, defiance). Punchy high-contrast color: hard gelled studio lighting in ' + accent
    + ' set against a strong complementary color, saturated and graphic, with deep rich shadows for depth. Scroll-stopping and unforgettable. It MUST look like a real photograph, NOT an illustration, NOT a 3D render, NOT CGI. No text, no readable screens or interfaces, no letters, no numbers, no logos, no watermark, no border. Fill the whole frame. Horizontal composition.';
  for (const model of ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + okey, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, size: '1536x1024', n: 1 }),
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

// Real (non-AI) stock photo from Pexels. Never throws: returns a Cloudinary URL or null.
async function genStockPhoto(query) {
  const pk = process.env.PEXELS_API_KEY;
  if (!pk) { console.log('photo: no PEXELS_API_KEY'); return null; }
  try {
    const r = await fetch('https://api.pexels.com/v1/search?orientation=portrait&size=large&per_page=20&query=' + encodeURIComponent(query), { headers: { Authorization: pk } });
    const j = await r.json();
    if (!r.ok || !j.photos || !j.photos.length) { console.log('photo: pexels ' + r.status + ' no results for ' + query); return null; }
    const p = j.photos[Math.floor(Math.random() * j.photos.length)];
    const src = (p.src && (p.src.portrait || p.src.large2x || p.src.large)) || '';
    if (!src) { console.log('photo: no src'); return null; }
    const buf = Buffer.from(await (await fetch(src)).arrayBuffer());
    const url = await cloudinaryUpload(buf);
    console.log('photo: pexels "' + query + '" ->', url);
    return url;
  } catch (e) { console.log('photo: pexels error ' + e.message); return null; }
}

(async () => {
  const doy = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(date.slice(0, 4) + '-01-01T00:00:00Z')) / 86400000);
  // variety: collect recent posts' topics so the model does not repeat itself
  let avoid = [];
  try {
    const cdir = path.join(__dirname, 'content');
    const files = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().slice(-6) : [];
    avoid = files.map(f => { try { const c = JSON.parse(fs.readFileSync(path.join(cdir, f))); return String((c.slides && c.slides[0] && c.slides[0].h) || c.caption || '').replace(/<[^>]+>/g, '').trim().slice(0, 90); } catch (_) { return ''; } }).filter(Boolean);
  } catch (_) {}
  const avoidTxt = avoid.length ? ' Do NOT repeat the subject or angle of these recent posts: ' + avoid.map(a => '"' + a + '"').join('; ') + '. Pick a clearly different subject and vary between AI, SEO and PPC across days.' : '';
  const winDay = (doy % 6 === 0); // roughly once a week: a real client-win post
  const userMsg = winDay
    ? 'Today is ' + date + '. Pink Media is a digital marketing agency, official site https://pinkmedia.co.il . Use web_search to find ONE real, published client success/result that actually appears on pinkmedia.co.il (real metric or case study, e.g. ranking/traffic/leads growth). Build the 7-slide carousel as a confident, classy client-win story per the system rules (slide 1 hook = the headline result, middle = what was done and the impact, slide 7 = CTA). Use ONLY real figures verified on the site. If you cannot verify a real client result, instead produce the normal post about the single strongest AI/SEO/PPC news from the last 3 days.' + avoidTxt + ' Output ONLY the JSON.'
    : 'Today is ' + date + '. Research the last 3 days of AI, SEO and PPC marketing news and choose the single strongest story for the audience.' + avoidTxt + ' Output ONLY the content JSON described in the system prompt.';
  const j = await anthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: SYSTEM,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: userMsg }],
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
  const THEMES = ['t-ink', 't-cream', 't-acid', 't-blue', 't-sun', 't-grape', 't-fire', 't-cobalt', 't-gold'];
  content.theme = THEMES[((doy % THEMES.length) + THEMES.length) % THEMES.length];
  // rotate the poster layout too (loud, but varied) so it never looks templated:
  // bleed = full image + heavy scrim, split = big image over a solid dark text zone,
  // card = maximalist zine hero card. Cycle of 3 vs theme cycle of 9 = many combos.
  const LAYOUTS = ['bleed', 'split', 'card'];
  content.layout = LAYOUTS[((doy % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length];
  console.log('theme:', content.theme, '| layout:', content.layout);

  // AI hero image color world per theme (all 9 dark neon palettes)
  const ACCENT = {
    't-ink': 'hot magenta-pink',
    't-cream': 'acid lime-green',
    't-acid': 'electric cyan',
    't-blue': 'vivid teal',
    't-sun': 'blazing orange',
    't-grape': 'ultra violet',
    't-fire': 'searing red',
    't-cobalt': 'electric blue',
    't-gold': 'molten gold',
  };
  const PHOTO_Q = ['marketing team meeting in modern office', 'digital marketing analytics on a screen', 'business strategy whiteboard session', 'advertising creative team collaborating', 'startup founders working late at night', 'social media manager using smartphone closeup', 'data dashboard charts on a monitor', 'marketer presenting to executives in boardroom', 'designer working on laptop closeup', 'modern tech office team candid'];
  {
    const topic = String((content.slides[0] && content.slides[0].h) || content.caption)
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
    const useReal = !!process.env.PEXELS_API_KEY && (doy % 2 === 0); // ~every other day: real photo
    try {
      let bg = null;
      if (useReal) {
        bg = await genStockPhoto(PHOTO_Q[((doy % PHOTO_Q.length) + PHOTO_Q.length) % PHOTO_Q.length]);
        if (bg) content.bgreal = true;
      }
      if (!bg) bg = await genBackground(content.art, topic, ACCENT[content.theme] || 'high-contrast neon accents on near-black');
      if (bg) content.bg = bg;
    } catch (err) { console.log('bg: skipped (' + err.message + ')'); }
  }

  // Human-feel publish times (Israel local minutes-from-midnight): vary daily within
  // 18:00-21:00, never the same exact minute, and stagger the networks so they never
  // post simultaneously (a dead automation giveaway).
  function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => (h = Math.imul(h ^ (h >>> 15), 2246822519), (h >>> 0) / 4294967296); }
  const rnd = seeded(date + 'pinkmedia');
  const igMin = 18 * 60 + Math.floor(rnd() * 90);                 // 18:00 - 19:30
  const liMin = Math.min(igMin + 18 + Math.floor(rnd() * 42), 21 * 60); // +18..59m
  const fbMin = Math.min(liMin + 16 + Math.floor(rnd() * 40), 21 * 60); // after LI
  content.pub_ig = igMin; content.pub_li = liMin; content.pub_fb = fbMin;
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  console.log('publish (Israel):', 'IG ' + hm(igMin), 'LI ' + hm(liMin), 'FB ' + hm(fbMin));

  // English adaptation for LinkedIn (international audience). Never blocks the carousel.
  try {
    const er = await anthropic({
      model: 'claude-sonnet-4-6', max_tokens: 3000,
      system: 'You are a senior marketing, AI and PPC strategist at Pink Media. Adapt the given Hebrew carousel into a professional ENGLISH LinkedIn carousel for an international executive audience. Same story, same 7-slide structure, same sharp senior voice. Not a literal translation, a strong English rewrite. Ironclad: no em dash, no double hyphen, no rule-of-three padding, no generic openers. Return ONLY minified JSON: {"caption":"<english caption + 3-5 hashtags>","slides":[{"type":"hook|content|cta","kicker":"...","eyebrow":"...","h":"short headline","sub":"1-2 short lines","pill":"cta only"}]} with exactly 7 slides.',
      messages: [{ role: 'user', content: 'Hebrew caption:\n' + content.caption + '\n\nHebrew slides JSON:\n' + JSON.stringify(content.slides) }],
    });
    const et = (er.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const ea = et.indexOf('{'), eb = et.lastIndexOf('}');
    const en = JSON.parse(et.slice(ea, eb + 1));
    if (en && en.caption && Array.isArray(en.slides) && en.slides.length === 7) {
      en.caption = clean(en.caption);
      en.slides.forEach((sl) => { ['kicker', 'eyebrow', 'h', 'sub', 'pill'].forEach((k) => { if (sl[k] != null) sl[k] = clean(sl[k]); }); });
      content.en = en;
      console.log('english adaptation ok:', en.caption.slice(0, 70));
    }
  } catch (e) { console.log('english adaptation skipped:', e.message); }

  const dir = path.join(__dirname, 'content');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, date + '.json'), JSON.stringify(content, null, 2));
  console.log('content written for', date, '- caption:', content.caption.slice(0, 80));

  execFileSync('node', [path.join(__dirname, 'render.js'), date], { stdio: 'inherit' });
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
