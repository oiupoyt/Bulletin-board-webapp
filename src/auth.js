import crypto from 'node:crypto';
import { config } from './config.js';

// Cache derived password hash for fast and constant-time verification
let computedAdminHash = null;

export function hashPassword(plainPassword, salt = crypto.randomBytes(16).toString('hex')) {
  const derivedKey = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalDerived] = storedHash.split(':');
  const checkDerived = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  const bufA = Buffer.from(originalDerived, 'hex');
  const bufB = Buffer.from(checkDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// In-memory rate limiting against brute-force password guessing
const loginAttempts = new Map();

export function checkLoginRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  if (record.lockedUntil && now < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      error: `Too many failed attempts. Temporary lockout active. Please retry in ${minutesLeft} minute(s).`,
    };
  }

  // If lockout expired, reset
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordLoginFailure(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, firstAttempt: now };
  record.count += 1;

  // If 5 failed attempts reached, lock for 15 minutes
  if (record.count >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000;
  }
  loginAttempts.set(ip, record);
}

export function recordLoginSuccess(ip) {
  loginAttempts.delete(ip);
}

// Initialize admin hash from config or hash plain password on startup
function getTargetAdminHash() {
  if (computedAdminHash) return computedAdminHash;
  if (config.adminPasswordHash && config.adminPasswordHash.includes(':')) {
    computedAdminHash = config.adminPasswordHash;
  } else {
    computedAdminHash = hashPassword(config.adminPassword);
  }
  return computedAdminHash;
}

// Session Token Management (HMAC-SHA256 signed payload with timestamp)
export function createSessionToken() {
  if (!config.sessionSecret) {
    throw new Error('SESSION_SECRET is not configured. Set it in .env before enabling admin access.');
  }
  const payload = {
    role: 'admin',
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };
  const jsonStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', config.sessionSecret);
  hmac.update(jsonStr);
  const signature = hmac.digest('base64url');
  return `${jsonStr}.${signature}`;
}

export function verifySessionToken(token) {
  if (!config.sessionSecret) return false;
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [jsonStr, signature] = token.split('.');
  if (!jsonStr || !signature) return false;

  const hmac = crypto.createHmac('sha256', config.sessionSecret);
  hmac.update(jsonStr);
  const expectedSig = hmac.digest('base64url');

  const bufA = Buffer.from(signature);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(jsonStr, 'base64url').toString('utf8'));
    // Sessions valid for 7 days
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.issuedAt > maxAgeMs) {
      return false;
    }
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

// Express Auth Middleware
export function requireAdminAuth(req, res, next) {
  let token = null;

  // 1. Check HttpOnly cookie
  if (req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, decodeURIComponent(v.join('='))];
      })
    );
    token = cookies.admin_session;
  }

  // 2. Check Authorization Header fallback
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (verifySessionToken(token)) {
    return next();
  }

  const targetUrl = req.originalUrl || req.path;
  if (targetUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
  }

  return res.redirect('/login.html');
}

export function authenticateAdmin(password) {
  if (typeof password !== 'string' || password.length === 0) return false;
  if (!config.adminPasswordHash && !config.adminPassword) return false;
  const targetHash = getTargetAdminHash();
  return verifyPassword(password, targetHash);
}
