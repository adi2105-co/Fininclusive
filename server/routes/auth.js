
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { issue, clear, auth } = require('../lib/middleware');
const { genOtp, hashOtp, safeEqual, encrypt } = require('../lib/security');
const mailer = require('../lib/mailer');

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const strong = p =>
  typeof p === 'string' &&
  p.length >= 8 &&
  /[A-Z]/.test(p) &&
  /[a-z]/.test(p) &&
  /\d/.test(p);

const clean = s => String(s || '').trim();
const showDev = () =>
  !mailer.configured && process.env.NODE_ENV !== 'production';

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error('Auth route error:', err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : 'Something went wrong. Please try again.'
    });
  });

async function sendCode(user, purpose) {
  const { email } = user;
  const now = Date.now();

  const recent = await db.prepare(
    'SELECT COUNT(*) AS c FROM otps WHERE email=? AND created_at>?'
  ).get(email, now - 3600e3);

  if (Number(recent.c) >= 6) {
    throw Object.assign(
      new Error('Too many codes requested. Try again in an hour.'),
      { status: 429 }
    );
  }

  await db.prepare(
    'UPDATE otps SET used=1 WHERE email=? AND purpose=?'
  ).run(email, purpose);

  const code = genOtp();

  await db.prepare(
    `INSERT INTO otps
     (email, purpose, code_hash, expires_at, created_at)
     VALUES(?,?,?,?,?)`
  ).run(email, purpose, hashOtp(code, email), now + 5 * 60e3, now);

  await mailer.sendOtp(
    email,
    String(user.name || 'there').split(' ')[0],
    code,
    purpose
  );

  return showDev() ? code : undefined;
}

async function checkCode(email, purpose, code) {
  const row = await db.prepare(
    `SELECT * FROM otps
     WHERE email=? AND purpose=? AND used=0
     ORDER BY id DESC LIMIT 1`
  ).get(email, purpose);

  if (!row || Number(row.expires_at) < Date.now()) {
    return 'Code expired. Please request a new one.';
  }

  if (Number(row.attempts) >= 5) {
    return 'Too many wrong attempts. Request a new code.';
  }

  await db.prepare(
    'UPDATE otps SET attempts=attempts+1 WHERE id=?'
  ).run(row.id);

  if (!safeEqual(row.code_hash, hashOtp(clean(code), email))) {
    return 'Incorrect code.';
  }

  await db.prepare(
    'UPDATE otps SET used=1 WHERE id=?'
  ).run(row.id);

  return null;
}

router.post('/register', wrap(async (req, res) => {
  const name = clean(req.body.name);
  const email = clean(req.body.email).toLowerCase();
  const phone = clean(req.body.phone);

  if (name.length < 2) {
    return res.status(400).json({ error: 'Please enter your full name.' });
  }
  if (!emailRe.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      error: 'Enter a valid 10-digit Indian mobile number.'
    });
  }
  if (!strong(req.body.password)) {
    return res.status(400).json({
      error: 'Password needs 8+ characters with upper-case, lower-case and a number.'
    });
  }
  if (!req.body.consent) {
    return res.status(400).json({
      error: 'Please accept the privacy & data-use consent to continue.'
    });
  }

  const existing = await db.prepare(
    'SELECT * FROM users WHERE email=?'
  ).get(email);

  if (existing && Number(existing.verified) === 1) {
    return res.status(409).json({
      error: 'An account with this email already exists. Please sign in.'
    });
  }

  const passwordHash = bcrypt.hashSync(req.body.password, 12);
  let user;

  if (existing) {
    await db.prepare(
      'UPDATE users SET name=?, phone_enc=?, password_hash=? WHERE id=?'
    ).run(name, phone ? encrypt(phone) : null, passwordHash, existing.id);

    user = { ...existing, name, email };
  } else {
    const result = await db.prepare(
      `INSERT INTO users
       (name, email, phone_enc, password_hash, consent_at)
       VALUES(?,?,?,?,CURRENT_TIMESTAMP) RETURNING id`
    ).get(name, email, phone ? encrypt(phone) : null, passwordHash);

    user = { id: result.id, name, email };
  }

  await db.audit(user.id, 'register', req.ip);
  const devOtp = await sendCode(user, 'verify');

  res.json({
    ok: true,
    email,
    devOtp,
    message: 'We sent a 6-digit code to your email.'
  });
}));

router.post('/verify-otp', wrap(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await db.prepare(
    'SELECT * FROM users WHERE email=?'
  ).get(email);

  if (!user) {
    return res.status(400).json({ error: 'Account not found.' });
  }

  const error = await checkCode(email, 'verify', req.body.otp);
  if (error) return res.status(400).json({ error });

  await db.prepare(
    'UPDATE users SET verified=1, last_login=CURRENT_TIMESTAMP WHERE id=?'
  ).run(user.id);

  await db.audit(user.id, 'email_verified', req.ip);
  user.verified = 1;
  issue(res, user);

  res.json({ ok: true, role: user.role });
}));

router.post('/resend-otp', wrap(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const purpose = req.body.purpose === 'reset' ? 'reset' : 'verify';

  const user = await db.prepare(
    'SELECT * FROM users WHERE email=?'
  ).get(email);

  let devOtp;
  if (user && (purpose === 'reset' || Number(user.verified) !== 1)) {
    devOtp = await sendCode(user, purpose);
  }

  res.json({
    ok: true,
    devOtp,
    message: 'If the account exists, a new code has been sent.'
  });
}));

router.post('/login', wrap(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await db.prepare(
    'SELECT * FROM users WHERE email=?'
  ).get(email);

  if (!user || !bcrypt.compareSync(
    String(req.body.password || ''),
    user.password_hash
  )) {
    await db.audit(user?.id, 'login_failed', req.ip);
    return res.status(401).json({
      error: 'Incorrect email or password.'
    });
  }

  if (Number(user.verified) !== 1) {
    const devOtp = await sendCode(user, 'verify');
    return res.status(403).json({
      error: 'Please verify your email first - we sent you a new code.',
      needsVerify: true,
      email,
      devOtp
    });
  }

  await db.prepare(
    'UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=?'
  ).run(user.id);

  await db.audit(user.id, 'login', req.ip);
  issue(res, user);
  res.json({ ok: true, role: user.role });
}));

router.post('/forgot', wrap(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const user = await db.prepare(
    'SELECT * FROM users WHERE email=? AND verified=1'
  ).get(email);

  const devOtp = user ? await sendCode(user, 'reset') : undefined;
  res.json({
    ok: true,
    devOtp,
    message: 'If this email is registered, a reset code is on its way.'
  });
}));

router.post('/reset', wrap(async (req, res) => {
  const email = clean(req.body.email).toLowerCase();

  if (!strong(req.body.password)) {
    return res.status(400).json({
      error: 'Password needs 8+ characters with upper-case, lower-case and a number.'
    });
  }

  const user = await db.prepare(
    'SELECT * FROM users WHERE email=? AND verified=1'
  ).get(email);

  const error = user
    ? await checkCode(email, 'reset', req.body.otp)
    : 'Incorrect code.';

  if (error) return res.status(400).json({ error });

  await db.prepare(
    'UPDATE users SET password_hash=? WHERE id=?'
  ).run(bcrypt.hashSync(req.body.password, 12), user.id);

  await db.audit(user.id, 'password_reset', req.ip);
  res.json({ ok: true });
}));

router.post('/logout', (req, res) => {
  clear(res);
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role
  });
});

module.exports = router;