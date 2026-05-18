// Pink Media — rebuild the 4 pillar HUB posts as substantial, AI-optimized cornerstone pages.
// Usage: node hubs.js          rebuild all 4 (sequential)
//        node hubs.js 858      rebuild one (use this to avoid timeouts)
// Preserves the <!-- PINK-CLUSTER --> marker AND any cluster <li> already appended.
// No generic CTA. SENTINEL-delimited model output (large HTML never breaks parsing).
const AK = process.env.ANTHROPIC_API_KEY;
const OK = process.env.OPENAI_API_KEY;
const WP_SITE = (process.env.WP_SITE || 'https://pinkmedia.co.il').replace(/\/$/, '');
const WP_USER = process.env.WP_USER, WP_PASS = process.env.WP_APP_PASS;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
if (!AK || !WP_USER || !WP_PASS) { console.error('HUBS_SKIP: missing env'); process.exit(2); }
const auth = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');
const sharp = require('sharp');
const MAX_BYTES = 200 * 1024;
async function compress(buf) {
  let base;
  try { base = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).toBuffer(); }
  catch (_) { base = buf; }
  for (const q of [82, 72, 62, 52, 44, 36, 30]) {
    let out;
    try { out = await sharp(base).jpeg({ quality: q, mozjpeg: true }).toBuffer(); }
    catch (_) { out = await sharp(base).jpeg({ quality: q }).toBuffer(); }
    if (out.length <= MAX_BYTES) return out;
  }
  return await sharp(buf).resize({ width: 1000, fit: 'inside' }).jpeg({ quality: 34 }).toBuffer();
}

const HUBS = [
  { id: 858, cat: 10, label: 'AI ו-GEO', brief: 'איך מותגים מופיעים ונבחרים בתשובות של ChatGPT, Perplexity ו-AI Overviews של גוגל; GEO ו-AEO מול SEO; מדידת נוכחות במנועי AI.' },
  { id: 859, cat: 11, label: 'Google Ads ו-PPC', brief: 'ניהול תקציב נכון ב-Performance Max ו-AI Max, אותות המרה, מתי לתת לאוטומציה של גוגל לנהל ומתי לא.' },
  { id: 860, cat: 12, label: 'SEO בעידן ה-AI', brief: 'קידום אורגני כשהסף עלה: סמכות נושאית, מניעת קניבליזציה, תוכן שגם בני אדם וגם מודלים סומכים עליו.' },
  { id: 861, cat: 13, label: 'אוטומציה ו-AI לשיווק', brief: 'תהליכי עבודה אמיתיים, חיבור מודלים ל-CRM ולרשתות, איפה אוטומציה מכפילה תפוקה ואיפה היא שוברת.' },
];
const OTHER = (id) => HUBS.filter(h => h.id !== id);

async function wp(method, p, body) {
  const r = await fetch(WP_SITE + p, { method, headers: { Authorization: auth, 'User-Agent': UA, 'Content-Type': 'application/json' }, body: body != null ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error('WP ' + method + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 160));
  return j;
}
async function anthropic(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error('Anthropic ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
async function genImage(prompt) {
  if (!OK) return null;
  const full = 'Premium editorial cover illustration for a marketing pillar page. ' + prompt + '. Sophisticated, modern, brand-safe, clean composition, soft depth. ABSOLUTELY NO text, letters, numbers, logos, charts or UI.';
  for (const m of ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']) {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: 'Bearer ' + OK, 'content-type': 'application/json' }, body: JSON.stringify({ model: m, prompt: full, size: '1536x1024', n: 1 }) });
      const j = await r.json(); if (!r.ok) continue;
      const d = (j.data && j.data[0]) || {};
      if (d.b64_json) return Buffer.from(d.b64_json, 'base64');
      if (d.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
    } catch (_) {}
  }
  return null;
}
async function upload(buf, fn, alt) {
  const jpg = await compress(buf);
  const r = await fetch(WP_SITE + '/wp-json/wp/v2/media', { method: 'POST', headers: { Authorization: auth, 'User-Agent': UA, 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="' + fn.replace(/\.\w+$/, '') + '.jpg"' }, body: jpg });
  if (!r.ok) throw new Error('media ' + r.status); const j = await r.json();
  try { await wp('POST', '/wp-json/wp/v2/media/' + j.id, { alt_text: alt, title: alt }); } catch (_) {}
  return { id: j.id, src: j.source_url };
}
function parseBlocks(t, keys) {
  t = t.replace(/```[a-z]*\n?/gi, '');
  const out = {};
  for (const k of keys) {
    const re = new RegExp('<<' + k + '>>[ \\t]*\\n?([\\s\\S]*?)(?=\\n<<(?:' + keys.join('|') + ')>>|$)');
    const m = t.match(re); if (m) out[k] = m[1].trim();
  }
  return out;
}
const strip = (t) => typeof t === 'string' ? t.replace(/\s*[—–]\s*/g, ', ').replace(/--+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim() : t;
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rebuild(H) {
  const cur = await wp('GET', '/wp-json/wp/v2/posts/' + H.id + '?context=edit&_fields=content');
  const raw = (cur.content && cur.content.raw) || '';
  let preserved = '';
  const m = raw.match(/<!-- PINK-CLUSTER -->([\s\S]*?)<\/ul>/);
  if (m) preserved = m[1];

  const links = [
    'עמוד שירות GEO :: ' + WP_SITE + '/geo/',
    'SEO לאיקומרס :: ' + WP_SITE + '/seo-ecommerce/',
    'עבודה איתנו :: ' + WP_SITE + '/work_with_us/',
    ...OTHER(H.id).map(o => 'אשכול ' + o.label + ' :: ' + WP_SITE + '/?p=' + o.id),
  ].join('\n');

  const SYS = `You are a senior strategist at Pink Media writing a PILLAR (cornerstone) page for pinkmedia.co.il. Hebrew, RTL. Audience: Israeli CEOs and marketing managers.
This is the authoritative overview for the whole topic: 700-950 words, deep, genuinely useful, strong point of view. Not a list of links, not thin.
AI-ENGINE OPTIMIZED: open with a 2-3 sentence direct definition/answer to "what is this and why it matters" (extractable by AI models). Question-style H2s. Short self-contained citable paragraphs. Specific, no invented statistics.
IRONCLAD: zero AI-writing tells. No em dash, no double hyphen, no "במילים אחרות", no generic openers, no rule-of-three padding, NO generic "contact us" CTA paragraph.
INTERNAL LINKS: weave 3-4 contextual links from the menu into the prose (sibling pillars + relevant service page), descriptive anchors.
TABLES: if a comparison or decision matrix makes the overview clearer, include one clean semantic HTML <table> with <thead> and <tbody> (no inline styles, no width attrs). Only when it truly helps.
RESPONSE FORMAT: output EXACTLY these blocks, each header alone on its line, NO JSON, NO code fences:
<<TITLE>>
(<=60 char H1)
<<EXCERPT>>
(<=150 char meta)
<<IMG>>
english image prompt ::: hebrew alt text
<<FAQ>>
question 1 ||| answer 1
question 2 ||| answer 2
question 3 ||| answer 3
<<HTML>>
(semantic HTML: <p><h2><h3><ul>; one __IMG__ marker near the top; contains menu links; no <h1>; no inline styles; no CTA)`;
  const usr = `Pillar: ${H.label}\nScope: ${H.brief}\nInternal link menu:\n${links}\nWrite the pillar page now.`;

  const KEYS = ['TITLE', 'EXCERPT', 'IMG', 'FAQ', 'HTML'];
  let bl = parseBlocks(await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4500, system: SYS, messages: [{ role: 'user', content: usr }] }), KEYS);
  if (!bl.HTML || bl.HTML.length < 500 || !bl.TITLE) {
    bl = parseBlocks(await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4500, system: SYS, messages: [{ role: 'user', content: usr + '\n\nReturn the sentinel blocks exactly as specified.' }] }), KEYS);
  }
  const title = strip(bl.TITLE), excerpt = strip(bl.EXCERPT);
  let htmlBody = strip(bl.HTML);
  if (!htmlBody || htmlBody.length < 500) throw new Error('hub ' + H.id + ' too thin / unparseable');
  const [iprompt, ialt] = String(bl.IMG || '').split(':::').map(s => (s || '').trim());
  const faq = String(bl.FAQ || '').split('\n').map(l => l.split('|||')).filter(x => x.length === 2).map(x => ({ q: strip(x[0].trim()), a: strip(x[1].trim()) }));

  let featured = 0;
  try {
    const b = await genImage(iprompt || H.label);
    if (b) { const u = await upload(b, 'hub-' + H.id + '.png', ialt || title); featured = u.id; htmlBody = htmlBody.replace('__IMG__', '<figure class="wp-block-image size-large"><img src="' + u.src + '" alt="' + esc(ialt || title) + '" loading="lazy"/></figure>'); }
  } catch (e) { console.error('hub img skip ' + e.message); }
  htmlBody = htmlBody.replace(/__IMG__/g, '');

  htmlBody += '<h2>מדריכים מורחבים באשכול</h2><ul class="pink-cluster"><!-- PINK-CLUSTER -->' + preserved + '</ul>';
  if (faq.length) {
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
    htmlBody += '<h2>שאלות נפוצות</h2>' + faq.map(f => '<h3>' + esc(f.q) + '</h3><p>' + esc(f.a) + '</p>').join('') + '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>';
  }
  const payload = { title, content: htmlBody, excerpt, categories: [H.cat], meta: { _yoast_wpseo_metadesc: excerpt } };
  if (featured) payload.featured_media = featured;
  await wp('POST', '/wp-json/wp/v2/posts/' + H.id, payload);
  console.log('HUB_OK ' + H.id + ' "' + title + '" words~' + htmlBody.replace(/<[^>]+>/g, ' ').split(/\s+/).length + ' faq=' + faq.length + ' featured=' + featured + ' preserved=' + (preserved ? 'yes' : 'no'));
}

(async () => {
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
  for (const H of HUBS) { if (only && H.id !== only) continue; try { await rebuild(H); } catch (e) { console.error('HUB_FAIL ' + H.id + ': ' + e.message); } }
})();
