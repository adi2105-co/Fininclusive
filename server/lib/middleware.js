
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET;
const COOKIE = 'fi_token';

if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be configured in production.');
}

const signingSecret = SECRET || 'dev-secret-change-me';

const issue = (res, user) => {
  const token = jwt.sign(
    { id: user.id, role: user.role },
    signingSecret,
    { expiresIn: '7d' }
  );

  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 864e5,
    path: '/'
  });
};

const clear = res =>
  res.clearCookie(COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });

async function auth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new Error('Missing token');

    const payload = jwt.verify(token, signingSecret);
    const user = await db.prepare(
      'SELECT * FROM users WHERE id=? AND verified=1'
    ).get(payload.id);

    if (!user) throw new Error('User not found');

    req.user = user;
    next();
  } catch {
    res.status(401).json({
      error: 'Please sign in to continue.'
    });
  }
}

const adminOnly = (req, res, next) =>
  req.user?.role === 'admin'
    ? next()
    : res.status(403).json({ error: 'Banker access only.' });

module.exports = { issue, clear, auth, adminOnly };