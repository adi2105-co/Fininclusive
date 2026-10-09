# FinInclusive
**AI-driven alternative credit scoring for informal-economy workers**
Vidya Vikas Education Trust's Universal College of Engineering, Vasai (E)

Gig workers, street vendors and daily-wage earners have no payslips, so banks ignore them. FinInclusive turns their daily earnings,
UPI activity, bill-payment habits and platform ratings into a transparent 300-850 credit score and matches them with real lenders.

## Run it (3 steps)
Requirements: **Node.js 18+** (https://nodejs.org). Nothing else - the database is a local SQLite file created automatically.

```bash
cd FinInclusive
npm run setup      # installs server dependencies (once)
npm start          # starts the app
```
Open **http://localhost:5000**

| Role | Email | Password |
|---|---|---|
| Worker (demo data) | demo@fininclusive.app | Demo@12345 |
| Banker / admin | admin@fininclusive.app | Admin@12345 |

## Email OTP
* **Without setup:** OTP is printed in the terminal and shown on screen (dev mode) - perfect for demos.
* **Real emails (Gmail):** copy `server/.env.example` to `server/.env`, then set `SMTP_USER` (your Gmail) and `SMTP_PASS`
  (a Google *App password*: Google Account → Security → 2-Step Verification → App passwords). Restart the server.
  OTPs can be delivered to **any** email address; only the *sending* account is configured. For Outlook/Brevo/Zoho etc. also set `SMTP_HOST` and `SMTP_PORT`.
  With SMTP configured the OTP is *never* shown on screen.

## Project structure
```
FinInclusive/
├── client/                     # Frontend (plain HTML/CSS/JS - no build step)
│   ├── index.html              # Landing page
│   ├── login.html  register.html (email OTP)  forgot.html (OTP reset)
│   ├── app.html                # Worker portal (SPA: dashboard, earnings, score, loans, applications, profile, privacy)
│   ├── admin.html              # Banker portal (overview, workers, loan review)
│   ├── css/style.css           # Design system, light + dark mode
│   └── js/  common.js auth.js app.js admin.js  vendor/chart.umd.js
├── server/                     # Backend (Node.js + Express)
│   ├── server.js               # App entry, security headers, rate limits
│   ├── db.js                   # SQLite schema + demo data seeding
│   ├── routes/ auth.js worker.js admin.js
│   ├── lib/    security.js (AES-256-GCM, OTP hashing) mailer.js scoring.js middleware.js
│   └── data/lenders.js         # 17 real lenders / schemes (editable)
└── README.md
```

## How the score works (explainable)
Eight factors, each scaled 0-1 and weighted: debt-to-income 20%, income 15%, income consistency 15%, bills paid on time 12%,
platform rating 10%, account age 10%, UPI activity 10%, jobs completed 8% → score = 300 + 550 × weighted total.
Every factor's point contribution is shown to the user (this is the explainability layer; it can be replaced by a trained
Gradient-Boosting model + SHAP behind the same `computeScore()` function).
Risk: ≥700 Low · 600-699 Medium · <600 High. Loan limit = min(income × multiplier, what a 40%-of-income EMI can repay).

## Privacy & security
bcrypt password hashing · AES-256-GCM encryption for phone/PAN · email-OTP verification (hashed, 5-min expiry, 5 attempts, hourly cap) ·
HttpOnly + SameSite session cookie · Helmet security headers/CSP · rate limiting · JSON-only API · bankers see masked contact data ·
audit log · user can download or permanently delete all their data.

## Deploy (later)
Push to GitHub, then deploy the repo on Render/Railway: build `npm run setup`, start `npm start`, set env vars
`NODE_ENV=production`, `JWT_SECRET`, `DATA_KEY`, SMTP vars, `ADMIN_PASSWORD`, and mount a persistent disk for `server/storage`
(or switch `db.js` to PostgreSQL/Neon).

## Notes
Lender rates and limits are indicative, from public product information - confirm on each lender's site and edit `server/data/lenders.js`.
Change the seeded admin password before any public deployment.
