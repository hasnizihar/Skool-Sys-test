"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = require("../db/database.js");
const auth_js_1 = require("../middleware/auth.js");
const audit_js_1 = require("../utils/audit.js");
const router = (0, express_1.Router)();
// Login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
    }
    const user = database_js_1.db.prepare(`
    SELECT id, username, email, password_hash, full_name, role, is_active
    FROM users
    WHERE username = ? OR email = ?
  `).get(username, username);
    if (!user || !user.is_active) {
        res.status(401).json({ error: 'Invalid credentials or account disabled.' });
        return;
    }
    const isValid = bcryptjs_1.default.compareSync(password, user.password_hash);
    if (!isValid) {
        res.status(401).json({ error: 'Invalid credentials.' });
        return;
    }
    const assignments = (0, auth_js_1.getUserAssignments)(user.id);
    const payload = {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role
    };
    const token = jsonwebtoken_1.default.sign(payload, auth_js_1.JWT_SECRET, { expiresIn: '7d' });
    (0, audit_js_1.logAudit)(user.id, user.username, 'USER_LOGIN', 'users', user.id, { message: 'Successful login' }, req.ip);
    res.json({
        token,
        user: {
            ...payload,
            ...assignments
        }
    });
});
// Current User Profile
router.get('/me', auth_js_1.requireAuth, (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const user = database_js_1.db.prepare(`
    SELECT id, username, email, full_name, role, is_active, created_at
    FROM users
    WHERE id = ?
  `).get(req.user.id);
    if (!user || !user.is_active) {
        res.status(401).json({ error: 'User not found or inactive.' });
        return;
    }
    const assignments = (0, auth_js_1.getUserAssignments)(user.id);
    res.json({
        user: {
            ...user,
            ...assignments
        }
    });
});
exports.default = router;
