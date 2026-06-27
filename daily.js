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

Produce ONE Instagram carousel (exactly 7 slides) that is a VALUE TEASER for ONE specific, concrete RESOURCE you are giving away for free: an AI tools list, an AI skills / workflows pack, a prompt pack, an automation recipe, a ready checklist, a step-by-step playbook, or a framework, on AI for marketing and business. THIS IS NOT A NEWS POST. The whole carousel builds desire for that one resource, and commenting the keyword is the natural, obvious way to GET that exact resource. The post and the lead magnet are ONE promise, never disconnected. Pick something a busy manager would genuinely want to save and use this week. Winning formats: 'N כלי AI ש...' , 'N סקילים / פרומפטים שכל [קהל] חייב', 'N דרכים ל[תוצאה] עם AI', 'הצ'קליסט ל...', 'איך עשיתי [תוצאה] עם AI'. ARTIFICIAL INTELLIGENCE is the primary lane (AI tools, AI for marketing, AI automation); use SEO or PPC only through a clearly actionable AI angle. Optimize above all for COMMENTS, then saves and shares: the value must feel worth commenting to receive.

IRONCLAD WRITING RULES (obey all):
- Zero AI style. Banned: 'בעידן הדיגיטלי של היום', 'תחזיקו חזק', 'צללו פנימה', 'הנוף המשתנה', 'חשוב לזכור', and any generic opener, drama or cliche. No em dash, no double hyphen, no rule-of-three patterns, no 'במילים אחרות'.
- Tone: eye-level, direct, sharp, like a professional WhatsApp message to a CEO whose budget you manage.
- Value, not news. Teach something genuinely useful and make them crave the FULL resource. Lead with the concrete benefit, never with a headline recap.
- Clean, short lines.

STRUCTURE across the 7 slides: slide1 = the hook = a SHORT, punchy promise of the resource and its payoff, like a magazine cover line of just a few words. NEVER a long sentence, NEVER a news statement, NEVER a number-of-people / funding / announcement framing (e.g. good: '5 כלי AI שמכפילים מכירות', '6 פרומפטים ששווים יותר מעובד', '3 דרכים להכפיל לידים עם AI'). slides2-6 = TEASE the value: reveal only 2-4 of the items briefly, or the expensive problem this kills and why it matters, just enough that they MUST have the full thing. HOLD BACK the complete list / steps / prompts for the DM, do not give it all away on the slides. slide6 = push the desire to its peak (the one item or result that makes it irresistible). slide7 = the ENGAGEMENT CTA: comment the keyword to receive the FULL resource in the DM (spec below).
FORMAT: pick a value format and vary it day to day: tools list, skills / prompt pack, how-to playbook, ready checklist, 'X ways to Y', a before/after. ALWAYS a giveable resource, NEVER a news take.
ENGAGEMENT: the post must make people COMMENT to get the resource, not just read. The slide1 promise must be specific and valuable enough that commenting feels obvious. first_comment MUST end with one short, direct question to the audience.

ENGAGEMENT CTA (slide 7 + caption ending): the single goal of slide 7 is to get a comment. First output "cta_keyword" = ONE word chosen ONLY from this exact set [מדריך, סקיל, שלח, שגר, AI, SEO], whichever best fits THIS post (an SEO topic -> "SEO"; an AI tool/skill -> "סקיל" or "AI"; otherwise -> "מדריך"). Use that SAME chosen word everywhere below. Slide 7 fields: "h" = one short, direct Hebrew question offering a CONCRETE lead magnet tied to THIS exact story (a guide / checklist / prompt list / protection plan), e.g. 'רוצים את המדריך המלא איך מתכוננים לשינוי הזה?'. Never a generic 'want to learn more'. "sub" = exactly one short line: comment your chosen word and it arrives in DM. "pill" = exactly your chosen word. Also output "cta_question" = that same question as plain text. The lead magnet itself ALWAYS lives on the Pink Media site https://pinkmedia.co.il . The Hebrew caption must END (right before the hashtags) with the question on its own line, then on the next line: תגיבו "<your chosen word>" ושלחתי לכם אותו ישר ל-DM.

DM GUIDE (the lead magnet itself): output "dm_guide" = array of 4-6 Hebrew strings. This is the actual guide a commenter receives in private DM, so it must FULLY DELIVER on the slide-7 promise: concrete, practical, immediately usable steps / checklist / prompts about today's story, written at the same senior level. Each string = one DM message bubble, under 850 characters, short lines. First bubble opens with one line confirming exactly what they are getting. One bubble MUST include the link to the full guide and tools on the Pink Media site: https://pinkmedia.co.il . Last bubble ends with: רוצה שנבנה לך את זה בעסק? כתבו כאן "מעוניין" ונדבר. Same ironclad writing rules apply.

ART DIRECTION: also output "art" = ONE vivid English sentence describing a CINEMATIC EDITORIAL ADVERTISING PHOTOGRAPH in the Pink Media brand look: a single confident human subject (executive / creator / professional), lit by BOLD DUAL GEL LIGHTING, a vivid magenta-pink rim light on one side and an electric cobalt-blue rim light on the other, against a near-black studio background with soft volumetric haze, high contrast, deep rich shadows, glossy highlights, shot on an 85mm f1.4 lens, ultra-detailed realistic skin, premium fashion-campaign craft, with clean negative space across the top third for text. The subject's pose / expression should evoke the resource's benefit (confidence, control, an edge). MUST look like a real photograph, NEVER 3D / CGI / illustration / render. No text, no readable screens or UI, no letters, numbers, logos or watermark. One concrete sentence.

GROWTH TAGGING: in the Hebrew caption, naturally weave in @mentions of 0-3 REAL, well-known Instagram handles of the actual subjects of the story (the company, product or person being discussed) so Instagram links and notifies them. Examples of safe handles: @google, @openai, @meta, @microsoft, @amazon, @anthropicai, @perplexity.ai. ABSOLUTE RULE: only handles you are highly confident exist as official accounts. Never invent a handle. Never tag for spam or unrelated mentions. If no obvious subjects, output 0 mentions. Use real-world editorial judgement: write "OpenAI" inline as "@openai" the FIRST time it appears, then normal text the rest. Do not pile mentions at the end; weave them into the sentence.

FIRST COMMENT: also output "first_comment" = ONE Hebrew sentence (about 120-180 chars) that delivers a STRONG extra insight NOT already in the 7 slides. It posts immediately as the first comment on the Instagram carousel and is meant to push engagement: the deeper truth behind the headline, a contrarian counter-take, the next-order effect a CEO will care about. Sharp and concrete. No generic openers, no "במילים אחרות", no em dash, no rule-of-three. End with one short hook question if it fits naturally.

OUTPUT: return ONLY valid minified JSON, no markdown, no commentary, exactly this shape:
{"caption":"<hebrew caption with @mentions woven in, ending with the engagement question + the תגיבו מדריך line, then 5-7 hashtags starting with #פינקמדיה>","cta_keyword":"<ONE word, ONLY from: מדריך / סקיל / שלח / שגר / AI / SEO>","cta_question":"<the slide-7 question, plain text>","dm_guide":["<bubble 1>","<bubble 2>","..."],"art":"<one vivid English sentence: the single unforgettable conceptual hero image for this story, strong visual metaphor, no text/UI>","first_comment":"<one strong Hebrew sentence with the deeper insight, ending with a short question to the audience>","brand":{"kicker":"Pink Media","handle":"@bankhaltershay","sub":"פינק מדיה · שיווק דיגיטלי"},"slides":[{"type":"hook","kicker":"...","eyebrow":"...","h":"... <mark>one phrase</mark> ...","sub":"1-2 short lines"},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"..."},{"type":"content","kicker":"...","eyebrow":"...","h":"...","sub":"one action for tomorrow"},{"type":"cta","kicker":"Pink Media","eyebrow":"...","h":"<the engagement question>","sub":"<one line: comment מדריך, get it in DM>","pill":"מדריך"}]}
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
    + '. A cinematic editorial advertising photograph with high-end fashion-campaign craft, shot on an 85mm f1.4 lens, real photographic detail and real skin texture. BOLD DUAL GEL LIGHTING is mandatory: a vivid magenta-pink rim light on one side and an electric cobalt-blue rim light on the other, against a near-black studio background with soft volumetric haze. High contrast, deep rich shadows, glossy highlights, saturated and premium. A single confident human subject whose pose evokes control and an edge. Clean negative space across the top third for text. Scroll-stopping and unforgettable. It MUST look like a real photograph, NOT an illustration, NOT a 3D render, NOT CGI. No text, no readable screens or interfaces, no letters, no numbers, no logos, no watermark, no border. Vertical portrait composition.';
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
  // Idempotency: if a post for today is already queued and not yet published, skip
  // (so a manual verification run + the daily cron never double-post). FORCE=1 overrides.
  if (process.env.FORCE !== '1') {
    try {
      const q = await fetch('https://eu1.make.com/api/v2/data-stores/124678/data?pg%5Blimit%5D=100', { headers: { 'Authorization': 'Token ' + process.env.MAKE_API_TOKEN } });
      const qj = await q.json();
      const dup = (qj.records || []).some((r) => r.data && r.data.date === date && r.data.posted !== true);
      if (dup) { console.log('SKIP: a post for ' + date + ' is already queued (unposted). Use FORCE=1 to override.'); return; }
    } catch (e) { console.log('idempotency check skipped: ' + e.message); }
  }
  const doy = Math.floor((Date.parse(date + 'T00:00:00Z') - Date.parse(date.slice(0, 4) + '-01-01T00:00:00Z')) / 86400000);
  // variety: collect recent posts' topics so the model does not repeat itself
  let avoid = [];
  try {
    const cdir = path.join(__dirname, 'content');
    const files = fs.existsSync(cdir) ? fs.readdirSync(cdir).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().slice(-6) : [];
    avoid = files.map(f => { try { const c = JSON.parse(fs.readFileSync(path.join(cdir, f))); return String((c.slides && c.slides[0] && c.slides[0].h) || c.caption || '').replace(/<[^>]+>/g, '').trim().slice(0, 90); } catch (_) { return ''; } }).filter(Boolean);
  } catch (_) {}
  const avoidTxt = avoid.length ? ' Do NOT repeat the subject or angle of these recent posts: ' + avoid.map(a => '"' + a + '"').join('; ') + '. Pick a clearly different subject. AI is the primary lane, so lead with a fresh AI angle on most days and avoid repeating the same AI sub-topic back to back.' : '';
  // Compact prior-post performance briefing (free, local — empty string if the
  // insights collector has not produced data yet).
  let insightsTxt = '';
  try { const ins = require('./insights').summary(); if (ins) insightsTxt = '\n\n' + ins + '\n\n'; } catch (_) {}
  // market-intel briefing (trending angles, hook patterns) — additive
  let intelTxt = '';
  try { const it = require('./intel').summary(); if (it) intelTxt = '\n\n' + it + '\n\n'; } catch (_) {}
  void intelTxt; // market-intel briefing intentionally NOT injected (it pushes news; we want pure value)
  const userMsg = 'Today is ' + date + '. Create ONE practical, high-VALUE Instagram carousel that TEACHES the audience how to USE AI tools for digital marketing or to grow their business: for example a specific AI tools list, a ready-to-paste prompt pack, an AI workflow / automation, or a step-by-step technique they can apply today. This is PURE how-to value, NOT news, NOT an announcement, launch, funding round or any "what happened this week" story. Use web_search ONLY to keep tool names and capabilities accurate and current, NEVER to anchor the post to a news event. Pick a concrete, genuinely useful topic a busy business owner would save and act on this week. Tease the value across the slides and HOLD the full version for the DM guide.' + avoidTxt + insightsTxt + ' Output ONLY the content JSON described in the system prompt.';
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
  if (content.first_comment) content.first_comment = clean(content.first_comment);
  content.slides.forEach((sl) => { ['kicker', 'eyebrow', 'h', 'sub', 'pill'].forEach((k) => { if (sl[k] != null) sl[k] = clean(sl[k]); }); });
  if (content.cta_question) content.cta_question = clean(content.cta_question);
  if (Array.isArray(content.dm_guide)) content.dm_guide = content.dm_guide.map(clean).filter(Boolean);

  // Engagement mechanic — enforced in code so a model slip never breaks the ManyChat
  // trigger. The keyword MUST be one of Shay's 6 configured ManyChat triggers; the model
  // picks the one that best fits the post, code validates and falls back to "מדריך".
  const ALLOWED_KW = ['מדריך', 'סקיל', 'שלח', 'שגר', 'AI', 'SEO'];
  const KEYWORD = (content.cta_keyword && ALLOWED_KW.indexOf(String(content.cta_keyword).trim()) >= 0)
    ? String(content.cta_keyword).trim() : 'מדריך';
  const SITE = 'https://pinkmedia.co.il';
  const cta = content.slides[6];
  cta.type = 'cta';
  cta.pill = KEYWORD;
  if (!content.cta_question) content.cta_question = String(cta.h || '').replace(/<[^>]+>/g, '').trim();
  if (!cta.sub || cta.sub.indexOf(KEYWORD) < 0) cta.sub = 'תגיבו "' + KEYWORD + '" ואני שולח לכם אותו ישר ל-DM';
  if (content.caption.indexOf(KEYWORD) < 0) {
    const q = content.cta_question || 'רוצים את המדריך המלא על זה?';
    const tags = content.caption.match(/(\s*#[^\s#]+)+\s*$/);
    const base = tags ? content.caption.slice(0, tags.index).trim() : content.caption.trim();
    content.caption = base + '\n\n' + q + '\nתגיבו "' + KEYWORD + '" ושלחתי לכם אותו ישר ל-DM' + (tags ? '\n\n' + tags[0].trim() : '');
  }
  if (!Array.isArray(content.dm_guide) || !content.dm_guide.length) {
    // never ship a comment bait without a deliverable: fall back to the slides' content
    content.dm_guide = content.slides.slice(1, 6)
      .map((s, i) => (i + 1) + '. ' + String(s.h || '').replace(/<[^>]+>/g, '') + '\n' + String(s.sub || ''))
      .concat(['המדריך המלא והכלים באתר: ' + SITE, 'רוצה שנבנה לך את זה בעסק? כתבו כאן "מעוניין" ונדבר.']);
  }
  // the guide always points to the Pink Media site — append the link if the model omitted it
  if (Array.isArray(content.dm_guide) && content.dm_guide.length && !content.dm_guide.some((b) => /pinkmedia\.co\.il/.test(String(b)))) {
    content.dm_guide.splice(Math.max(0, content.dm_guide.length - 1), 0, 'המדריך המלא, הכלים והדוגמאות מחכים לך כאן: ' + SITE);
  }
  if (process.env.DRY_RUN === '1') { console.log('=== DRY RUN CONTENT ===\n' + JSON.stringify(content, null, 2)); process.exit(0); }

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
  // Reel posts ~2-3h after the IG carousel so the same account is not posting back
  // to back (IG suppresses near-simultaneous posts from the same handle). Lands in
  // the second evening peak window (21:00 - 22:30 Israel).
  const reelMin = Math.min(21 * 60 + Math.floor(rnd() * 90), 22 * 60 + 30);
  content.pub_ig = igMin; content.pub_li = liMin; content.pub_fb = fbMin; content.pub_reel = reelMin;
  const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  console.log('publish (Israel):', 'IG ' + hm(igMin), 'LI ' + hm(liMin), 'FB ' + hm(fbMin), 'REEL ' + hm(reelMin));

  // English adaptation for LinkedIn (international audience). Never blocks the carousel.
  try {
    const er = await anthropic({
      model: 'claude-sonnet-4-6', max_tokens: 3000,
      system: 'You are a senior marketing, AI and PPC strategist at Pink Media. Adapt the given Hebrew carousel into a professional ENGLISH LinkedIn carousel for an international executive audience. Same story, same 7-slide structure, same sharp senior voice. Not a literal translation, a strong English rewrite. Slide 7: the Hebrew version uses an Instagram comment-keyword mechanic; do NOT copy it. Write a natural LinkedIn executive CTA instead (share your take in the comments / follow / DM). Ironclad: no em dash, no double hyphen, no rule-of-three padding, no generic openers. Return ONLY minified JSON: {"caption":"<english caption + 3-5 hashtags>","slides":[{"type":"hook|content|cta","kicker":"...","eyebrow":"...","h":"short headline","sub":"1-2 short lines","pill":"cta only"}]} with exactly 7 slides.',
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
