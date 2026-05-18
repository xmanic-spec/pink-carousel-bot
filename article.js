// Pink Media — daily long-form article publisher (runs on Hetzner; manual until Shay OKs autonomous).
// Usage: node article.js <YYYY-MM-DD>            -> classify/anti-cannibalize/create or update
//        FORCE_POST_ID=863 node article.js <date> -> regenerate that exact post in place (fix mode)
// Article goals: medium depth (900-1200w, value not padding), AI-engine optimized (lead answer,
// question H2s, FAQ + FAQPage JSON-LD), >=2 in-body images, >=4 contextual internal links,
// NO generic repeated CTA. Appends to the pillar HUB. Never fatally blocks the carousel.
const fs = require('fs');
const path = require('path');

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const FORCE_POST_ID = process.env.FORCE_POST_ID ? parseInt(process.env.FORCE_POST_ID, 10) : 0;
const AK = process.env.ANTHROPIC_API_KEY;
const OK = process.env.OPENAI_API_KEY;
const WP_SITE = (process.env.WP_SITE || 'https://pinkmedia.co.il').replace(/\/$/, '');
const WP_USER = process.env.WP_USER;
const WP_PASS = process.env.WP_APP_PASS;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const PILLARS = {
  'ai-geo': { cat: 10, hub: 858, label: 'AI ו-GEO' },
  'google-ads-ppc': { cat: 11, hub: 859, label: 'Google Ads ו-PPC' },
  'seo-ai-era': { cat: 12, hub: 860, label: 'SEO בעידן ה-AI' },
  'marketing-automation-ai': { cat: 13, hub: 861, label: 'אוטומציה ו-AI לשיווק' },
};
// Stable internal-link targets on pinkmedia.co.il (service/landing pages) for the topical web + soft funnel.
const PAGES = {
  geo: 'https://pinkmedia.co.il/geo/',
  seoEcom: 'https://pinkmedia.co.il/seo-ecommerce/',
  workWithUs: 'https://pinkmedia.co.il/work_with_us/',
  blog: 'https://pinkmedia.co.il/blog/',
};

if (!AK || !WP_USER || !WP_PASS) { console.error('ARTICLE_SKIP: missing ANTHROPIC_API_KEY / WP_USER / WP_APP_PASS'); process.exit(2); }
const authHeader = 'Basic ' + Buffer.from(WP_USER + ':' + WP_PASS).toString('base64');

async function wp(method, p, body) {
  const res = await fetch(WP_SITE + p, {
    method,
    headers: { 'Authorization': authHeader, 'User-Agent': UA, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let j = null; try { j = JSON.parse(txt); } catch (_) {}
  if (!res.ok) throw new Error('WP ' + method + ' ' + p + ' -> ' + res.status + ' ' + txt.slice(0, 200));
  return j;
}
async function wpUploadBuffer(buf, filename, alt) {
  const res = await fetch(WP_SITE + '/wp-json/wp/v2/media', {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'User-Agent': UA, 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="' + filename + '"' },
    body: buf,
  });
  if (!res.ok) throw new Error('media ' + res.status);
  const j = await res.json();
  try { await wp('POST', '/wp-json/wp/v2/media/' + j.id, { alt_text: alt, title: alt, caption: alt }); } catch (_) {}
  return { id: j.id, src: j.source_url };
}
async function anthropic(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': AK, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('Anthropic ' + res.status + ': ' + JSON.stringify(j).slice(0, 240));
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
// OpenAI image (gpt-image-2 -> 1.5 -> 1). Returns Buffer or null. Never throws.
async function genImage(prompt, size) {
  if (!OK) return null;
  const full = 'Premium editorial illustration for a marketing article. ' + prompt + '. Sophisticated, modern, brand-safe, soft depth and clean composition. ABSOLUTELY NO text, letters, words, numbers, logos, charts or UI.';
  for (const model of ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1']) {
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + OK, 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: full, size: size || '1536x1024', n: 1 }),
      });
      const j = await r.json();
      if (!r.ok) { console.error('img ' + model + ' ' + r.status); continue; }
      const d = (j.data && j.data[0]) || {};
      if (d.b64_json) return Buffer.from(d.b64_json, 'base64');
      if (d.url) return Buffer.from(await (await fetch(d.url)).arrayBuffer());
    } catch (e) { console.error('img ' + model + ' err ' + e.message); }
  }
  return null;
}
function extractJson(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return (a < 0 || b <= a) ? null : t.slice(a, b + 1); }
function norm(s) { return String(s || '').replace(/[֑-ׇ]/g, '').replace(/<[^>]+>/g, ' ').toLowerCase().replace(/["'’”“׳״.,:;!?()\-]/g, ' ').replace(/\s+/g, ' ').trim(); }
const STOP = new Set('של עם או גם כל לא מה איך מי הכי זה זו את על אל כי אם עד ה ו ב ל ש מ כ מן for the and a to in of is'.split(' '));
function toks(s) { return new Set(norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t))); }
function jaccard(a, b) { const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0; let i = 0; for (const t of A) if (B.has(t)) i++; return i / (A.size + B.size - i); }
const stripTells = (t) => typeof t === 'string' ? t.replace(/\s*[—–]\s*/g, ', ').replace(/--+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim() : t;
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

(async () => {
  const cfile = path.join(__dirname, 'content', date + '.json');
  const content = JSON.parse(fs.readFileSync(cfile, 'utf8'));
  const slides = content.slides || [];
  const topic = stripTells(String((slides[0] && slides[0].h) || content.caption || '').replace(/<[^>]+>/g, ' ')).slice(0, 160);
  const sourceFacts = slides.map((s, i) => (i + 1) + '. ' + [s.kicker, s.h, s.sub].filter(Boolean).join(' | ')).join('\n');

  // classify pillar + reader query
  let pillar = 'seo-ai-era', query = topic;
  try {
    const cls = await anthropic({
      model: 'claude-sonnet-4-6', max_tokens: 200,
      system: 'Classify a Hebrew marketing topic into ONE pillar slug: ai-geo, google-ads-ppc, seo-ai-era, marketing-automation-ai. Return ONLY {"pillar":"<slug>","query":"<2-6 word Hebrew search query>"}',
      messages: [{ role: 'user', content: 'Topic: ' + topic + '\n' + sourceFacts }],
    });
    const c = JSON.parse(extractJson(cls)); if (PILLARS[c.pillar]) pillar = c.pillar; if (c.query) query = c.query;
  } catch (_) {}
  const P = PILLARS[pillar];
  const hubPost = await wp('GET', '/wp-json/wp/v2/posts/' + P.hub + '?context=edit&_fields=id,link,content');

  // anti-cannibalization
  let existing = [];
  try { existing = await wp('GET', '/wp-json/wp/v2/posts?per_page=20&_fields=id,link,title&search=' + encodeURIComponent(query)) || []; } catch (_) {}
  const HUB_IDS = new Set(Object.values(PILLARS).map(x => x.hub));
  const cand = existing.filter(p => !HUB_IDS.has(p.id) && p.id !== FORCE_POST_ID)
    .map(p => ({ id: p.id, link: p.link, title: (p.title && p.title.rendered) || '', sim: jaccard(query + ' ' + topic, (p.title && p.title.rendered) || '') }))
    .sort((a, b) => b.sim - a.sim);
  const dup = FORCE_POST_ID ? null : cand.find(c => c.sim >= 0.55);
  const related = cand.filter(c => c !== dup && c.sim >= 0.12).slice(0, 3);

  // internal-link menu given to the model (must weave >=4 contextually)
  const otherHubs = Object.values(PILLARS).filter(x => x.hub !== P.hub).map(x => x.label + ' :: ' + WP_SITE + '/?p=' + x.hub);
  const linkMenu = [
    'אשכול ' + P.label + ' (עוגן ראשי) :: ' + hubPost.link,
    ...otherHubs,
    'עמוד שירות GEO :: ' + PAGES.geo,
    'עמוד SEO לאיקומרס :: ' + PAGES.seoEcom,
    'עבודה איתנו :: ' + PAGES.workWithUs,
    ...related.map(r => r.title + ' :: ' + r.link),
  ].join('\n');

  const SYS = `You are a senior marketing/AI/automation strategist at Pink Media writing for pinkmedia.co.il. Hebrew only, RTL. Audience: Israeli CEOs and marketing managers.
Write ONE article of 900-1200 words that gives real, usable value. Not a news recap, not padding. Explain the mechanism correctly, the bottom-line implication, a concrete step-by-step the reader can do this week, and a short checklist.
AI-ENGINE OPTIMIZED (this matters): open with a 1-2 sentence direct, quotable answer to the core question (so AI models can extract it). Use question-style H2 headings phrased the way people actually ask. Keep paragraphs short and self-contained so any paragraph is citable on its own. Be specific and factual; never invent statistics (only use the provided source facts; everything else is reasoning/strategy).
IRONCLAD: zero AI-writing tells. No em dash, no double hyphen, no "במילים אחרות", no generic openers, no rule-of-three padding. Do NOT add any generic "contact us" CTA paragraph.
INTERNAL LINKS: weave at least 4 contextually-relevant internal links INTO the body prose using only URLs from the provided link menu (the pillar hub once, 1-2 sibling hubs where genuinely relevant, the most relevant service page, and at most one soft work-with-us link, only where natural). Anchor text must be descriptive, never "כאן"/"לחצו".
IMAGES: place exactly two markers in the body where an illustration belongs: __IMG1__ near the top after the intro, __IMG2__ mid-article. Provide an English generation prompt and Hebrew alt text for each.
FAQ: end with 3-4 genuine FAQ pairs.
Output ONLY minified JSON: {"title":"<=60 char specific H1","excerpt":"<=150 char concrete meta description","focuskw":"<2-4 word Hebrew>","html":"<semantic HTML body: <p><h2><h3><ul><ol>; contains __IMG1__ and __IMG2__ and >=4 menu links; NO <h1>; NO inline styles; NO CTA paragraph>","dek":"<=90 char hub-list summary","img1_prompt":"<en>","img1_alt":"<he>","img2_prompt":"<en>","img2_alt":"<he>","faq":[{"q":"<he>","a":"<he>"}]}`;
  const usr = `Topic: ${topic}\nPillar: ${P.label}\nSource facts (do not invent beyond these):\n${sourceFacts}\n\nInternal link menu (use real URLs from here, >=4, contextual):\n${linkMenu}\n\nWrite it now. Output ONLY the JSON.`;

  let art;
  {
    const raw = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4500, system: SYS, messages: [{ role: 'user', content: usr }] });
    try { art = JSON.parse(extractJson(raw)); }
    catch (_) {
      const rep = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4500, system: 'Return as one valid minified JSON object, preserve Hebrew, no prose.', messages: [{ role: 'user', content: raw }] });
      art = JSON.parse(extractJson(rep));
    }
  }
  ['title', 'excerpt', 'focuskw', 'html', 'dek'].forEach(k => { art[k] = stripTells(art[k]); });
  if (!art.title || !art.html || art.html.length < 600) throw new Error('article too thin');

  // images: generate, sideload, embed as <figure>; IMG1 = featured
  let featured = content.__featured || 0;
  for (const n of [1, 2]) {
    const mk = '__IMG' + n + '__';
    try {
      const buf = await genImage(art['img' + n + '_prompt'] || (P.label + ' concept'), '1536x1024');
      if (!buf) { art.html = art.html.replace(mk, ''); continue; }
      const up = await wpUploadBuffer(buf, date + '-' + n + '.png', art['img' + n + '_alt'] || art.title);
      if (n === 1) featured = up.id;
      const fig = '<figure class="wp-block-image size-large"><img src="' + up.src + '" alt="' + esc(art['img' + n + '_alt'] || art.title) + '" loading="lazy"/></figure>';
      art.html = art.html.replace(mk, fig);
    } catch (e) { console.error('img' + n + ' skipped ' + e.message); art.html = art.html.replace(mk, ''); }
  }
  art.html = art.html.replace(/__IMG\d__/g, '');

  // guarantee >=4 internal links (fallback if the model under-delivered)
  const intCount = (art.html.match(/href="https?:\/\/pinkmedia\.co\.il/g) || []).length;
  if (intCount < 4) {
    art.html += '<h2>להעמיק בנושא</h2><ul>'
      + '<li><a href="' + hubPost.link + '">' + esc(P.label) + ': המדריך המלא</a></li>'
      + '<li><a href="' + PAGES.geo + '">GEO ואופטימיזציה למנועי AI</a></li>'
      + '<li><a href="' + WP_SITE + '/?p=' + Object.values(PILLARS).find(x => x.hub !== P.hub).hub + '">אשכולות תוכן נוספים</a></li>'
      + '<li><a href="' + PAGES.workWithUs + '">איך פינק מדיה עובדת עם עסקים</a></li></ul>';
  }

  // FAQPage JSON-LD for AI/rich results
  if (Array.isArray(art.faq) && art.faq.length) {
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: art.faq.filter(f => f && f.q && f.a).map(f => ({ '@type': 'Question', name: stripTells(f.q), acceptedAnswer: { '@type': 'Answer', text: stripTells(f.a) } })) };
    const faqHtml = '<h2>שאלות נפוצות</h2>' + ld.mainEntity.map(m => '<h3>' + esc(m.name) + '</h3><p>' + esc(m.acceptedAnswer.text) + '</p>').join('');
    art.html += faqHtml + '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>';
  }

  // create / update
  let post, mode;
  const payload = { title: art.title, content: art.html, excerpt: art.excerpt, status: 'publish', categories: [P.cat], meta: { _yoast_wpseo_metadesc: art.excerpt, _yoast_wpseo_focuskw: art.focuskw } };
  if (featured) payload.featured_media = featured;
  if (FORCE_POST_ID) { post = await wp('POST', '/wp-json/wp/v2/posts/' + FORCE_POST_ID, payload); mode = 'forced-update'; }
  else if (dup) {
    const cur = await wp('GET', '/wp-json/wp/v2/posts/' + dup.id + '?context=edit&_fields=content');
    post = await wp('POST', '/wp-json/wp/v2/posts/' + dup.id, { content: (cur.content && cur.content.raw || '') + '<!-- pink-update ' + date + ' --><h2>עדכון ' + date + '</h2>' + art.html, excerpt: art.excerpt });
    mode = 'updated';
  } else { post = await wp('POST', '/wp-json/wp/v2/posts', payload); mode = 'new'; }
  const url = post.link;

  // append to pillar hub (one controlled edit; newest first; idempotent on URL)
  try {
    const h = await wp('GET', '/wp-json/wp/v2/posts/' + P.hub + '?context=edit&_fields=content');
    let raw = (h.content && h.content.raw) || '';
    if (raw.includes('<!-- PINK-CLUSTER -->') && !raw.includes('href="' + url + '"')) {
      raw = raw.replace('<!-- PINK-CLUSTER -->', '<!-- PINK-CLUSTER --><li><a href="' + url + '">' + esc(art.title) + '</a> — ' + esc(art.dek || art.excerpt || '') + '</li>');
      await wp('POST', '/wp-json/wp/v2/posts/' + P.hub, { content: raw });
    }
  } catch (e) { console.error('hub append skipped: ' + e.message); }

  content.article_url = url; content.article_title = art.title; content.article_pillar = pillar;
  fs.writeFileSync(cfile, JSON.stringify(content, null, 2));
  console.log('ARTICLE_OK ' + JSON.stringify({ mode, pillar, post_id: post.id, url, internal_links: (art.html.match(/href="https?:\/\/pinkmedia/g) || []).length, imgs: (art.html.match(/<img/g) || []).length }));
})().catch((e) => { console.error('ARTICLE_FAIL:', e.message); process.exit(1); });
