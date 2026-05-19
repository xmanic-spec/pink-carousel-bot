// Pink Media story image renderer. Companion to render.js — produces a single
// 1080x1920 PNG (no video) that re-promotes the carousel as an Instagram Story.
// Reuses the day's hero bg, so there is no extra image generation cost. Returns
// the Cloudinary URL or null on failure (non-blocking).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const CLD_CLOUD = 'duhfkgxer';
const CLD_PRESET = 'fi604fpo';

async function uploadImageToCloudinary(buffer, hint) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), hint + '.png');
  form.append('upload_preset', CLD_PRESET);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/image/upload', { method: 'POST', body: form });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary story upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

function payloadFor(content, lang) {
  return {
    theme: content.theme || 't-blue',
    bg: content.bg || '',
    lang: lang || 'he',
    badge: lang === 'en' ? 'NEW POST' : 'פוסט חדש',
    main: lang === 'en' ? 'NEW POST LIVE' : 'פוסט חדש בפיד',
    sub: lang === 'en' ? 'SWIPE THE FULL CAROUSEL' : 'החליקו לקרוסלה המלאה',
    handle: (content.brand && content.brand.handle) || '@bankhaltershay',
  };
}

async function renderStory(content, date, lang) {
  const tpl = fs.readFileSync(path.join(__dirname, 'story.html'), 'utf8');
  const data = payloadFor(content, lang || 'he');
  const html = tpl.replace(
    /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
    '<script id="data" type="application/json">' + JSON.stringify(data).replace(/<\//g, '<\\/') + '</script>'
  );
  const tmp = path.join(os.tmpdir(), 'story-' + date + '-' + (lang || 'he') + '.html');
  fs.writeFileSync(tmp, html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ type: 'png', fullPage: false });
  await browser.close();
  const url = await uploadImageToCloudinary(buf, 'pink-story-' + date + '-' + (lang || 'he'));
  try { fs.unlinkSync(tmp); } catch (_) {}
  return url;
}

module.exports = { renderStory };

if (require.main === module) {
  (async () => {
    const date = process.argv[2] || new Date().toISOString().slice(0, 10);
    const lang = process.argv[3] || 'he';
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, 'content', date + '.json'), 'utf8'));
    const url = await renderStory(content, date, lang);
    console.log('story ->', url);
  })().catch((e) => { console.error('story FATAL:', e.message); process.exit(1); });
}
