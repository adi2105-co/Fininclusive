
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      'upgrade-insecure-requests': null
    }
  }
}));

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    !req.is('application/json')
  ) {
    return res.status(415).json({ error: 'JSON only.' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60e3,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes.' }
}));

app.use('/api', rateLimit({
  windowMs: 60e3,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(async (req, res, next) => {
  try {
    await ensureDb();
    next();
  } catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ error: 'Server initialization failed' });
  }
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/worker'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', app: 'FinInclusive' })
);

app.use('/api', (req, res) =>
  res.status(404).json({ error: 'Not found' })
);

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

app.use((req, res) =>
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'))
);

const PORT = process.env.PORT || 5000;

module.exports = app;

let dbInitPromise;

async function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = db.init().catch((error) => {
      dbInitPromise = null;
      throw error;
    });
  }

  return dbInitPromise;
}

if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  ensureDb()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`FinInclusive is running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error('Failed to initialize the database:', error);
      process.exit(1);
    });
}