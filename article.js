// Pink Media — daily long-form article publisher (runs on Hetzner inside daily.js).
// Usage: node article.js <YYYY-MM-DD>   (reads content/<date>.json from render pipeline)
// Flow: classify topic into one of 4 pillars -> anti-cannibalization check against
// existing pinkmedia.co.il posts -> generate a deep Hebrew article -> publish via WP
// REST -> append it to the pillar HUB post -> write content.article_url back so the
// social captions can link to it. NEVER throws to the caller fatally: daily.js wraps
// this and the carousel must ship even if the article step fails.
const fs = require('fs');
const path = require('path');

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const AK = process.env.ANTHROPIC_API_KEY;
const WP_SITE = (process.env.WP_SITE || 'https://pinkmedia.co.il').replace(/\/$/, '');
const WP_USER = process.env.WP_USER;
const WP_PASS = process.env.WP_APP_PASS;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// pillar slug -> { catId, hubId }. Created 2026-05-18; see pink-social-carousel skill.
const PILLARS = {
  'ai-geo': { cat: 10, hub: 858, label: 'AI ו-GEO' },
  'google-ads-ppc': { cat: 11, hub: 859, label: 'Google Ads ו-PPC' },
  'seo-ai-era': { cat: 12, hub: 860, label: 'SEO בעידן ה-AI' },
  'marketing-automation-ai': { cat: 13, hub: 861, label: 'אוטומציה ו-AI לשיווק' },
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
async function wpUploadMedia(imageUrl, filename, alt) {
  const bin = Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  const res = await fetch(WP_SITE + '/wp-json/wp/v2/media', {
    method: 'POST',
    headers: {
      'Authorization': authHeader, 'User-Agent': UA,
      'Content-Type': 'image/jpeg',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    },
    body: bin,
  });
  if (!res.ok) throw new Error('media upload ' + res.status);
  const j = await res.json();
  try { await wp('POST', '/wp-json/wp/v2/media/' + j.id, { alt_text: alt, title: alt }); } catch (_) {}
  return j.id;
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
function extractJson(t) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); return (a < 0 || b <= a) ? null : t.slice(a, b + 1); }

// Hebrew-aware normalization for cannibalization similarity.
function norm(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/["'’”“׳״.,:;!?()\-]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const STOP = new Set('של עם או גם כל לא מה איך מי הכי זה זו את על אל כי אם עד ה ו ב ל ש מ כ מן for the and a to in of is'.split(' '));
function toks(s) { return new Set(norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t))); }
function jaccard(a, b) {
  const A = toks(a), B = toks(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
const stripTells = (t) => typeof t === 'string'
  ? t.replace(/\s*[—–]\s*/g, ', ').replace(/--+/g, ' ').replace(/[ \t]{2,}/g, ' ').trim() : t;

(async () => {
  const cfile = path.join(__dirname, 'content', date + '.json');
  const content = JSON.parse(fs.readFileSync(cfile, 'utf8'));
  const slides = content.slides || [];
  const topic = stripTells(String((slides[0] && slides[0].h) || content.caption || '').replace(/<[^>]+>/g, ' ')).slice(0, 160);
  const sourceFacts = slides.map((s, i) => (i + 1) + '. ' + [s.kicker, s.h, s.sub].filter(Boolean).join(' | ')).join('\n');

  // 1) classify into a pillar (constrained) + give a clean reader query for the topic.
  const cls = await anthropic({
    model: 'claude-sonnet-4-6', max_tokens: 300,
    system: 'You classify a Hebrew marketing topic into exactly one pillar. Pillars: ai-geo (AI search, GEO/AEO, AI Overviews, ChatGPT/Perplexity visibility), google-ads-ppc (paid media, Performance Max, bidding), seo-ai-era (organic SEO/content/technical in the AI era), marketing-automation-ai (marketing automation, AI tooling, workflows). Return ONLY minified JSON: {"pillar":"<slug>","query":"<the core search query a user would type, Hebrew, 2-6 words>"}',
    messages: [{ role: 'user', content: 'Topic: ' + topic + '\nContext:\n' + sourceFacts }],
  });
  let pillar = 'seo-ai-era', query = topic;
  try { const c = JSON.parse(extractJson(cls)); if (PILLARS[c.pillar]) pillar = c.pillar; if (c.query) query = c.query; } catch (_) {}
  const P = PILLARS[pillar];

  // 2) anti-cannibalization: search existing posts for the core query.
  let existing = [];
  try {
    existing = await wp('GET', '/wp-json/wp/v2/posts?per_page=20&_fields=id,link,title&search=' + encodeURIComponent(query)) || [];
  } catch (_) {}
  const HUB_IDS = new Set(Object.values(PILLARS).map(x => x.hub));
  const cand = existing.filter(p => !HUB_IDS.has(p.id))
    .map(p => ({ id: p.id, link: p.link, title: (p.title && p.title.rendered) || '', sim: jaccard(query + ' ' + topic, (p.title && p.title.rendered) || '') }))
    .sort((a, b) => b.sim - a.sim);
  const dup = cand.find(c => c.sim >= 0.55);
  const related = cand.filter(c => c !== dup && c.sim >= 0.12).slice(0, 3);

  // 3) generate the article (deep, Hebrew, persona, no AI tells, internal links).
  const relList = related.map(r => '- ' + r.title + ' :: ' + r.link).join('\n') || '(none)';
  const SYS = `You are a senior marketing, AI and automation strategist at the agency Pink Media, writing for the official site pinkmedia.co.il. Audience: Israeli CEOs, marketing managers and business owners. Hebrew only, RTL.
Write ONE deep, genuinely useful long-form article (900-1400 words) that expands the given topic far beyond a news summary. Real reader value: explain the mechanism correctly, what it means for the bottom line, a concrete step-by-step the reader can act on this week, a short checklist, and a 3-4 question FAQ. Strong senior point of view.
IRONCLAD: zero AI-writing tells. No em dash, no double hyphen, no "במילים אחרות", no generic openers ("בעידן הדיגיטלי"), no rule-of-three padding, no fabricated statistics. Only use facts from the provided source; everything else must be reasoning/strategy, not invented numbers.
Output ONLY minified JSON: {"title":"<= 60 char Hebrew H1, specific","excerpt":"<=150 char meta description, concrete","focuskw":"<2-4 word Hebrew focus keyword>","html":"<article body as clean semantic HTML: <p>, <h2>, <h3>, <ul>, <ol>; NO <h1>; NO inline styles>","dek":"<=90 char one-line summary for the hub list"}`;
  const usr = `Topic: ${topic}\nPillar: ${P.label}\nResearched source facts (do not invent beyond these):\n${sourceFacts}\n\nPillar hub to reference in-context once (natural anchor): ${WP_SITE} hub post id ${P.hub}.\nRelated existing Pink articles you may link where genuinely relevant:\n${relList}\n\nWrite the article now. In the html, include exactly one contextual link to the pillar hub using href "__HUB__", and where natural up to 2 links to the related articles using their real URLs above. End with a short CTA paragraph linking to ${WP_SITE} ("דברו איתנו בפינק מדיה"). Output ONLY the JSON.`;
  let art;
  {
    const raw = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: SYS, messages: [{ role: 'user', content: usr }] });
    let j = extractJson(raw);
    try { art = JSON.parse(j); } catch (_) {
      const rep = await anthropic({ model: 'claude-sonnet-4-6', max_tokens: 4000, system: 'Return this as one valid minified JSON object, preserve Hebrew exactly, no prose.', messages: [{ role: 'user', content: raw }] });
      art = JSON.parse(extractJson(rep));
    }
  }
  ['title', 'excerpt', 'focuskw', 'html', 'dek'].forEach(k => { art[k] = stripTells(art[k]); });
  if (!art.title || !art.html || art.html.length < 400) throw new Error('article too thin');

  // hub permalink (needed for the in-body __HUB__ anchor)
  const hubPost = await wp('GET', '/wp-json/wp/v2/posts/' + P.hub + '?context=edit&_fields=id,link,content');
  art.html = art.html.replace(/__HUB__/g, hubPost.link);

  // featured image from the carousel background / slide 1 (non-fatal)
  let featured = 0;
  try {
    const img = content.bg || content.img1 || (slides[0] && slides[0].img);
    if (img) featured = await wpUploadMedia(img, date + '-pink.jpg', art.title);
  } catch (e) { console.error('featured skipped:', e.message); }

  // 4) publish OR update (anti-cannibalization)
  let post, mode;
  if (dup) {
    const upd = '<!-- pink-update ' + date + ' --><h2>עדכון ' + date + '</h2>' + art.html;
    const cur = await wp('GET', '/wp-json/wp/v2/posts/' + dup.id + '?context=edit&_fields=content');
    post = await wp('POST', '/wp-json/wp/v2/posts/' + dup.id, { content: (cur.content && cur.content.raw || '') + upd, excerpt: art.excerpt });
    mode = 'updated';
  } else {
    post = await wp('POST', '/wp-json/wp/v2/posts', {
      title: art.title, content: art.html, excerpt: art.excerpt, status: 'publish',
      categories: [P.cat], featured_media: featured || undefined,
      meta: { _yoast_wpseo_metadesc: art.excerpt, _yoast_wpseo_focuskw: art.focuskw },
    });
    mode = 'new';
  }
  const url = post.link;

  // 5) append to the pillar hub (one controlled edit; newest first; idempotent)
  try {
    const h = await wp('GET', '/wp-json/wp/v2/posts/' + P.hub + '?context=edit&_fields=content');
    let raw = (h.content && h.content.raw) || '';
    if (!raw.includes(url)) {
      const li = '<li><a href="' + url + '">' + art.title + '</a> — ' + (art.dek || art.excerpt || '') + '</li>';
      raw = raw.replace('<!-- PINK-CLUSTER -->', '<!-- PINK-CLUSTER -->' + li);
      await wp('POST', '/wp-json/wp/v2/posts/' + P.hub, { content: raw });
    }
  } catch (e) { console.error('hub append skipped:', e.message); }

  // 6) write back so daily.js can link the social captions to it
  content.article_url = url;
  content.article_title = art.title;
  content.article_pillar = pillar;
  fs.writeFileSync(cfile, JSON.stringify(content, null, 2));
  console.log('ARTICLE_OK ' + JSON.stringify({ mode, pillar, post_id: post.id, url }));
})().catch((e) => { console.error('ARTICLE_FAIL:', e.message); process.exit(1); });
