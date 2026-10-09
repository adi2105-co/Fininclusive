const crypto = require('crypto');
const KEY = crypto.createHash('sha256').update(process.env.DATA_KEY || process.env.JWT_SECRET || 'dev-only-key').digest();

// AES-256-GCM field encryption for sensitive personal data (phone, PAN)
function encrypt(text) {
  if (text === undefined || text === null || text === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
function decrypt(payload) {
  if (!payload) return '';
  try {
    const [iv, tag, enc] = payload.split('.').map(p => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; }
}
const maskPhone = p => (p ? p.replace(/.(?=.{3})/g, '•') : '');
const maskPan = p => (p ? p.slice(0, 2) + '••••••' + p.slice(-2) : '');
const genOtp = () => String(crypto.randomInt(100000, 1000000));
const hashOtp = (otp, email) => crypto.createHmac('sha256', KEY).update(email + ':' + otp).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

module.exports = { encrypt, decrypt, maskPhone, maskPan, genOtp, hashOtp, safeEqual };
