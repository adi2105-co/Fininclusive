
const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const { encrypt } = require('./lib/security');
const LENDERS = require('./data/lenders');

// PostgreSQL BIGINT IDs are returned as strings by default.
// Our application uses numeric IDs.
types.setTypeParser(20, value => Number(value));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Configure it in server/.env locally and in Vercel Environment Variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Convert SQLite-style ? placeholders into PostgreSQL $1, $2, etc.
function convertSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

const db = {
  pool,

  prepare(sql) {
    const text = convertSql(sql);

    return {
      async get(...params) {
        const result = await pool.query(text, params);
        return result.rows[0];
      },

      async all(...params) {
        const result = await pool.query(text, params);
        return result.rows;
      },

      async run(...params) {
        const result = await pool.query(text, params);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.rows[0]?.id
        };
      }
    };
  },

  async query(sql, params = []) {
    return pool.query(sql, params);
  },

  async audit(userId, action, ip) {
    await pool.query(
      'INSERT INTO audit_log(user_id, action, ip) VALUES($1, $2, $3)',
      [userId || null, action, ip || '']
    );
  },

  async init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone_enc TEXT,
        pan_enc TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'worker',
        verified INTEGER NOT NULL DEFAULT 0,
        occupation TEXT DEFAULT 'delivery_partner',
        city TEXT DEFAULT '',
        declared_income INTEGER DEFAULT 0,
        monthly_debt INTEGER DEFAULT 0,
        upi_txns INTEGER DEFAULT 0,
        bill_ontime INTEGER DEFAULT 70,
        account_age_months INTEGER DEFAULT 0,
        consent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS otps (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        attempts INTEGER DEFAULT 0,
        used INTEGER DEFAULT 0,
        created_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS earnings (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        platform TEXT NOT NULL,
        income INTEGER NOT NULL,
        hours DOUBLE PRECISION NOT NULL,
        jobs INTEGER NOT NULL,
        rating DOUBLE PRECISION
      );

      CREATE TABLE IF NOT EXISTS score_history (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        risk TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lenders (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS applications (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lender_id TEXT NOT NULL,
        product TEXT NOT NULL,
        amount INTEGER NOT NULL,
        tenure_months INTEGER NOT NULL,
        purpose TEXT,
        score_at_apply INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewer_note TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT,
        action TEXT NOT NULL,
        ip TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_earn_user
        ON earnings(user_id, date);

      CREATE INDEX IF NOT EXISTS idx_otps_email
        ON otps(email, purpose, created_at);

      CREATE INDEX IF NOT EXISTS idx_apps_user
        ON applications(user_id, id);
    `);

    // Refresh lender data without clearing the whole table.
    for (const lender of LENDERS) {
      await pool.query(
        `INSERT INTO lenders(id, data) VALUES($1, $2)
         ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data`,
        [lender.id, JSON.stringify(lender)]
      );
    }

    const adminEmail = (
      process.env.ADMIN_EMAIL || 'admin@fininclusive.app'
    ).toLowerCase();

    await pool.query(
      `INSERT INTO users
       (name, email, password_hash, role, verified, consent_at)
       VALUES($1, $2, $3, 'admin', 1, CURRENT_TIMESTAMP)
       ON CONFLICT(email) DO NOTHING`,
      [
        'Banker Admin',
        adminEmail,
        bcrypt.hashSync(
          process.env.ADMIN_PASSWORD || 'Admin@12345',
          12
        )
      ]
    );

    const demo = await pool.query(
      'SELECT id FROM users WHERE email=$1',
      ['demo@fininclusive.app']
    );

    if (demo.rowCount === 0) {
      const result = await pool.query(
        `INSERT INTO users
         (name, email, phone_enc, password_hash, role, verified,
          occupation, city, declared_income, monthly_debt,
          upi_txns, bill_ontime, account_age_months, consent_at)
         VALUES
         ($1, $2, $3, $4, 'worker', 1, $5, $6, $7, $8,
          $9, $10, $11, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          'Ravi Kumar',
          'demo@fininclusive.app',
          encrypt('9876543210'),
          bcrypt.hashSync('Demo@12345', 12),
          'delivery_partner',
          'Mumbai',
          24000,
          3000,
          48,
          85,
          20
        ]
      );

      const userId = result.rows[0].id;
      const platforms = ['Swiggy', 'Zomato', 'Rapido', 'Zepto'];
      let seed = 7;
      const random = () =>
        (seed = (seed * 9301 + 49297) % 233280) / 233280;

      for (let d = 89; d >= 0; d--) {
        if (random() < 0.12) continue;

        const date = new Date(Date.now() - d * 864e5);
        const dateString = date.toISOString().slice(0, 10);
        const weekend = [0, 6].includes(date.getUTCDay());
        const hours = +(6 + random() * 4).toFixed(1);

        await pool.query(
          `INSERT INTO earnings
           (user_id, date, platform, income, hours, jobs, rating)
           VALUES($1, $2, $3, $4, $5, $6, $7)`,
          [
            userId,
            dateString,
            platforms[Math.floor(random() * platforms.length)],
            Math.round(hours * (85 + random() * 45) * (weekend ? 1.2 : 1)),
            hours,
            Math.round(hours * (1.4 + random())),
            +(4.2 + random() * 0.7).toFixed(1)
          ]
        );
      }
    }

    console.log('Neon PostgreSQL tables and seed data are ready.');
  }
};

module.exports = db;