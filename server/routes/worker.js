
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, clear } = require('../lib/middleware');
const { encrypt, decrypt, maskPhone, maskPan } = require('../lib/security');
const { computeScore, scoreFromMetrics } = require('../lib/scoring');

router.use(auth);

const OCC = [
  'delivery_partner', 'ride_driver', 'street_vendor',
  'freelancer', 'daily_wage', 'other'
];

const num = (v, lo, hi, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
};

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const earnings = id =>
  db.prepare(
    'SELECT * FROM earnings WHERE user_id=? ORDER BY date DESC, id DESC'
  ).all(id);

function profileOf(u) {
  return {
    name: u.name,
    email: u.email,
    phone: maskPhone(decrypt(u.phone_enc)),
    pan: maskPan(decrypt(u.pan_enc)),
    occupation: u.occupation,
    city: u.city,
    declared_income: u.declared_income,
    monthly_debt: u.monthly_debt,
    upi_txns: u.upi_txns,
    bill_ontime: u.bill_ontime,
    account_age_months: u.account_age_months,
    created_at: u.created_at
  };
}

async function currentScore(user) {
  const score = computeScore(user, await earnings(user.id));
  const last = await db.prepare(
    'SELECT * FROM score_history WHERE user_id=? ORDER BY id DESC LIMIT 1'
  ).get(user.id);

  if (!last || Number(last.score) !== score.score) {
    await db.prepare(
      'INSERT INTO score_history(user_id, score, risk) VALUES(?,?,?)'
    ).run(user.id, score.score, score.risk);
  }

  return score;
}

async function matchLenders(user, score) {
  const { income } = score.metrics;
  const cap = score.eligibility.maxLoan;
  const rows = await db.prepare('SELECT data FROM lenders').all();

  return rows.map(row => JSON.parse(row.data)).map(lender => {
    const occupationOk =
      lender.segments.includes('any') ||
      lender.segments.includes(user.occupation);

    const scoreOk = score.score >= lender.min_score;
    const incomeOk =
      income >= lender.min_income ||
      (lender.scheme && lender.min_income === 0);

    const limit = lender.scheme && lender.max_amount <= 50000
      ? lender.max_amount
      : Math.min(lender.max_amount, cap);

    const amountOk = limit >= lender.min_amount;
    const eligible = occupationOk && scoreOk && incomeOk && amountOk;

    let reason = '';
    if (!occupationOk) reason = 'Not offered for your occupation type';
    else if (!scoreOk) reason = `Needs ${lender.min_score - score.score} more score points`;
    else if (!incomeOk) reason = `Needs monthly income of at least ₹${lender.min_income.toLocaleString('en-IN')}`;
    else if (!amountOk) reason = 'Your current eligible amount is below this lender\'s minimum';

    const margin = lender.min_score
      ? Math.min(1, (score.score - lender.min_score) / (850 - lender.min_score))
      : 0.6;

    return {
      ...lender,
      eligible,
      reason,
      match: eligible ? Math.round(55 + 45 * Math.max(0, margin)) : 0,
      limit: eligible ? limit : 0,
      your_rate: Math.min(
        lender.rate_max,
        Math.max(lender.rate_min, +score.eligibility.rate.toFixed(1))
      )
    };
  }).sort((a, b) =>
    (Number(b.eligible) - Number(a.eligible)) || (b.match - a.match)
  );
}

router.get('/profile', (req, res) => res.json(profileOf(req.user)));

router.put('/profile', wrap(async (req, res) => {
  const body = req.body;
  const phone = String(body.phone || '').trim();
  const pan = String(body.pan || '').trim().toUpperCase();

  if (phone && !phone.includes('•') && !/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  if (pan && !pan.includes('•') && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) {
    return res.status(400).json({ error: 'PAN format looks wrong (e.g. ABCDE1234F).' });
  }

  const user = req.user;

  await db.prepare(`
    UPDATE users SET name=?, occupation=?, city=?, declared_income=?,
    monthly_debt=?, upi_txns=?, bill_ontime=?, account_age_months=?,
    phone_enc=?, pan_enc=? WHERE id=?
  `).run(
    String(body.name || user.name).trim().slice(0, 80),
    OCC.includes(body.occupation) ? body.occupation : user.occupation,
    String(body.city || '').trim().slice(0, 60),
    num(body.declared_income, 0, 1e7),
    num(body.monthly_debt, 0, 1e7),
    num(body.upi_txns, 0, 5000),
    num(body.bill_ontime, 0, 100, 70),
    num(body.account_age_months, 0, 600),
    phone && !phone.includes('•') ? encrypt(phone) : user.phone_enc,
    pan && !pan.includes('•') ? encrypt(pan) : user.pan_enc,
    user.id
  );

  await db.audit(user.id, 'profile_update', req.ip);
  res.json({ ok: true });
}));

router.get('/earnings', wrap(async (req, res) => {
  res.json(await earnings(req.user.id));
}));

router.post('/earnings', wrap(async (req, res) => {
  const body = req.body;
  const date = String(body.date || '').slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date) > new Date(Date.now() + 864e5)) {
    return res.status(400).json({ error: 'Pick a valid date (not in the future).' });
  }

  const income = num(body.income, 1, 200000);
  const hours = Math.min(24, Math.max(0.5, Number(body.hours) || 0));
  const jobs = num(body.jobs, 0, 500);
  const rating = body.rating
    ? Math.min(5, Math.max(1, Number(body.rating)))
    : null;

  if (!income) {
    return res.status(400).json({ error: 'Enter your income for the day (₹1 - ₹2,00,000).' });
  }

  await db.prepare(`
    INSERT INTO earnings(user_id, date, platform, income, hours, jobs, rating)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    req.user.id, date,
    String(body.platform || 'Other').slice(0, 40),
    income, hours, jobs, rating
  );

  res.json({ ok: true });
}));

router.delete('/earnings/:id', wrap(async (req, res) => {
  await db.prepare(
    'DELETE FROM earnings WHERE id=? AND user_id=?'
  ).run(req.params.id, req.user.id);

  res.json({ ok: true });
}));

router.get('/score', wrap(async (req, res) => {
  const score = await currentScore(req.user);
  const history = await db.prepare(
    'SELECT score, created_at FROM score_history WHERE user_id=? ORDER BY id DESC LIMIT 12'
  ).all(req.user.id);

  const rows = await earnings(req.user.id);
  const now = Date.now();
  const weekly = [];

  for (let w = 11; w >= 0; w--) {
    const from = now - (w + 1) * 7 * 864e5;
    const to = now - w * 7 * 864e5;

    weekly.push(rows.filter(item => {
      const time = new Date(item.date).getTime();
      return time > from && time <= to;
    }).reduce((sum, item) => sum + Number(item.income), 0));
  }

  res.json({
    ...score,
    history: history.reverse(),
    weekly,
    updated: new Date().toISOString()
  });
}));

router.post('/simulate', wrap(async (req, res) => {
  const base = computeScore(
    req.user,
    await earnings(req.user.id)
  ).metrics;
  const overrides = req.body || {};
  const metrics = { ...base };

  ['income', 'upi', 'bills', 'tenure'].forEach(key => {
    if (overrides[key] !== undefined) metrics[key] = num(overrides[key], 0, 1e7);
  });

  if (overrides.rating !== undefined) {
    metrics.rating = Math.min(5, Math.max(0, Number(overrides.rating)));
  }
  if (overrides.debt !== undefined) {
    metrics.debt = num(overrides.debt, 0, 1e7);
  }

  metrics.dti = metrics.income
    ? +(metrics.debt / metrics.income).toFixed(3)
    : (metrics.debt ? 1 : 0);

  const simulated = scoreFromMetrics(metrics);
  res.json({
    score: simulated.score,
    risk: simulated.risk,
    band: simulated.band,
    eligibility: simulated.eligibility
  });
}));

router.get('/lenders', wrap(async (req, res) => {
  const score = await currentScore(req.user);
  res.json({
    score: score.score,
    eligibility: score.eligibility,
    lenders: await matchLenders(req.user, score)
  });
}));

router.post('/loans', wrap(async (req, res) => {
  const score = await currentScore(req.user);
  const lenders = await matchLenders(req.user, score);
  const lender = lenders.find(item => item.id === req.body.lender_id);

  if (!lender) return res.status(404).json({ error: 'Lender not found.' });
  if (!lender.eligible) {
    return res.status(400).json({
      error: lender.reason || 'You are not eligible for this product yet.'
    });
  }

  const amount = num(req.body.amount, 0, 1e8);
  const tenure = num(req.body.tenure_months, 1, lender.tenure_max);

  if (amount < lender.min_amount || amount > lender.limit) {
    return res.status(400).json({
      error: `Amount must be between ₹${lender.min_amount.toLocaleString('en-IN')} and ₹${lender.limit.toLocaleString('en-IN')}.`
    });
  }

  const duplicate = await db.prepare(`
    SELECT 1 FROM applications
    WHERE user_id=? AND lender_id=? AND status='pending'
  `).get(req.user.id, lender.id);

  if (duplicate) {
    return res.status(409).json({
      error: 'You already have a pending application with this lender.'
    });
  }

  await db.prepare(`
    INSERT INTO applications
    (user_id, lender_id, product, amount, tenure_months, purpose, score_at_apply)
    VALUES(?,?,?,?,?,?,?)
  `).run(
    req.user.id, lender.id, lender.name, amount, tenure,
    String(req.body.purpose || '').slice(0, 200), score.score
  );

  await db.audit(req.user.id, 'loan_apply:' + lender.id, req.ip);
  res.json({ ok: true });
}));

router.get('/loans', wrap(async (req, res) => {
  res.json(await db.prepare(
    'SELECT * FROM applications WHERE user_id=? ORDER BY id DESC'
  ).all(req.user.id));
}));

router.get('/export', wrap(async (req, res) => {
  const user = req.user;
  await db.audit(user.id, 'data_export', req.ip);

  res.setHeader(
    'Content-Disposition',
    'attachment; filename="my-fininclusive-data.json"'
  );

  res.json({
    profile: {
      ...profileOf(user),
      phone: decrypt(user.phone_enc),
      pan: decrypt(user.pan_enc)
    },
    earnings: await earnings(user.id),
    score_history: await db.prepare(
      'SELECT score, risk, created_at FROM score_history WHERE user_id=?'
    ).all(user.id),
    applications: await db.prepare(
      'SELECT * FROM applications WHERE user_id=?'
    ).all(user.id),
    consent_given_at: user.consent_at
  });
}));

router.get('/activity', wrap(async (req, res) => {
  res.json(await db.prepare(
    'SELECT action, ip, created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 25'
  ).all(req.user.id));
}));

router.post('/delete', wrap(async (req, res) => {
  if (!bcrypt.compareSync(String(req.body.password || ''), req.user.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect.' });
  }

  if (req.user.role === 'admin') {
    return res.status(400).json({ error: 'Admin accounts cannot be deleted here.' });
  }

  await db.audit(null, 'account_deleted', req.ip);
  await db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);

  clear(res);
  res.json({ ok: true });
}));

module.exports = router;