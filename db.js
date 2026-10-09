const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { encrypt } = require('./lib/security');
const LENDERS = require('./data/lenders');

const dir = path.join(__dirname, 'storage');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'fininclusive.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone_enc TEXT, pan_enc TEXT,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'worker',
  verified INTEGER NOT NULL DEFAULT 0,
  occupation TEXT DEFAULT 'delivery_partner', city TEXT DEFAULT '',
  declared_income INTEGER DEFAULT 0, monthly_debt INTEGER DEFAULT 0,
  upi_txns INTEGER DEFAULT 0, bill_ontime INTEGER DEFAULT 70, account_age_months INTEGER DEFAULT 0,
  consent_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_login TEXT
);
CREATE TABLE IF NOT EXISTS otps(
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER DEFAULT 0, used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS earnings(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL, platform TEXT NOT NULL, income INTEGER NOT NULL, hours REAL NOT NULL,
  jobs INTEGER NOT NULL, rating REAL
);
CREATE TABLE IF NOT EXISTS score_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL, risk TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lenders(
  id TEXT PRIMARY KEY, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS applications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lender_id TEXT NOT NULL, product TEXT NOT NULL, amount INTEGER NOT NULL, tenure_months INTEGER NOT NULL,
  purpose TEXT, score_at_apply INTEGER, status TEXT NOT NULL DEFAULT 'pending', reviewer_note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_earn_user ON earnings(user_id, date);
`);

// (re)load lender catalogue from data/lenders.js on every start
const up = db.prepare('INSERT INTO lenders(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data');
db.transaction(() => { db.prepare('DELETE FROM lenders').run(); LENDERS.forEach(l => up.run(l.id, JSON.stringify(l))); })();

function seed() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@fininclusive.app').toLowerCase();
  if (!db.prepare('SELECT 1 FROM users WHERE email=?').get(adminEmail)) {
    db.prepare(`INSERT INTO users(name,email,password_hash,role,verified,consent_at) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP)`)
      .run('Banker Admin', adminEmail, bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@12345', 12), 'admin');
  }
  if (!db.prepare('SELECT 1 FROM users WHERE email=?').get('demo@fininclusive.app')) {
    const r = db.prepare(`INSERT INTO users(name,email,phone_enc,password_hash,role,verified,occupation,city,declared_income,monthly_debt,upi_txns,bill_ontime,account_age_months,consent_at)
      VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
      .run('Ravi Kumar', 'demo@fininclusive.app', encrypt('9876543210'), bcrypt.hashSync('Demo@12345', 12), 'worker',
        'delivery_partner', 'Mumbai', 24000, 3000, 48, 85, 20);
    const ins = db.prepare('INSERT INTO earnings(user_id,date,platform,income,hours,jobs,rating) VALUES(?,?,?,?,?,?,?)');
    const platforms = ['Swiggy', 'Zomato', 'Rapido', 'Zepto'];
    let seedv = 7; const rnd = () => (seedv = (seedv * 9301 + 49297) % 233280) / 233280;
    db.transaction(() => {
      for (let d = 89; d >= 0; d--) {
        if (rnd() < 0.12) continue; // a few rest days
        const dt = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
        const weekend = [0, 6].includes(new Date(dt).getDay());
        const hours = +(6 + rnd() * 4).toFixed(1);
        ins.run(r.lastInsertRowid, dt, platforms[Math.floor(rnd() * 4)], Math.round(hours * (85 + rnd() * 45) * (weekend ? 1.2 : 1)),
          hours, Math.round(hours * (1.4 + rnd())), +(4.2 + rnd() * 0.7).toFixed(1));
      }
    })();
  }
}
seed();

const audit = (userId, action, ip) => db.prepare('INSERT INTO audit_log(user_id,action,ip) VALUES(?,?,?)').run(userId || null, action, ip || '');
module.exports = db;
module.exports.audit = audit;
