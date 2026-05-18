// Pink Media daily carousel renderer (cloud-portable: Playwright only, no local Chrome/sips).
// Usage: MAKE_API_TOKEN=xxxx node render.js [YYYY-MM-DD]
// Reads content/<date>.json -> renders 7 JPEG slides via Playwright -> uploads each to
// Cloudinary (unsigned preset) -> writes one record to the Make Data Store via Make API.
// The Make scenario "Pink Carousel Auto Publisher" then posts it to Instagram at 19:00 Jerusalem.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const CLD_CLOUD = 'duhfkgxer';
const CLD_PRESET = 'fi604fpo';
const MAKE_ZONE = 'eu1.make.com';
const DATASTORE_ID = 124678;

const root = __dirname;
const date = process.argv[2] || new Date().toISOString().slice(0, 10);

async function uploadToCloudinary(buffer, hint) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), hint + '.jpg');
  form.append('upload_preset', CLD_PRESET);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/image/upload', { method: 'POST', body: form });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

(async () => {
  const token = process.env.MAKE_API_TOKEN;
  if (!token) throw new Error('MAKE_API_TOKEN env var is required');

  const tpl = fs.readFileSync(path.join(root, 'carousel.html'), 'utf8');
  const content = JSON.parse(fs.readFileSync(path.join(root, 'content', date + '.json'), 'utf8'));
  if (!content.slides || content.slides.length !== 7) throw new Error('Expected 7 slides');

  const dataJson = JSON.stringify({ theme: content.theme, bg: content.bg, brand: content.brand, slides: content.slides });
  const html = tpl.replace(
    /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
    '<script id="data" type="application/json">' + dataJson.replace(/<\//g, '<\\/') + '</script>'
  );
  const tmpHtml = path.join(os.tmpdir(), 'carousel-' + date + '.html');
  fs.writeFileSync(tmpHtml, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(600);

  const recordData = {
    caption: content.caption,
    posted: false,
    posted_at: '1970-01-01 00:00',
    date: date,
  };
  for (let i = 1; i <= 7; i++) {
    const buf = await page.locator('#s' + i).screenshot({ type: 'jpeg', quality: 84 });
    recordData['img' + i] = await uploadToCloudinary(buf, date + '-' + i);
    console.log('slide', i, '->', recordData['img' + i]);
  }
  await browser.close();

  const res = await fetch('https://' + MAKE_ZONE + '/api/v2/data-stores/' + DATASTORE_ID + '/data', {
    method: 'POST',
    headers: { 'Authorization': 'Token ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: recordData }),
  });
  const jr = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Make API write failed: ' + res.status + ' ' + JSON.stringify(jr));
  console.log('QUEUED in Make:', res.status, JSON.stringify(jr));
  console.log('DONE: carousel for', date, 'will auto-publish at 19:00 Jerusalem.');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
