import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import fetch from 'node-fetch';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(cookieSession({
  name: 'slay_sess',
  secret: process.env.SESSION_SECRET || 'dev_secret',
  maxAge: 1000 * 60 * 60 * 24 * 7,
  sameSite: 'lax'
}));

let appAccessToken = null;
async function getAppAccessToken() {
  if (appAccessToken) return appAccessToken;
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    });
    const data = await res.json();
    if (data.access_token) {
      appAccessToken = data.access_token;
      return appAccessToken;
    }
  } catch (e) {}
  return null;
}

/* ---------- AUTH ---------- */
app.get('/auth/twitch', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/twitch/callback`,
    response_type: 'code',
    scope: 'user:read:email',
    state: state,
    force_verify: 'true'
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.session.oauthState) return res.redirect('/?error=oauth');
  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/auth/twitch/callback`
      })
    });
    const token = await tokenRes.json();
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Authorization': `Bearer ${token.access_token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
    });
    const userData = await userRes.json();
    const u = userData.data?.[0];
    if (!u) return res.redirect('/?error=user');
    req.session.user = { id: u.id, login: u.login, display_name: u.display_name, avatar: u.profile_image_url };
    res.redirect('/');
  } catch (e) { res.redirect('/?error=oauth'); }
});

app.post('/auth/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

/* ---------- API ---------- */
app.get('/api/me', (req, res) => { res.json({ user: req.session.user || null }); });

app.get('/api/my-votes', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'auth_required' });
  try {
    const votes = (await db.query(`
      SELECT v.category, v.created_at, n.name as nominee_name, n.avatar as nominee_avatar, c.title as category_title, c.icon as category_icon
      FROM votes v JOIN nominees n ON n.id = v.nominee_id JOIN categories c ON c.id = v.category
      WHERE v.user_id = $1 ORDER BY v.created_at DESC
    `, [user.id])).rows;
    res.json({ votes });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/categories', async (req, res) => {
  try {
    const rows = (await db.query('SELECT * FROM categories ORDER BY sort_order ASC')).rows;
    res.json({ categories: rows });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/nominees', async (req, res) => {
  try {
    const user = req.session.user;
    const query = `
      SELECT n.*, COUNT(v.id)::int as votes
      FROM nominees n LEFT JOIN votes v ON v.nominee_id = n.id
      WHERE n.created_by IS NULL 
         OR n.created_by = $1 
         OR n.created_by LIKE $2
         OR (SELECT COUNT(*) FROM votes WHERE nominee_id = n.id) >= 30
      GROUP BY n.id ORDER BY n.sort_order ASC, n.id ASC
    `;
    const userIdStr = user ? String(user.id) : 'empty_user';
    const likeStr = `%${userIdStr}%`;
    
    const rows = (await db.query(query, [userIdStr, likeStr])).rows;
    
    const filteredRows = rows.filter(n => {
      if (!user || !n.created_by) return true;
      if (n.created_by === String(user.id)) return true;
      if (n.created_by.split(',').includes(String(user.id))) return true;
      if (Number(n.votes) >= 30) return true;
      return false;
    });

    let myVotes = [];
    if (user) {
      myVotes = (await db.query('SELECT nominee_id, category FROM votes WHERE user_id=$1', [user.id])).rows;
    }
    res.json({ nominees: filteredRows, myVotes });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/vote/:id', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'auth_required' });
  const id = Number(req.params.id);
  
  try {
    const nominee = (await db.query('SELECT id, category, created_by FROM nominees WHERE id=$1', [id])).rows[0];
    if (!nominee) return res.status(404).json({ error: 'not_found' });
    
    await db.query('INSERT INTO votes (nominee_id, category, user_id, user_login) VALUES ($1,$2,$3,$4)', 
      [id, nominee.category, user.id, user.login]);

    if (nominee.created_by !== null) {
      const voteCount = (await db.query('SELECT COUNT(*)::int as count FROM votes WHERE nominee_id=$1', [id])).rows[0].count;
      if (Number(voteCount) >= 30) {
        await db.query('UPDATE nominees SET created_by=NULL WHERE id=$1', [id]);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes('unique')) return res.status(409).json({ error: 'already_voted' });
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/suggest', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'auth_required' });

  const { category, twitch_login } = req.body;
  if (!category || !twitch_login) return res.status(400).json({ error: 'missing_fields' });

  const token = await getAppAccessToken();
  let finalAvatar = '';
  let realName = '';
  let autoDescription = `Канал на Twitch: twitch.tv/${twitch_login.toLowerCase()}`;
  
  if (token) {
    try {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${twitch_login.toLowerCase()}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
      });
      const twitchData = await twitchRes.json();
      if (!twitchData.data || twitchData.data.length === 0) {
        return res.status(404).json({ error: 'twitch_not_found' });
      }
      finalAvatar = twitchData.data[0].profile_image_url;
      realName = twitchData.data[0].display_name;
    } catch (e) { return res.status(500).json({ error: 'twitch_error' }); }
  } else { return res.status(500).json({ error: 'no_token' }); }

  try {
    const existing = (await db.query(
      'SELECT id, created_by FROM nominees WHERE LOWER(twitch_login) = LOWER($1) AND category = $2', 
      [twitch_login, category]
    )).rows[0];

    if (existing) {
      if (existing.created_by !== null) {
        const creators = existing.created_by ? String(existing.created_by).split(',') : [];
        if (!creators.includes(String(user.id))) {
          creators.push(user.id);
          await db.query('UPDATE nominees SET created_by=$1 WHERE id=$2', [creators.join(','), existing.id]);
        }
      }
      return res.json({ ok: true, message: 'already_exists' });
    }

    await db.query(
      'INSERT INTO nominees (name, category, twitch_login, avatar, created_by, description, sort_order) VALUES ($1,$2,$3,$4,$5,$6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM nominees WHERE category = $2))', 
      [realName, category, twitch_login, finalAvatar, String(user.id), autoDescription]
    );
    res.json({ ok: true });
  } catch (e) { 
    console.error(e);
    res.status(500).json({ error: 'db_error' }); 
  }
});

/* ---------- ADMIN ---------- */
function requireAdmin(req, res, next) {
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) return next(); 
  const ADMIN_IDS = (process.env.ADMIN_TWITCH_IDS || '').split(',').map(s => s.trim());
  if (!req.session.user || !ADMIN_IDS.includes(req.session.user.id))
    return res.status(403).json({ error: 'forbidden' });
  next();
}

app.get('/api/admin/nominees', requireAdmin, async (req, res) => {
  try {
    const rows = (await db.query(`
      SELECT n.*, COUNT(v.id)::int as votes
      FROM nominees n LEFT JOIN votes v ON v.nominee_id = n.id
      GROUP BY n.id ORDER BY n.category ASC, n.sort_order ASC
    `)).rows;
    res.json({ nominees: rows });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/admin/results', requireAdmin, async (req, res) => {
  try {
    const categories = (await db.query('SELECT * FROM categories ORDER BY sort_order ASC')).rows;
    const nominees = (await db.query(`
      SELECT n.*, COUNT(v.id)::int as votes
      FROM nominees n LEFT JOIN votes v ON v.nominee_id = n.id
      GROUP BY n.id ORDER BY votes DESC
    `)).rows;

    const results = categories.map(c => {
      const catNoms = nominees.filter(n => n.category === c.id);
      const totalVotes = catNoms.reduce((s, n) => s + Number(n.votes), 0);
      const nomsWithPct = catNoms.map(n => ({
        ...n,
        pct: totalVotes ? Math.round((Number(n.votes) / totalVotes) * 100) : 0
      }));
      return { category: c, nominees: nomsWithPct, totalVotes };
    });

    res.json({ results });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/admin/nominees/reorder', requireAdmin, async (req, res) => {
  const { category, order } = req.body;
  try {
    for (let i = 0; i < order.length; i++) {
      await db.query('UPDATE nominees SET sort_order=$1 WHERE id=$2 AND category=$3', [i, Number(order[i]), category]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/admin/categories/reorder', requireAdmin, async (req, res) => {
  const { order } = req.body;
  try {
    for (let i = 0; i < order.length; i++) {
      await db.query('UPDATE categories SET sort_order=$1 WHERE id=$2', [i, order[i]]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.put('/api/admin/nominees/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, description, category, twitch_login, avatar } = req.body;
  try {
    await db.query('UPDATE nominees SET name=$1, description=$2, category=$3, twitch_login=$4, avatar=$5 WHERE id=$6', 
      [name, description, category, twitch_login, avatar, id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/admin/nominees', requireAdmin, async (req, res) => {
  const { name, description = '', category = 'game', twitch_login = '', is_hidden } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  let finalAvatar = req.body.avatar || '';
  
  if (twitch_login && !finalAvatar) {
    const token = await getAppAccessToken();
    if (token) {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${twitch_login.toLowerCase()}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': process.env.TWITCH_CLIENT_ID }
      });
      const twitchData = await twitchRes.json();
      if (twitchData.data && twitchData.data.length > 0) finalAvatar = twitchData.data[0].profile_image_url;
    }
  }

  const createdBy = is_hidden ? String(req.session.user.id) : null;

  try {
    await db.query(`INSERT INTO nominees (name, description, category, twitch_login, avatar, created_by, sort_order) 
      VALUES ($1,$2,$3,$4,$5,$6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM nominees WHERE category = $3))`, 
      [name, description, category, twitch_login, finalAvatar, createdBy]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.delete('/api/admin/nominees/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM nominees WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalVotes = (await db.query('SELECT COUNT(*)::int as count FROM votes')).rows[0].count || 0;
    const totalUsers = (await db.query('SELECT COUNT(DISTINCT user_id)::int as count FROM votes')).rows[0].count || 0;
    res.json({ totalVotes: Number(totalVotes), totalUsers: Number(totalUsers) });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const { title, description, icon, image_url, filter } = req.body;
  try {
    await db.query('UPDATE categories SET title=$1, description=$2, icon=$3, image_url=$4, filter=$5 WHERE id=$6', 
      [title, description, icon, image_url, filter, id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  const { id, title, description, icon, image_url, filter } = req.body;
  if (!id || !title) return res.status(400).json({ error: 'id_and_title_required' });
  try {
    await db.query(`INSERT INTO categories (id, title, description, icon, image_url, filter, sort_order) 
      VALUES ($1,$2,$3,$4,$5,$6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))`, 
      [id, title, description, icon, image_url || '', filter]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const catId = req.params.id;
    await db.query('DELETE FROM votes WHERE category=$1', [catId]);
    await db.query('DELETE FROM nominees WHERE category=$1', [catId]);
    await db.query('DELETE FROM categories WHERE id=$1', [catId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.get('/api/admin/nominees/:id/votes', requireAdmin, async (req, res) => {
  const nomineeId = Number(req.params.id);
  try {
    const votes = (await db.query(`
      SELECT id, user_login, created_at FROM votes WHERE nominee_id=$1 ORDER BY created_at DESC
    `, [nomineeId])).rows;
    res.json({ votes });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

app.delete('/api/admin/votes/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM votes WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'db_error' }); }
});

// Экспорт для Vercel (вместо app.listen)
export default app;