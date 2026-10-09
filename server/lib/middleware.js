const jwt = require('jsonwebtoken');
const db = require('../db');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE = 'fi_token';

const issue = (res, user) => {
  const token = jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 });
};
const clear = res => res.clearCookie(COOKIE);

function auth(req, res, next) {
  try {
    const p = jwt.verify(req.cookies[COOKIE], SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id=? AND verified=1').get(p.id);
    if (!u) throw new Error('no user');
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Please sign in to continue.' }); }
}
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Banker access only.' }));
module.exports = { issue, clear, auth, adminOnly };
