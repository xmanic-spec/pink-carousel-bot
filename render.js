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

async function uploadPdfToCloudinary(buffer, hint) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/pdf' }), hint + '.pdf');
  form.append('upload_preset', CLD_PRESET);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/auto/upload', { method: 'POST', body: form });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary PDF upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

(async () => {
  const token = process.env.MAKE_API_TOKEN;
  if (!token) throw new Error('MAKE_API_TOKEN env var is required');

  const tpl = fs.readFileSync(path.join(root, 'carousel.html'), 'utf8');
  const content = JSON.parse(fs.readFileSync(path.join(root, 'content', date + '.json'), 'utf8'));
  if (!content.slides || content.slides.length !== 7) throw new Error('Expected 7 slides');

  const dataJson = JSON.stringify({ theme: content.theme, layout: content.layout, bg: content.bg, bgreal: content.bgreal, brand: content.brand, slides: content.slides });
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
    posted: false,            // Instagram carousel
    posted_li: false,         // LinkedIn
    posted_fb: false,         // Facebook page
    posted_reel: false,       // Instagram Reel companion
    posted_at: '1970-01-01 00:00',
    pub_ig: content.pub_ig || 1110,
    pub_li: content.pub_li || 1140,
    pub_fb: content.pub_fb || 1170,
    pub_reel: content.pub_reel || 1290,   // default ~21:30 Israel
    date: date,
    caption_en: (content.en && content.en.caption) || content.caption,
    pdf_url: '',
    reel_url: '',
  };
  for (let i = 1; i <= 7; i++) {
    const buf = await page.locator('#s' + i).screenshot({ type: 'jpeg', quality: 84 });
    recordData['img' + i] = await uploadToCloudinary(buf, date + '-' + i);
    console.log('slide', i, '->', recordData['img' + i]);
  }

  // Reel companion: a 10s vertical 1080x1920 video built from the SAME hero image and
  // hook text. No extra OpenAI generation. Failure is non-blocking — we mark posted_reel
  // true so the Reels publisher will simply skip this record.
  try {
    const { renderReel } = require('./reel');
    const reelUrl = await renderReel(content, date, 'he');
    recordData.reel_url = reelUrl;
    console.log('reel ->', reelUrl);
  } catch (e) {
    console.error('reel skipped:', e.message);
    recordData.reel_url = '';
    recordData.posted_reel = true;
  }

  // English LinkedIn carousel: render English slides -> single 7-page PDF (the native
  // LinkedIn swipe carousel) -> Cloudinary. Never blocks the Hebrew carousel/queue.
  if (content.en && Array.isArray(content.en.slides) && content.en.slides.length === 7) {
    try {
      const enData = JSON.stringify({ theme: content.theme, layout: content.layout, bg: content.bg, bgreal: content.bgreal, brand: content.brand, slides: content.en.slides, lang: 'en' });
      const enHtml = tpl.replace(
        /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
        '<script id="data" type="application/json">' + enData.replace(/<\//g, '<\\/') + '</script>'
      );
      const enTmp = path.join(os.tmpdir(), 'carousel-en-' + date + '.html');
      fs.writeFileSync(enTmp, enHtml);
      const ep = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
      await ep.goto('file://' + enTmp, { waitUntil: 'networkidle' });
      await ep.evaluate(async () => { await document.fonts.ready; });
      await ep.waitForTimeout(600);
      const pages = [];
      for (let i = 1; i <= 7; i++) {
        const b = await ep.locator('#s' + i).screenshot({ type: 'jpeg', quality: 82 });
        pages.push('data:image/jpeg;base64,' + Buffer.from(b).toString('base64'));
      }
      await ep.close();
      const printHtml = '<!doctype html><html><head><meta charset="utf-8"><style>'
        + '@page{size:1080px 1350px;margin:0}*{margin:0;padding:0}'
        + '.pg{width:1080px;height:1350px;page-break-after:always;overflow:hidden}'
        + '.pg:last-child{page-break-after:auto}.pg img{width:1080px;height:1350px;display:block}'
        + '</style></head><body>'
        + pages.map(d => '<div class="pg"><img src="' + d + '"></div>').join('')
        + '</body></html>';
      const pp = await browser.newPage();
      await pp.setContent(printHtml, { waitUntil: 'networkidle' });
      const pdf = await pp.pdf({ width: '1080px', height: '1350px', printBackground: true, pageRanges: '1-7' });
      await pp.close();
      recordData.pdf_url = await uploadPdfToCloudinary(Buffer.from(pdf), 'pink-li-' + date);
      console.log('english PDF ->', recordData.pdf_url);
    } catch (e) { console.error('english PDF skipped:', e.message); }
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
