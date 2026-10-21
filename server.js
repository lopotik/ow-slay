import 'dotenv/config';
import express from 'express';
import cookieSession from 'cookie-session';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { db } from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_IDS = (process.env.ADMIN_TWITCH_IDS || '').split(',').filter(Boolean);

app.use(express.json());
app.use(express.static('public'));
app.use(cookieSession({
  name: 'slay_sess',
  secret: process.env.SESSION_SECRET || 'dev_secret',
  maxAge: 1000 * 60 * 60 * 24 * 7,
  sameSite: 'lax'
}));


app.get('/auth/twitch', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: `${BASE_URL}/auth/twitch/callback`,
    response_type: 'code',
    scope: 'user:read:email',
    state
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
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID
      }
    });
    const userData = await userRes.json();
    const u = userData.data?.[0];
    if (!u) return res.redirect('/?error=user');
    req.session.user = {
      id: u.id,
      login: u.login,
      display_name: u.display_name,
      avatar: u.profile_image_url
    };
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.redirect('/?error=oauth');
  }
});

app.post('/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

/* ---------- API ---------- */
app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null, isAdmin: !!req.session.user && ADMIN_IDS.includes(req.session.user.id) });
});

app.get('/api/nominees', async (req, res) => {
  try {
    const rows = (await db.query(`
      SELECT n.*, COUNT(v.id)::int as votes
      FROM nominees n LEFT JOIN votes v ON v.nominee_id = n.id
      GROUP BY n.id ORDER BY n.id
    `)).rows;
    
    let mine = [];
    if (req.session.user) {
      mine = (await db.query('SELECT nominee_id FROM votes WHERE user_id=$1', [req.session.user.id]))
        .rows.map(r => r.nominee_id);
    }
    res.json({ nominees: rows, myVotes: mine });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db_error' });
  }
});

app.post('/api/vote/:id', async (req, res) => {
  const user = req.session.user;
  if (!user) return res.status(401).json({ error: 'auth_required' });
  const id = Number(req.params.id);
  
  try {
    const check = await db.query('SELECT id FROM nominees WHERE id=$1', [id]);
    if (check.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    
    await db.query('INSERT INTO votes (nominee_id, user_id, user_login) VALUES ($1,$2,$3)', [id, user.id, user.login]);
    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes('unique constraint')) return res.status(409).json({ error: 'already_voted' });
    console.error(e);
    res.status(500).json({ error: 'server' });
  }
});
/* ---------- ADMIN ---------- */
function requireAdmin(req, res, next) {
  if (!req.session.user || !ADMIN_IDS.includes(req.session.user.id))
    return res.status(403).json({ error: 'forbidden' });
  next();
}

app.post('/api/admin/nominees', requireAdmin, (req, res) => {
  const { name, description = '', category = 'game', twitch_login = '', avatar = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name_required' });
  const info = db.prepare('INSERT INTO nominees (name, description, category, twitch_login, avatar) VALUES (?,?,?,?,?)')
    .run(name, description, category, twitch_login, avatar);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.delete('/api/admin/nominees/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM nominees WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const totalVotes = (await db.query('SELECT COUNT(*) FROM votes')).rows[0].count;
    const totalUsers = (await db.query('SELECT COUNT(DISTINCT user_id) FROM votes')).rows[0].count;
    const perNominee = (await db.query(`
      SELECT n.id, n.name, COUNT(v.id)::int as votes
      FROM nominees n LEFT JOIN votes v ON v.nominee_id=n.id
      GROUP BY n.id ORDER BY votes DESC
    `)).rows;
    res.json({ totalVotes: parseInt(totalVotes), totalUsers: parseInt(totalUsers), perNominee });
  } catch (e) {
    res.status(500).json({ error: 'db_error' });
  }
});

app.listen(PORT, () => console.log(`🔥 OV SLAY running → ${BASE_URL}`));