import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.js';
import { requireAuth, getUserAssignments, JWT_SECRET } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    return;
  }

  const user = db.prepare(`
    SELECT id, username, email, password_hash, full_name, role, is_active
    FROM users
    WHERE username = ? OR email = ?
  `).get(username, username) as any;

  if (!user || !user.is_active) {
    res.status(401).json({ error: 'Invalid credentials or account disabled.' });
    return;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid credentials.' });
    return;
  }

  const assignments = getUserAssignments(user.id);
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  logAudit(user.id, user.username, 'USER_LOGIN', 'users', user.id, { message: 'Successful login' }, req.ip);

  res.json({
    token,
    user: {
      ...payload,
      ...assignments
    }
  });
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
