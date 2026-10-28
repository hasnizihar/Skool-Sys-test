import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, getJwtSecret } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// In-memory brute-force rate limiter for authentication attempts
interface LoginAttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}
const loginAttempts = new Map<string, LoginAttemptRecord>();
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

export function getRateLimitKey(ip: string, username: string): string {
  return `${ip || 'unknown'}:${username.toLowerCase().trim()}`;
}

export function checkLoginRateLimit(key: string): { blocked: boolean; remainingMinutes?: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record) return { blocked: false };

  if (record.blockedUntil && now < record.blockedUntil) {
    const remainingMinutes = Math.ceil((record.blockedUntil - now) / 60000);
    return { blocked: true, remainingMinutes };
  }

  if (now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false };
  }

  return { blocked: false };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
    if (record.count >= MAX_FAILED_ATTEMPTS) {
      record.blockedUntil = now + LOCKOUT_DURATION_MS;
    }
  }
}

export function resetLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const rateKey = getRateLimitKey(req.ip || 'unknown', String(username));
  const rateStatus = checkLoginRateLimit(rateKey);
  if (rateStatus.blocked) {
    res.status(429).json({
      error: `Too many failed login attempts. Account temporarily locked. Please try again in ${rateStatus.remainingMinutes} minutes.`
    });
    return;
  }

  const user = db.prepare(`
    SELECT id, username, email, password_hash, full_name, role, is_active, token_version
    FROM users
    WHERE username = ? OR email = ?
  `).get(username, username) as any;

  // Generic security error prevents user enumeration
  const GENERIC_LOGIN_ERROR = 'Invalid username or password';
  if (!user || !user.is_active) {
    recordFailedLogin(rateKey);
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    recordFailedLogin(rateKey);
    res.status(401).json({ error: GENERIC_LOGIN_ERROR });
    return;
  }

  // Clear rate-limit attempts on successful verification
  resetLoginAttempts(rateKey);

  const assignments = getUserAssignments(user.id);
  const tokenVersion = user.token_version || 1;
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    token_version: tokenVersion
  };

  // 24 hour session expiration
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });

  logAudit(user.id, user.username, 'USER_LOGIN', 'users', user.id, { message: 'Successful login' }, req.ip);

  res.json({
    token,
    user: {
      ...payload,
      ...assignments
    }
  });
});

// Logout & Revoke Session
router.post('/logout', requireAuth, (req, res) => {
  const userId = req.user!.id;

  // Invalidate all tokens for this user by incrementing token_version
  db.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?').run(userId);

  logAudit(userId, req.user!.username, 'USER_LOGOUT', 'users', userId, { message: 'Session revoked' }, req.ip);

  res.json({ success: true, message: 'Logged out successfully. Session revoked.' });
});

// Current User Profile
router.get('/me', requireAuth, (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = db.prepare(`
    SELECT id, username, email, full_name, role, is_active, created_at
    FROM users
    WHERE id = ?
  `).get(req.user.id) as any;

  if (!user || !user.is_active) {
    res.status(401).json({ error: 'User not found or inactive.' });
    return;
  }

  const assignments = getUserAssignments(user.id);

  res.json({
    user: {
      ...user,
      ...assignments
    }
  });
});

export default router;
