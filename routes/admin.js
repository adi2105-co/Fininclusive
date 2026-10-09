const router = require('express').Router();
const db = require('../db');
const { audit } = db;
const { auth, adminOnly } = require('../lib/middleware');
const { computeScore } = require('../lib/scoring');
const { decrypt, maskPhone } = require('../lib/security');
const mailer = require('../lib/mailer');

router.use(auth, adminOnly);
const ratings = id => db.prepare('SELECT * FROM earnings WHERE user_id=?').all(id);

router.get('/stats', (req, res) => {
  const workers = db.prepare(`SELECT * FROM users WHERE role='worker' AND verified=1`).all();
  const scores = workers.map(w => computeScore(w, ratings(w.id)));
  const avg = scores.length ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length) : 0;
  const apps = db.prepare('SELECT status, COUNT(*) c, COALESCE(SUM(amount),0) amt FROM applications GROUP BY status').all();
  const bands = { Low: 0, Medium: 0, High: 0 }; scores.forEach(s => bands[s.risk]++);
  res.json({ workers: workers.length, avgScore: avg, bands, applications: apps,
    recent: db.prepare(`SELECT a.id, a.product, a.amount, a.status, a.created_at, u.name FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 6`).all() });
});
router.get('/workers', (req, res) => {
  const q = `%${String(req.query.q || '').toLowerCase()}%`;
  const rows = db.prepare(`SELECT * FROM users WHERE role='worker' AND verified=1 AND (lower(name) LIKE ? OR lower(email) LIKE ?) ORDER BY id DESC`).all(q, q);
  res.json(rows.map(u => { const s = computeScore(u, ratings(u.id)); return { id: u.id, name: u.name, email: u.email, city: u.city, occupation: u.occupation, score: s.score, risk: s.risk, income: s.metrics.income, joined: u.created_at }; }));
});
router.get('/workers/:id', (req, res) => {
  const u = db.prepare(`SELECT * FROM users WHERE id=? AND role='worker'`).get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  audit(req.user.id, 'admin_view_worker:' + u.id, req.ip);
  res.json({ profile: { name: u.name, email: u.email, phone: maskPhone(decrypt(u.phone_enc)), city: u.city, occupation: u.occupation }, score: computeScore(u, ratings(u.id)),
    applications: db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY id DESC').all(u.id) });
});
router.get('/loans', (req, res) => {
  const st = req.query.status;
  const rows = db.prepare(`SELECT a.*, u.name, u.email FROM applications a JOIN users u ON u.id=a.user_id ${st ? 'WHERE a.status=?' : ''} ORDER BY a.id DESC`).all(...(st ? [st] : []));
  res.json(rows);
});
router.patch('/loans/:id', async (req, res) => {
  const status = req.body.status, note = String(req.body.note || '').slice(0, 300);
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const a = db.prepare('SELECT a.*, u.name, u.email FROM applications a JOIN users u ON u.id=a.user_id WHERE a.id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE applications SET status=?, reviewer_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, note, a.id);
  audit(req.user.id, `loan_${status}:${a.id}`, req.ip);
  try { if (status !== 'pending') await mailer.sendLoanUpdate(a.email, a.name.split(' ')[0], a.product, status, note); } catch (e) { console.error('mail failed', e.message); }
  res.json({ ok: true });
});
module.exports = router;
