// Pulls last ~20 @bankhaltershay posts and per-post insights (reach, saves, shares,
// comments, follows, profile_visits, views) directly from the IG Graph API. Stores a
// rolling snapshot at insights/posts.json that daily.js then reads via insights.js to
// adapt the next post. Free (no model calls), idempotent, cron-driven on Hetzner.
//
// Requires IG_ACCESS_TOKEN in /root/pink-carousel-bot/.env (same long-lived Page Access
// Token used by storyPub.js, with an added "instagram_manage_insights" scope). If the
// token is missing or lacks the scope, this script no-ops cleanly so daily.js still runs.
const fs = require('fs');
const path = require('path');

const IG_USER_ID = '17841404457180114';
const GRAPH_VER = 'v22.0';
const DATA_DIR = path.join(__dirname, 'insights');
const STORE = path.join(DATA_DIR, 'posts.json');

async function igFetch(p, token) {
  const url = 'https://graph.facebook.com/' + GRAPH_VER + p + (p.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(token);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) throw new Error('IG ' + r.status + ' ' + JSON.stringify(j).slice(0, 220));
  return j;
}

(async () => {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) { console.log('insights: no IG_ACCESS_TOKEN, skipping'); process.exit(0); }
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const list = await igFetch('/' + IG_USER_ID + '/media?fields=id,caption,timestamp,media_type,media_product_type,permalink&limit=20', token);
  const media = list.data || [];
  const out = [];
  for (const m of media) {
    const isReel = (m.media_product_type === 'REELS') || (m.media_type === 'VIDEO');
    const want = isReel
      ? ['reach', 'saved', 'shares', 'comments', 'likes', 'total_interactions', 'views', 'plays']
      : ['reach', 'saved', 'shares', 'comments', 'likes', 'total_interactions', 'profile_visits', 'follows', 'views'];
    const metrics = {};
    try {
      const ins = await igFetch('/' + m.id + '/insights?metric=' + want.join(','), token);
      (ins.data || []).forEach((d) => { metrics[d.name] = (d.values && d.values[0] && d.values[0].value) || 0; });
    } catch (e) {
      console.log('insights: media', m.id, 'skip:', e.message.slice(0, 140));
      continue;
    }
    out.push({
      id: m.id,
      timestamp: m.timestamp,
      media_type: m.media_type,
      media_product_type: m.media_product_type,
      caption_snippet: String(m.caption || '').replace(/\s+/g, ' ').slice(0, 200),
      permalink: m.permalink,
      metrics,
    });
  }
  fs.writeFileSync(STORE, JSON.stringify({ collected_at: new Date().toISOString(), posts: out }, null, 2));
  console.log('insights: stored', out.length, 'posts ->', STORE);
})().catch((e) => { console.error('insights FATAL:', e.message); process.exit(1); });
