// Pink Media — rebuild the 4 pillar HUB posts as substantial, AI-optimized cornerstone pages.
// Usage: node hubs.js          (rebuild all 4)   |   node hubs.js 858   (one)
// Preserves the existing <!-- PINK-CLUSTER --> marker AND any cluster <li> already appended
// (so article.js keeps working and prior links survive). No generic CTA. Run on Hetzner.
const AK = process.env.ANTHROPIC_API_KEY;
const OK = process.env.OPENAI_API_KEY;
const WP_SITE = (process.env.WP_SITE || 'https://pinkmedia.co.il').replace(/\/$/, '');
const WP_USER = process.env.WP_USER, WP_PASS = process.env.WP_APP_PASS;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
if (!AK || !WP_USER || !WP_PASS) { console.error('HUBS_SKIP: missing env'); process.exit(2); }
const auth = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');

const HUBS = [
  { id: 858, cat: 10, label: 'AI ו-GEO', brief: 'איך מותגים מופיעים ונבחרים בתשובות של ChatGPT, Perplexity ו-AI Overviews של גוגל; GEO/AEO מול SEO; מדידת נוכחות במנועי AI.' },
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
  const r = await fetch(WP_SITE + '/wp-json/wp/v2/media', { method: 'POST', headers: { Authorization: auth, 'User-Agent': UA, 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="' + fn + '"' }, body: buf });
  if (!r.ok) throw new Error('media ' + r.status); const j = await r.json();
  try { await wp('POST', '/wp-json/wp/v2/media/' + j.id, { alt_text: alt, title: alt }); } catch (_) {}
  return { id: j.id, src: j.source_url };
}
const extract = (t) => { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return a < 0 ? null : t.slice(a, b + 1); };
const strip = (t) => typeof t === 'string' ? t.replace(/\s*[—–]\s*/g, ', ').replace(/--+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim() : t;
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rebuild(H) {
  const cur = await wp('GET', '/wp-json/wp/v2/posts/' + H.id + '?context=edit&_fields=content,title');
  const raw = (cur.content && cur.content.raw) || '';
  // preserve any cluster <li> items that already follow the marker
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
This is the authoritative overview page for the whole topic, 700-950 words, deep and genuinely useful, with a strong point of view. Not a list of links, not thin.
AI-ENGINE OPTIMIZED: open with a 2-3 sentence direct definition/answer to "what is this and why it matters" (extractable by AI models). Question-style H2s. Short, self-contained, citable paragraphs. Specific, no invented statistics.
IRONCLAD: zero AI-writing tells. No em dash, no double hyphen, no "במילים אחרות", no generic openers, no rule-of-three padding, NO generic "contact us" CTA paragraph.
INTERNAL LINKS: weave 3-4 contextual links from the provided menu into the prose (sibling pillars and the relevant service page), descriptive anchors only.
FAQ: 3-4 real FAQ pairs.
Output ONLY minified JSON: {"title":"<=60 char H1","excerpt":"<=150 char meta","html":"<semantic HTML: <p><h2><h3><ul>; no <h1>; no inline styles; no CTA; contains a __IMG__ marker once near the top; contains menu links>","img_prompt":"<en>","img_alt":"<he>","faq":[{"q":"<he>","a":"<he>"}]}`;
  const usr = `Pillar: ${H.label}\nScope: ${H.brief}\nInternal link menu:\n${links}\nWrite the pillar page now. Output ONLY JSON.`;
  let a;
  const r1 = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: SYS, messages: [{ role: 'user', content: usr }] });
  try { a = JSON.parse(extract(r1)); }
  catch (_) { const r2 = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: 'Return one valid minified JSON object, preserve Hebrew, no prose.', messages: [{ role: 'user', content: r1 }] }); a = JSON.parse(extract(r2)); }
  ['title', 'excerpt', 'html'].forEach(k => a[k] = strip(a[k]));
  if (!a.html || a.html.length < 500) throw new Error('hub ' + H.id + ' too thin');

  let featured = 0;
  try {
    const b = await genImage(a.img_prompt || H.label);
    if (b) { const u = await upload(b, 'hub-' + H.id + '.png', a.img_alt || a.title); featured = u.id; a.html = a.html.replace('__IMG__', '<figure class="wp-block-image size-large"><img src="' + u.src + '" alt="' + esc(a.img_alt || a.title) + '" loading="lazy"/></figure>'); }
  } catch (e) { console.error('hub img skip ' + e.message); }
  a.html = a.html.replace('__IMG__', '');

  // re-attach the cluster section (preserve prior items + keep marker for article.js)
  a.html += '<h2>מדריכים מורחבים באשכול</h2><ul class="pink-cluster"><!-- PINK-CLUSTER -->' + preserved + '</ul>';

  if (Array.isArray(a.faq) && a.faq.length) {
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: a.faq.filter(f => f && f.q && f.a).map(f => ({ '@type': 'Question', name: strip(f.q), acceptedAnswer: { '@type': 'Answer', text: strip(f.a) } })) };
    a.html += '<h2>שאלות נפוצות</h2>' + ld.mainEntity.map(x => '<h3>' + esc(x.name) + '</h3><p>' + esc(x.acceptedAnswer.text) + '</p>').join('') + '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>';
  }
  const payload = { title: a.title, content: a.html, excerpt: a.excerpt, categories: [H.cat], meta: { _yoast_wpseo_metadesc: a.excerpt } };
  if (featured) payload.featured_media = featured;
  await wp('POST', '/wp-json/wp/v2/posts/' + H.id, payload);
  console.log('HUB_OK ' + H.id + ' "' + a.title + '" words~' + a.html.replace(/<[^>]+>/g, ' ').split(/\s+/).length + ' faq=' + ((a.faq || []).length) + ' featured=' + featured + ' preserved=' + (preserved ? 'yes' : 'no'));
}

(async () => {
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : 0;
  for (const H of HUBS) { if (only && H.id !== only) continue; try { await rebuild(H); } catch (e) { console.error('HUB_FAIL ' + H.id + ': ' + e.message); } }
})();
