// Pink Media daily Reel renderer. Companion to render.js — runs after the carousel
// is built; reuses the same hero bg + content so there is NO extra image generation
// (zero added OpenAI cost). Produces a 10s 1080x1920 MP4 via Playwright video + ffmpeg
// (H.264 high + silent AAC stereo, faststart), uploads to Cloudinary as video, returns
// the secure_url. Stand-alone callable: node reel.js <YYYY-MM-DD>; also exported.
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
  if (!j.secure_url) throw new Error('Cloudinary video upload failed: ' + JSON.stringify(j));
  return j.secure_url;
}

// Build the reel data payload from a parsed content JSON. Pulls a strong hook + a
// strategic punch line + the Pink CTA, in the same language as the requested variant.
function payloadFor(content, lang) {
  const slides = (lang === 'en' && content.en && content.en.slides) ? content.en.slides : content.slides;
  const hook = slides[0] || {};
  const punch = slides[2] || slides[1] || {};
  const stamp = lang === 'en' ? 'HOT TAKE' : 'תובנה';
  return {
    theme: content.theme || 't-blue',
    bg: content.bg || '',
    lang: lang || 'he',
    kicker: (hook.kicker || (content.brand && content.brand.sub) || 'PINK MEDIA'),
    hookH: hook.h || '',
    hookSticker: stamp,
    punchEb: punch.eyebrow || '',
    punchH: punch.h || '',
    swipe: lang === 'en' ? 'SWIPE FOR MORE' : 'החליקו לקרוסלה',
    handle: (content.brand && content.brand.handle) || '@bankhaltershay',
  };
}

// Render a single Reel: returns the Cloudinary mp4 URL. Never throws on a clean
// failure path — returns null so the carousel pipeline continues.
async function renderReel(content, date, lang) {
  const tplPath = path.join(__dirname, 'reel.html');
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const data = payloadFor(content, lang || 'he');
  const html = tpl.replace(
    /<script id="data" type="application\/json">[\s\S]*?<\/script>/,
    '<script id="data" type="application/json">' + JSON.stringify(data).replace(/<\//g, '<\\/') + '</script>'
  );
  const tmpHtml = path.join(os.tmpdir(), 'reel-' + date + '-' + (lang || 'he') + '.html');
  fs.writeFileSync(tmpHtml, html);
  const vidDir = path.join(os.tmpdir(), 'reelvid-' + date + '-' + (lang || 'he'));
  fs.mkdirSync(vidDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: vidDir, size: { width: 1080, height: 1920 } },
  });
  const page = await ctx.newPage();
  await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  // Hold the page for the full 10s animation timeline plus a small buffer so the
  // final scene 3 state is captured. The animation ends at ~10.0s.
  await page.waitForTimeout(10500);
  await ctx.close();
  await browser.close();

  // Playwright writes the .webm asynchronously on context close; locate it.
  const files = fs.readdirSync(vidDir).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('reel: no webm produced');
  const webm = path.join(vidDir, files[0]);

  // ffmpeg: webm video + a silent stereo AAC track of matching length, encoded for IG
  // Reel compatibility (H.264 high yuv420p, faststart). -shortest ensures duration matches.
  const mp4 = path.join(os.tmpdir(), 'reel-' + date + '-' + (lang || 'he') + '.mp4');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', webm,
    '-f', 'lavfi', '-t', '11', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
    '-b:v', '4500k', '-maxrate', '5000k', '-bufsize', '8000k',
    '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-shortest', '-movflags', '+faststart',
    mp4,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });

  const buf = fs.readFileSync(mp4);
  const url = await uploadVideoToCloudinary(buf, 'pink-reel-' + date + '-' + (lang || 'he'));
  // best-effort cleanup
  try { fs.unlinkSync(webm); fs.rmdirSync(vidDir); fs.unlinkSync(mp4); fs.unlinkSync(tmpHtml); } catch (_) {}
  return url;
}

module.exports = { renderReel };

if (require.main === module) {
  (async () => {
    const date = process.argv[2] || new Date().toISOString().slice(0, 10);
    const lang = process.argv[3] || 'he';
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, 'content', date + '.json'), 'utf8'));
    const url = await renderReel(content, date, lang);
    console.log('reel ->', url);
  })().catch((e) => { console.error('reel FATAL:', e.message); process.exit(1); });
}
