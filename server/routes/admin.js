
const router = require('express').Router();
const db = require('../db');
const { auth, adminOnly } = require('../lib/middleware');
const { computeScore } = require('../lib/scoring');
const { decrypt, maskPhone } = require('../lib/security');
const mailer = require('../lib/mailer');

router.use(auth, adminOnly);

const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ratings = id =>
  db.prepare('SELECT * FROM earnings WHERE user_id=?').all(id);

router.get('/stats', wrap(async (req, res) => {
  const workers = await db.prepare(
    "SELECT * FROM users WHERE role='worker' AND verified=1"
  ).all();

  const scores = await Promise.all(
    workers.map(async worker =>
      computeScore(worker, await ratings(worker.id))
    )
  );

  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score.score, 0) / scores.length)
    : 0;

  const applications = await db.prepare(`
    SELECT status, COUNT(*) AS c, COALESCE(SUM(amount), 0) AS amt
    FROM applications GROUP BY status
  `).all();

  const bands = { Low: 0, Medium: 0, High: 0 };
  scores.forEach(score => bands[score.risk]++);

  const recent = await db.prepare(`
    SELECT a.id, a.product, a.amount, a.status, a.created_at, u.name
    FROM applications a JOIN users u ON u.id=a.user_id
    ORDER BY a.id DESC LIMIT 6
  `).all();

  res.json({
    workers: workers.length,
    avgScore: average,
    bands,
    applications,
    recent
  });
}));

router.get('/workers', wrap(async (req, res) => {
  const query = `%${String(req.query.q || '').toLowerCase()}%`;

  const rows = await db.prepare(`
    SELECT * FROM users
    WHERE role='worker' AND verified=1
      AND (lower(name) LIKE ? OR lower(email) LIKE ?)
    ORDER BY id DESC
  `).all(query, query);

  const result = await Promise.all(rows.map(async user => {
    const score = computeScore(user, await ratings(user.id));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city,
      occupation: user.occupation,
      score: score.score,
      risk: score.risk,
      income: score.metrics.income,
      joined: user.created_at
    };
  }));

  res.json(result);
}));

router.get('/workers/:id', wrap(async (req, res) => {
  const user = await db.prepare(
    "SELECT * FROM users WHERE id=? AND role='worker'"
  ).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'Not found' });

  await db.audit(req.user.id, 'admin_view_worker:' + user.id, req.ip);

  res.json({
    profile: {
      name: user.name,
      email: user.email,
      phone: maskPhone(decrypt(user.phone_enc)),
      city: user.city,
      occupation: user.occupation
    },
    score: computeScore(user, await ratings(user.id)),
    applications: await db.prepare(
      'SELECT * FROM applications WHERE user_id=? ORDER BY id DESC'
    ).all(user.id)
  });
}));

router.get('/loans', wrap(async (req, res) => {
  const status = req.query.status;

  const rows = status
    ? await db.prepare(`
        SELECT a.*, u.name, u.email
        FROM applications a JOIN users u ON u.id=a.user_id
        WHERE a.status=? ORDER BY a.id DESC
      `).all(status)
    : await db.prepare(`
        SELECT a.*, u.name, u.email
        FROM applications a JOIN users u ON u.id=a.user_id
        ORDER BY a.id DESC
      `).all();

  res.json(rows);
}));

router.patch('/loans/:id', wrap(async (req, res) => {
  const status = req.body.status;
  const note = String(req.body.note || '').slice(0, 300);

  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const application = await db.prepare(`
    SELECT a.*, u.name, u.email
    FROM applications a JOIN users u ON u.id=a.user_id
    WHERE a.id=?
  `).get(req.params.id);

  if (!application) return res.status(404).json({ error: 'Not found' });

  await db.prepare(`
    UPDATE applications
    SET status=?, reviewer_note=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(status, note, application.id);

  await db.audit(req.user.id, `loan_${status}:${application.id}`, req.ip);

  try {
    if (status !== 'pending') {
      await mailer.sendLoanUpdate(
        application.email,
        application.name.split(' ')[0],
        application.product,
        status,
        note
      );
    }
  } catch (error) {
    console.error('Loan update email failed:', error.message);
  }

  res.json({ ok: true });
}));

module.exports = router;