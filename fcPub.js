// Hetzner-side first-comment publisher. Uses the IG Graph API directly with
// IG_ACCESS_TOKEN from .env so we are not blocked by Make's IG connection
// scopes (which do not include instagram_manage_comments by default). Looks
// for queue records where the carousel is already live (posted=true) but the
// first comment has not been posted (first_comment_done=false), then posts
// `first_comment` on the captured ig_media_id and flips the flag.
//
// Cron entry on Hetzner (added by the same crontab snippet as storyPub):
//   */15 15-19 * * * /usr/bin/env bash -c 'cd /root/pink-carousel-bot && set -a; . .env; set +a; node fcPub.js >> daily.log 2>&1'
const GRAPH_VER = 'v22.0';
const MAKE_ZONE = 'eu1.make.com';
const DATASTORE_ID = 124678;

async function igComment(mediaId, message, token) {
  const r = await fetch('https://graph.facebook.com/' + GRAPH_VER + '/' + mediaId + '/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message, access_token: token }),
  });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error('IG comment failed: ' + JSON.stringify(j));
  return j.id;
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
  if (!igToken) { console.log('fcPub: no IG_ACCESS_TOKEN, skipping'); process.exit(0); }
  const makeToken = process.env.MAKE_API_TOKEN;
  if (!makeToken) { console.error('fcPub: no MAKE_API_TOKEN'); process.exit(1); }

  const records = await listRecords(makeToken);
  const candidates = records
    .map((r) => ({ key: r.key, data: r.data || r }))
    .filter((r) => r.data && r.data.posted === true && r.data.first_comment_done === false
      && r.data.first_comment && r.data.ig_media_id)
    .sort((a, b) => String(b.data.posted_at || '').localeCompare(String(a.data.posted_at || '')));
  if (!candidates.length) { console.log('fcPub: nothing to comment'); process.exit(0); }
  const target = candidates[0];
  console.log('fcPub: commenting on', target.data.ig_media_id, 'record', target.key);
  try {
    const cid = await igComment(target.data.ig_media_id, target.data.first_comment, igToken);
    console.log('fcPub: comment posted id', cid);
    await patchRecord(makeToken, target.key, { first_comment_done: true });
    console.log('fcPub: queue updated first_comment_done=true');
  } catch (e) {
    console.error('fcPub: failed:', e.message);
    process.exit(1);
  }
})();
