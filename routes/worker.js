const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { audit } = db;
const { auth, clear } = require('../lib/middleware');
const { encrypt, decrypt, maskPhone, maskPan } = require('../lib/security');
const { computeScore, scoreFromMetrics } = require('../lib/scoring');

router.use(auth);
const OCC = ['delivery_partner', 'ride_driver', 'street_vendor', 'freelancer', 'daily_wage', 'other'];
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
const earnings = id => db.prepare('SELECT * FROM earnings WHERE user_id=? ORDER BY date DESC, id DESC').all(id);

function profileOf(u) {
  return { name: u.name, email: u.email, phone: maskPhone(decrypt(u.phone_enc)), pan: maskPan(decrypt(u.pan_enc)), occupation: u.occupation, city: u.city,
    declared_income: u.declared_income, monthly_debt: u.monthly_debt, upi_txns: u.upi_txns, bill_ontime: u.bill_ontime, account_age_months: u.account_age_months, created_at: u.created_at };
}
function currentScore(u) {
  const s = computeScore(u, earnings(u.id));
  const last = db.prepare('SELECT * FROM score_history WHERE user_id=? ORDER BY id DESC LIMIT 1').get(u.id);
  if (!last || last.score !== s.score) db.prepare('INSERT INTO score_history(user_id,score,risk) VALUES(?,?,?)').run(u.id, s.score, s.risk);
  return s;
}
function matchLenders(u, s) {
  const { income } = s.metrics, cap = s.eligibility.maxLoan;
  return db.prepare('SELECT data FROM lenders').all().map(r => JSON.parse(r.data)).map(l => {
    const occOk = l.segments.includes('any') || l.segments.includes(u.occupation);
    const scoreOk = s.score >= l.min_score, incomeOk = income >= l.min_income || (l.scheme && l.min_income === 0);
    const limit = (l.scheme && l.max_amount <= 50000) ? l.max_amount : Math.min(l.max_amount, cap);
    const amountOk = limit >= l.min_amount;
    const eligible = occOk && scoreOk && incomeOk && amountOk;
    let reason = '';
    if (!occOk) reason = 'Not offered for your occupation type';
    else if (!scoreOk) reason = `Needs ${l.min_score - s.score} more score points`;
    else if (!incomeOk) reason = `Needs monthly income of at least ₹${l.min_income.toLocaleString('en-IN')}`;
    else if (!amountOk) reason = 'Your current eligible amount is below this lender\'s minimum';
    const margin = l.min_score ? Math.min(1, (s.score - l.min_score) / (850 - l.min_score)) : 0.6;
    const match = eligible ? Math.round(55 + 45 * Math.max(0, margin)) : 0;
    return { ...l, eligible, reason, match, limit: eligible ? limit : 0, your_rate: Math.min(l.rate_max, Math.max(l.rate_min, +(s.eligibility.rate).toFixed(1))) };
  }).sort((a, b) => (b.eligible - a.eligible) || (b.match - a.match));
}

router.get('/profile', (req, res) => res.json(profileOf(req.user)));
router.put('/profile', (req, res) => {
  const b = req.body, phone = String(b.phone || '').trim(), pan = String(b.pan || '').trim().toUpperCase();
  if (phone && !phone.includes('•') && !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  if (pan && !pan.includes('•') && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return res.status(400).json({ error: 'PAN format looks wrong (e.g. ABCDE1234F).' });
  const u = req.user;
  db.prepare(`UPDATE users SET name=?, occupation=?, city=?, declared_income=?, monthly_debt=?, upi_txns=?, bill_ontime=?, account_age_months=?, phone_enc=?, pan_enc=? WHERE id=?`).run(
    String(b.name || u.name).trim().slice(0, 80), OCC.includes(b.occupation) ? b.occupation : u.occupation, String(b.city || '').trim().slice(0, 60),
    num(b.declared_income, 0, 1e7), num(b.monthly_debt, 0, 1e7), num(b.upi_txns, 0, 5000), num(b.bill_ontime, 0, 100, 70), num(b.account_age_months, 0, 600),
    phone && !phone.includes('•') ? encrypt(phone) : u.phone_enc, pan && !pan.includes('•') ? encrypt(pan) : u.pan_enc, u.id);
  audit(u.id, 'profile_update', req.ip);
  res.json({ ok: true });
});

router.get('/earnings', (req, res) => res.json(earnings(req.user.id)));
router.post('/earnings', (req, res) => {
  const b = req.body, date = String(b.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date) > new Date(Date.now() + 864e5)) return res.status(400).json({ error: 'Pick a valid date (not in the future).' });
  const income = num(b.income, 1, 200000), hours = Math.min(24, Math.max(0.5, Number(b.hours) || 0)), jobs = num(b.jobs, 0, 500), rating = b.rating ? Math.min(5, Math.max(1, Number(b.rating))) : null;
  if (!income) return res.status(400).json({ error: 'Enter your income for the day (₹1 - ₹2,00,000).' });
  db.prepare('INSERT INTO earnings(user_id,date,platform,income,hours,jobs,rating) VALUES(?,?,?,?,?,?,?)').run(req.user.id, date, String(b.platform || 'Other').slice(0, 40), income, hours, jobs, rating);
  res.json({ ok: true });
});
router.delete('/earnings/:id', (req, res) => { db.prepare('DELETE FROM earnings WHERE id=? AND user_id=?').run(req.params.id, req.user.id); res.json({ ok: true }); });

router.get('/score', (req, res) => {
  const s = currentScore(req.user);
  const history = db.prepare('SELECT score, created_at FROM score_history WHERE user_id=? ORDER BY id DESC LIMIT 12').all(req.user.id).reverse();
  const e = earnings(req.user.id), now = Date.now(), weekly = [];
  for (let w = 11; w >= 0; w--) {
    const from = now - (w + 1) * 7 * 864e5, to = now - w * 7 * 864e5;
    weekly.push(e.filter(x => { const t = new Date(x.date).getTime(); return t > from && t <= to; }).reduce((a, x) => a + x.income, 0));
  }
  res.json({ ...s, history, weekly, updated: new Date().toISOString() });
});
router.post('/simulate', (req, res) => {
  const base = computeScore(req.user, earnings(req.user.id)).metrics, o = req.body || {};
  const m = { ...base };
  ['income', 'upi', 'bills', 'tenure'].forEach(k => { if (o[k] !== undefined) m[k] = num(o[k], 0, 1e7); });
  if (o.rating !== undefined) m.rating = Math.min(5, Math.max(0, Number(o.rating)));
  if (o.debt !== undefined) m.debt = num(o.debt, 0, 1e7);
  m.dti = m.income ? +(m.debt / m.income).toFixed(3) : (m.debt ? 1 : 0);
  const sim = scoreFromMetrics(m);
  res.json({ score: sim.score, risk: sim.risk, band: sim.band, eligibility: sim.eligibility });
});

router.get('/lenders', (req, res) => { const s = currentScore(req.user); res.json({ score: s.score, eligibility: s.eligibility, lenders: matchLenders(req.user, s) }); });
router.post('/loans', (req, res) => {
  const s = currentScore(req.user), l = matchLenders(req.user, s).find(x => x.id === req.body.lender_id);
  if (!l) return res.status(404).json({ error: 'Lender not found.' });
  if (!l.eligible) return res.status(400).json({ error: l.reason || 'You are not eligible for this product yet.' });
  const amount = num(req.body.amount, 0, 1e8), tenure = num(req.body.tenure_months, 1, l.tenure_max);
  if (amount < l.min_amount || amount > l.limit) return res.status(400).json({ error: `Amount must be between ₹${l.min_amount.toLocaleString('en-IN')} and ₹${l.limit.toLocaleString('en-IN')}.` });
  const dup = db.prepare(`SELECT 1 FROM applications WHERE user_id=? AND lender_id=? AND status='pending'`).get(req.user.id, l.id);
  if (dup) return res.status(409).json({ error: 'You already have a pending application with this lender.' });
  db.prepare('INSERT INTO applications(user_id,lender_id,product,amount,tenure_months,purpose,score_at_apply) VALUES(?,?,?,?,?,?,?)')
    .run(req.user.id, l.id, l.name, amount, tenure, String(req.body.purpose || '').slice(0, 200), s.score);
  audit(req.user.id, 'loan_apply:' + l.id, req.ip);
  res.json({ ok: true });
});
router.get('/loans', (req, res) => res.json(db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY id DESC').all(req.user.id)));

// ---- Privacy (DPDP-style rights) ----
router.get('/export', (req, res) => {
  const u = req.user;
  audit(u.id, 'data_export', req.ip);
  res.setHeader('Content-Disposition', 'attachment; filename="my-fininclusive-data.json"');
  res.json({ profile: { ...profileOf(u), phone: decrypt(u.phone_enc), pan: decrypt(u.pan_enc) }, earnings: earnings(u.id),
    score_history: db.prepare('SELECT score,risk,created_at FROM score_history WHERE user_id=?').all(u.id),
    applications: db.prepare('SELECT * FROM applications WHERE user_id=?').all(u.id), consent_given_at: u.consent_at });
});
router.get('/activity', (req, res) => res.json(db.prepare('SELECT action, ip, created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 25').all(req.user.id)));
router.post('/delete', (req, res) => {
  if (!bcrypt.compareSync(String(req.body.password || ''), req.user.password_hash)) return res.status(401).json({ error: 'Password is incorrect.' });
  if (req.user.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be deleted here.' });
  audit(null, 'account_deleted', req.ip);
  db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
  clear(res); res.json({ ok: true });
});

module.exports = router;
