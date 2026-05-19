// Hetzner-side Instagram Story publisher. Make's instagram-business app has no
// "Create Story" module, so this calls the Graph API directly using a long-lived
// Page Access Token in Hetzner .env (IG_ACCESS_TOKEN). Idempotent and safe to
// cron every 15 min in the evening window: it only publishes records where the
// carousel is already live (posted=true) and the story has not yet been posted
// (posted_story=false) and a story_url is present.
//
// To enable:
//   1) Generate a long-lived Page Access Token for the @bankhaltershay IG Business
//      account (linked to the FB Page Pink Media). Add to /root/pink-carousel-bot/.env:
//        IG_ACCESS_TOKEN=EAA...
//   2) Add to crontab so it fires in the evening window:
//        */15 15-19 * * * /usr/bin/env bash -c 'cd /root/pink-carousel-bot && set -a; . .env; set +a; node storyPub.js >> daily.log 2>&1'
const IG_USER_ID = '17841404457180114';
const GRAPH_VER = 'v22.0';
const MAKE_ZONE = 'eu1.make.com';
const DATASTORE_ID = 124678;

async function igPublishStory(imageUrl, token) {
  const create = await fetch('https://graph.facebook.com/' + GRAPH_VER + '/' + IG_USER_ID + '/media', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ media_type: 'STORIES', image_url: imageUrl, access_token: token }),
  });
  const cj = await create.json();
  if (!create.ok || !cj.id) throw new Error('IG media create failed: ' + JSON.stringify(cj));
  const pub = await fetch('https://graph.facebook.com/' + GRAPH_VER + '/' + IG_USER_ID + '/media_publish', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ creation_id: cj.id, access_token: token }),
  });
  const pj = await pub.json();
  if (!pub.ok || !pj.id) throw new Error('IG media_publish failed: ' + JSON.stringify(pj));
  return pj.id;
}

async function listRecords(makeToken) {
  const r = await fetch('https://' + MAKE_ZONE + '/api/v2/data-stores/' + DATASTORE_ID + '/data', {
    headers: { 'Authorization': 'Token ' + makeToken },
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Make list failed: ' + r.status + ' ' + JSON.stringify(j));
  return j.records || j.data || [];
}

async function patchRecord(makeToken, key, data) {
  const r = await fetch('https://' + MAKE_ZONE + '/api/v2/data-stores/' + DATASTORE_ID + '/data/' + encodeURIComponent(key), {
    method: 'PATCH',
    headers: { 'Authorization': 'Token ' + makeToken, 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error('Make patch failed: ' + r.status + ' ' + JSON.stringify(j));
  }
}

(async () => {
  const igToken = process.env.IG_ACCESS_TOKEN;
  if (!igToken) { console.log('story: no IG_ACCESS_TOKEN, skipping'); process.exit(0); }
  const makeToken = process.env.MAKE_API_TOKEN;
  if (!makeToken) { console.error('story: no MAKE_API_TOKEN'); process.exit(1); }

  const records = await listRecords(makeToken);
  // Pick the most recent carousel that has gone live but has no story yet.
  const candidates = records
    .map((r) => ({ key: r.key, data: r.data || r }))
    .filter((r) => r.data && r.data.posted === true && r.data.posted_story === false && r.data.story_url)
    .sort((a, b) => String(b.data.posted_at || '').localeCompare(String(a.data.posted_at || '')));
  if (!candidates.length) { console.log('story: nothing to publish'); process.exit(0); }
  const target = candidates[0];
  console.log('story: publishing for record', target.key, 'story_url=', target.data.story_url);
  try {
    const igId = await igPublishStory(target.data.story_url, igToken);
    console.log('story: IG published, media id', igId);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await patchRecord(makeToken, target.key, { posted_story: true, posted_at: now });
    console.log('story: queue updated posted_story=true');
  } catch (e) {
    console.error('story: publish failed:', e.message);
    process.exit(1);
  }
})();
