// Pink Media slide 3 = mid-carousel video. 1080x1350 (4:5, matches the IG carousel
// slide aspect), same theme + brand chrome as the other slides but with Ken Burns
// motion on the hero + text fade-in. Reuses the day's hero bg (zero added OpenAI
// cost). Outputs MP4 H.264+AAC for the IG Carousel VIDEO child. Returns Cloudinary
// URL or throws — render.js catches and falls back to image mode.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const CLD_CLOUD = 'duhfkgxer';
const CLD_PRESET = 'fi604fpo';

async function uploadVideoToCloudinary(buffer, hint) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'video/mp4' }), hint + '.mp4');
  form.append('upload_preset', CLD_PRESET);
  const res = await fetch('https://api.cloudinary.com/v1_1/' + CLD_CLOUD + '/auto/upload', { method: 'POST', body: form });
  const j = await res.json();
  if (!j.secure_url) throw new Error('Cloudinary vidSlide upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

function payloadFor(content, lang) {
  const slides = (lang === 'en' && content.en && content.en.slides) ? content.en.slides : content.slides;
  const s = (slides && slides[2]) || {};
  return {
    theme: content.theme || 't-blue',
    bg: content.bg || '',
    lang: lang || 'he',
    kicker: s.kicker || (content.brand && content.brand.sub) || 'PINK MEDIA',
    page: '03',
    total: '07',
    eyebrow: s.eyebrow || '',
    h: s.h || '',
    handle: (content.brand && content.brand.handle) || '@bankhaltershay',
    sub: (content.brand && content.brand.sub) || 'PINK MEDIA',
  };
}

async function renderVidSlide(content, date, lang) {
  const tplPath = path.join(__dirname, 'vidSlide.html');
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const data = payloadFor(content, lang || 'he');
  const html = tpl.replace(
    /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
    '<script id="data" type="application/json">' + JSON.stringify(data).replace(/<\//g, '<\\/') + '</script>'
  );
  const tmpHtml = path.join(os.tmpdir(), 'vidslide-' + date + '-' + (lang || 'he') + '.html');
  fs.writeFileSync(tmpHtml, html);
  const vidDir = path.join(os.tmpdir(), 'vidslidevid-' + date + '-' + (lang || 'he'));
  fs.mkdirSync(vidDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
    recordVideo: { dir: vidDir, size: { width: 1080, height: 1350 } },
  });
  const page = await ctx.newPage();
  await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  // 7.1s captures the full Ken Burns + text fade-in with a small buffer.
  await page.waitForTimeout(7100);
  await ctx.close();
  await browser.close();

  const files = fs.readdirSync(vidDir).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('vidSlide: no webm produced');
  const webm = path.join(vidDir, files[0]);

  // IG VIDEO carousel child accepts H.264 + AAC mp4. Same encoding family as reel.js.
  const mp4 = path.join(os.tmpdir(), 'vidslide-' + date + '-' + (lang || 'he') + '.mp4');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', webm,
    '-f', 'lavfi', '-t', '7.5', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
    '-b:v', '4500k', '-maxrate', '5000k', '-bufsize', '8000k',
    '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-shortest', '-movflags', '+faststart',
    mp4,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  const buf = fs.readFileSync(mp4);
  const url = await uploadVideoToCloudinary(buf, 'pink-vidslide-' + date + '-' + (lang || 'he'));
  try { fs.unlinkSync(webm); fs.rmdirSync(vidDir); fs.unlinkSync(mp4); fs.unlinkSync(tmpHtml); } catch (_) {}
  return url;
}

module.exports = { renderVidSlide };

if (require.main === module) {
  (async () => {
    const date = process.argv[2] || new Date().toISOString().slice(0, 10);
    const lang = process.argv[3] || 'he';
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, 'content', date + '.json'), 'utf8'));
    const url = await renderVidSlide(content, date, lang);
    console.log('vidslide ->', url);
  })().catch((e) => { console.error('vidSlide FATAL:', e.message); process.exit(1); });
}
