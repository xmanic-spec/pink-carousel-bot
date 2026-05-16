// Pink Media daily carousel renderer (cloud-portable: Playwright only, no local Chrome/sips).
// Usage: node render.js [YYYY-MM-DD]
// Reads content/<date>.json -> renders 7 JPEG slides via Playwright -> uploads each to
// Cloudinary (unsigned preset) -> POSTs {date, caption, img1..img7} to the Make ingest webhook.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const CLD_CLOUD = 'duhfkgxer';
const CLD_PRESET = 'fi604fpo';
const WEBHOOK = 'https://hook.eu1.make.com/wmlcdlfvbzpq4ph5oq9vz0bslib741x3';

const root = __dirname;
const date = process.argv[2] || new Date().toISOString().slice(0, 10);

async function uploadToCloudinary(buffer, publicIdHint) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/jpeg' }), publicIdHint + '.jpg');
  form.append('upload_preset', CLD_PRESET);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/image/upload', {
    method: 'POST',
    body: form,
  });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

(async () => {
  const tpl = fs.readFileSync(path.join(root, 'carousel.html'), 'utf8');
  const content = JSON.parse(fs.readFileSync(path.join(root, 'content', date + '.json'), 'utf8'));
  const slides = content.slides || [];
  if (slides.length !== 7) throw new Error('Expected 7 slides, got ' + slides.length);

  const dataJson = JSON.stringify({ brand: content.brand, slides: content.slides });
  const html = tpl.replace(
    /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
    '<script id="data" type="application/json">' + dataJson.replace(/<\//g, '<\\/') + '</script>'
  );
  const tmpHtml = path.join(os.tmpdir(), 'carousel-' + date + '.html');
  fs.writeFileSync(tmpHtml, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(600);

  const payload = { date: date, caption: content.caption };
  for (let i = 1; i <= 7; i++) {
    const buf = await page.locator('#s' + i).screenshot({ type: 'jpeg', quality: 84 });
    const url = await uploadToCloudinary(buf, date + '-' + i);
    payload['img' + i] = url;
    console.log('slide', i, '->', url);
  }
  await browser.close();

  const r = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('webhook:', r.status, await r.text());
  if (!r.ok) throw new Error('Webhook POST failed: ' + r.status);
  console.log('DONE: carousel for', date, 'queued for auto-publish at 19:00 Jerusalem.');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
