const nodemailer = require('nodemailer');
const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
// Works with ANY provider: set SMTP_HOST/SMTP_PORT (Outlook, Brevo, Mailgun, Zoho...). If SMTP_HOST is empty, Gmail is used.
const transporter = configured
  ? nodemailer.createTransport(process.env.SMTP_HOST
      ? { host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), secure: +(process.env.SMTP_PORT || 587) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
      : { service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;

const wrap = (title, body) => `
<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0b1f3a,#0f766e);padding:22px 26px;color:#fff">
    <div style="font-size:22px;font-weight:700;letter-spacing:.3px">Fin<span style="color:#5eead4">Inclusive</span></div>
    <div style="opacity:.8;font-size:13px">Credit for everyone who works</div>
  </div>
  <div style="padding:26px;color:#0f172a">
    <h2 style="margin:0 0 10px;font-size:18px">${title}</h2>${body}
    <p style="font-size:12px;color:#64748b;margin-top:26px">If you did not request this, you can safely ignore this email. Never share this code with anyone.</p>
  </div>
</div>`;

async function send(to, subject, html, text) {
  if (!configured) {
    console.log(`\n📧  [DEV MAIL → ${to}] ${subject}\n    ${text}\n`);
    return { dev: true };
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
  return { dev: false };
}

const sendOtp = (to, name, otp, purpose) => {
  const label = purpose === 'reset' ? 'reset your password' : 'verify your email';
  return send(to, `${otp} is your FinInclusive verification code`,
    wrap(`Hi ${name}, use this code to ${label}`,
      `<div style="font-size:34px;letter-spacing:10px;font-weight:700;background:#f0fdfa;border:1px dashed #14b8a6;border-radius:12px;padding:16px;text-align:center;color:#0f766e">${otp}</div>
       <p style="font-size:14px;color:#475569">This code expires in <b>5 minutes</b>.</p>`),
    `Your FinInclusive code is ${otp} (valid for 5 minutes).`);
};
const sendLoanUpdate = (to, name, product, status, note) =>
  send(to, `Your loan application was ${status}`,
    wrap(`Loan application ${status}`, `<p>Hi ${name}, your application for <b>${product}</b> is now <b>${status}</b>.</p>${note ? `<p style="color:#475569">Reviewer note: ${note}</p>` : ''}`),
    `Your application for ${product} is ${status}. ${note || ''}`);

module.exports = { sendOtp, sendLoanUpdate, configured };
