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

  // Reel publishing is off by default (Shay 2026-05-20: a Reel + Carousel from the
  // same handle on the same day made the feed look noisy and competed with the
  // Carousel; for B2B Hebrew growth the Carousel wins on saves + follow-conversion).
  // Set ENABLE_REEL=1 in Hetzner .env to re-enable when we want it back as a
  // separate cadence with standalone Reel content.
  const reelEnabled = process.env.ENABLE_REEL === '1';
  const recordData = {
    caption: content.caption,
    posted: false,            // Instagram carousel
    posted_li: false,         // LinkedIn
    posted_fb: false,         // Facebook page
    posted_reel: !reelEnabled,// pre-marked done when disabled so the queue never fires the Reel publisher
    posted_at: '1970-01-01 00:00',
    pub_ig: content.pub_ig || 1110,
    pub_li: content.pub_li || 1140,
    pub_fb: content.pub_fb || 1170,
    pub_reel: content.pub_reel || 1290,   // default ~21:30 Israel
    date: date,
    caption_en: (content.en && content.en.caption) || content.caption,
    pdf_url: '',
    reel_url: '',
    // Growth additions: tagged @mentions ride in the caption; first_comment posts
    // immediately after the carousel goes live; ig_media_id captured by the carousel
    // publisher when it succeeds so the comment scenario knows where to comment.
    first_comment: content.first_comment || '',
    first_comment_done: false,
    // ManyChat comment-to-DM: the day's engagement question + the actual guide the
    // commenter receives. dm_guide is stored as a ready-to-serve ManyChat "dynamic
    // block" so the Make webhook returns it verbatim and ManyChat renders the DM
    // bubbles directly (variable bubble count, no IML string surgery).
    cta_question: content.cta_question || '',
    dm_guide: JSON.stringify({
      version: 'v2',
      content: {
        type: 'instagram',
        messages: (content.dm_guide || []).map((t) => ({ type: 'text', text: String(t) })),
      },
    }),
    ig_media_id: '',
    story_url: '',
    posted_story: false,
    // Mid-carousel video slide: 1080x1350 MP4 that replaces slide 3 as the IG VIDEO
    // child in the carousel. Empty falls back to img3 via the publisher's mapper.
    vid3: '',
  };
  for (let i = 1; i <= 7; i++) {
    const buf = await page.locator('#s' + i).screenshot({ type: 'jpeg', quality: 84 });
    recordData['img' + i] = await uploadToCloudinary(buf, date + '-' + i);
    console.log('slide', i, '->', recordData['img' + i]);
  }

  // Slide 3 = mid-carousel video (1080x1350 mp4). img3 stays as the fallback in the
  // queue so the publisher's mapper can degrade gracefully if vidSlide ever fails.
  try {
    const { renderVidSlide } = require('./vidSlide');
    const vid3 = await renderVidSlide(content, date, 'he');
    recordData.vid3 = vid3;
    console.log('vid3 (slide 3 video) ->', vid3);
  } catch (e) {
    console.error('vid3 skipped (slide 3 stays as image):', e.message);
    recordData.vid3 = '';
  }

  // Reel companion: rendered + uploaded only when ENABLE_REEL=1. Saves a substantial
  // chunk of pipeline time (Playwright video + ffmpeg + Cloudinary video upload).
  if (reelEnabled) {
    try {
      const { renderReel } = require('./reel');
      const reelUrl = await renderReel(content, date, 'he');
      recordData.reel_url = reelUrl;
      recordData.posted_reel = false;
      console.log('reel ->', reelUrl);
    } catch (e) {
      console.error('reel skipped:', e.message);
      recordData.reel_url = '';
      recordData.posted_reel = true;
    }
  } else {
    console.log('reel disabled (ENABLE_REEL not set)');
  }

  // Story image (single 1080x1920 PNG) used by the Hetzner-side story publisher to
  // re-promote the new carousel to Instagram Stories the moment the feed post goes
  // live. Same hero bg, no extra image generation. Failure is non-blocking.
  try {
    const { renderStory } = require('./story');
    const storyUrl = await renderStory(content, date, 'he');
    recordData.story_url = storyUrl;
    console.log('story ->', storyUrl);
  } catch (e) {
    console.error('story skipped:', e.message);
    recordData.story_url = '';
    recordData.posted_story = true;
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

  let res = await fetch('https://' + MAKE_ZONE + '/api/v2/data-stores/' + DATASTORE_ID + '/data', {
    method: 'POST',
    headers: { 'Authorization': 'Token ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: recordData }),
  });
  let jr = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Never lose the day's post to a datastructure that does not know the ManyChat
    // fields yet: retry once without them (the carousel itself is unaffected).
    console.error('Make write failed (' + res.status + '), retrying without ManyChat fields:', JSON.stringify(jr).slice(0, 200));
    const slim = { ...recordData };
    delete slim.cta_question; delete slim.dm_guide;
    res = await fetch('https://' + MAKE_ZONE + '/api/v2/data-stores/' + DATASTORE_ID + '/data', {
      method: 'POST',
      headers: { 'Authorization': 'Token ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: slim }),
    });
    jr = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw new Error('Make API write failed: ' + res.status + ' ' + JSON.stringify(jr));
  console.log('QUEUED in Make:', res.status, JSON.stringify(jr));
  console.log('DONE: carousel for', date, 'will auto-publish at 19:00 Jerusalem.');
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
