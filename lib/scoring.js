// FinInclusive explainable credit-scoring engine (score range 300-850).
// Every factor returns a 0..1 sub-score and a point contribution so each decision can be explained.
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const SPAN = 550;

const FACTORS = [
  { key: 'dti',         label: 'Debt-to-income ratio',  weight: 20, f: m => clamp(1 - m.dti / 0.6),                 tip: 'Repay or consolidate existing debts. Keeping EMIs under 20% of income gives the biggest boost.' },
  { key: 'income',      label: 'Monthly income',        weight: 15, f: m => clamp((m.income - 8000) / 52000),       tip: 'Log every day of work. More recorded income = more lending capacity.' },
  { key: 'consistency', label: 'Income consistency',    weight: 15, f: m => clamp(1 - m.cv / 0.8),                  tip: 'Work steadier weeks. Smooth weekly earnings signal lower repayment risk.' },
  { key: 'bills',       label: 'Bills paid on time',    weight: 12, f: m => clamp((m.bills - 50) / 50),             tip: 'Pay electricity, mobile and rent on time - lenders count it as a repayment habit.' },
  { key: 'rating',      label: 'Platform rating',       weight: 10, f: m => clamp((m.rating - 3) / 2),              tip: 'Keep your customer rating above 4.5 by being punctual and polite.' },
  { key: 'tenure',      label: 'Account age',           weight: 10, f: m => clamp(m.tenure / 36),                   tip: 'Time helps. Keep your accounts active - 3 years gives full marks.' },
  { key: 'upi',         label: 'UPI / digital activity',weight: 10, f: m => clamp(m.upi / 80),                      tip: 'Accept and make payments through UPI instead of cash to build a digital footprint.' },
  { key: 'jobs',        label: 'Jobs completed',        weight: 8,  f: m => clamp(m.jobs / 120),                    tip: 'A higher volume of completed jobs shows reliable work history.' },
];

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function metrics(user, earnings) {
  const now = Date.now(), DAY = 864e5;
  const recent = earnings.filter(e => now - new Date(e.date).getTime() <= 90 * DAY);
  let income = user.declared_income || 0, rating = 0, jobs = 0, hours = 0, cv = 0.45, weeks = 0;
  if (recent.length) {
    const first = Math.min(...recent.map(e => new Date(e.date).getTime()));
    const span = Math.max(30, Math.ceil((now - first) / DAY));
    const total = recent.reduce((s, e) => s + e.income, 0);
    income = Math.round(total / span * 30);
    jobs = Math.round(recent.reduce((s, e) => s + e.jobs, 0) / span * 30);
    hours = Math.round(recent.reduce((s, e) => s + e.hours, 0) / span * 7);
    const rated = recent.filter(e => e.rating);
    rating = rated.length ? mean(rated.map(e => e.rating)) : 0;
    const wk = {};
    recent.forEach(e => { const k = Math.floor((now - new Date(e.date).getTime()) / (7 * DAY)); wk[k] = (wk[k] || 0) + e.income; });
    const vals = Object.values(wk); weeks = vals.length;
    if (vals.length >= 3) { const mu = mean(vals); const sd = Math.sqrt(mean(vals.map(v => (v - mu) ** 2))); cv = mu ? sd / mu : 1; }
  }
  const debt = user.monthly_debt || 0;
  return {
    income, jobs, hours, weeks, cv: +cv.toFixed(3), rating: +rating.toFixed(2), debt,
    dti: income ? +(debt / income).toFixed(3) : (debt ? 1 : 0),
    tenure: user.account_age_months || 0,
    upi: user.upi_txns || 0,
    bills: user.bill_ontime == null ? 70 : user.bill_ontime,
    hasData: recent.length > 0,
  };
}

function riskOf(score) { return score >= 700 ? 'Low' : score >= 600 ? 'Medium' : 'High'; }
const bandOf = s => (s >= 750 ? 'Excellent' : s >= 700 ? 'Good' : s >= 650 ? 'Fair' : s >= 600 ? 'Building' : 'Needs work');

function eligibility(score, m) {
  const mult = score >= 750 ? 3 : score >= 700 ? 2.5 : score >= 650 ? 2 : score >= 600 ? 1.2 : score >= 500 ? 0.6 : 0.3;
  const rate = +(12 + (850 - score) / SPAN * 18).toFixed(1);
  const maxEmi = Math.max(0, 0.4 * m.income - m.debt);
  const r = rate / 1200, n = 24;
  const principalCap = maxEmi * (1 - Math.pow(1 + r, -n)) / r;
  const maxLoan = Math.max(0, Math.floor(Math.min(mult * m.income, principalCap) / 1000) * 1000);
  return { maxLoan, maxEmi: Math.round(maxEmi), rate, multiplier: mult };
}

function scoreFromMetrics(m) {
  let total = 0;
  const factors = FACTORS.map(F => {
    const sub = F.f(m);
    const points = Math.round(F.weight / 100 * SPAN * sub);
    const max = Math.round(F.weight / 100 * SPAN);
    total += F.weight / 100 * SPAN * sub;
    return { key: F.key, label: F.label, weight: F.weight, sub: +sub.toFixed(2), points, max, gap: max - points, tip: F.tip };
  });
  const score = Math.round(300 + total);
  const eligible = eligibility(score, m);
  return {
    score, risk: riskOf(score), band: bandOf(score), factors, metrics: m, eligibility: eligible,
    tips: [...factors].sort((a, b) => b.gap - a.gap).slice(0, 3).map(f => ({ label: f.label, gain: f.gap, tip: f.tip })),
  };
}

const computeScore = (user, earnings) => scoreFromMetrics(metrics(user, earnings));

module.exports = { computeScore, scoreFromMetrics, metrics, eligibility, riskOf };
