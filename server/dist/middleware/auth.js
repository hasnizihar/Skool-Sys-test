"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_SECRET = void 0;
exports.getUserAssignments = getUserAssignments;
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = require("../db/database.js");
exports.JWT_SECRET = process.env.JWT_SECRET || 'skoolsys-super-secret-key-2026';
function getUserAssignments(userId) {
    const classAssignments = database_js_1.db.prepare(`
    SELECT ta.class_id, c.name as class_name, c.grade, ta.assignment_type, ta.subject_id, s.name as subject_name, s.code as subject_code
    FROM teacher_assignments ta
    JOIN classes c ON ta.class_id = c.id
    LEFT JOIN subjects s ON ta.subject_id = s.id
    WHERE ta.teacher_id = ?
  `).all(userId);
    // Also check if user is direct class_teacher_id in classes table
    const directClasses = database_js_1.db.prepare(`
    SELECT id as class_id, name as class_name, grade
    FROM classes
    WHERE class_teacher_id = ?
  `).all(userId);
    const assignedClassIds = new Set();
    directClasses.forEach(c => assignedClassIds.add(c.class_id));
    classAssignments.forEach(a => assignedClassIds.add(a.class_id));
    return {
        assignments: classAssignments,
        assignedClassIds: Array.from(assignedClassIds),
        isClassTeacherFor: directClasses.map(c => c.class_id)
    };
}
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required. Token missing.' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, exports.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid or expired session token.' });
    }
}
function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized.' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                error: `Access denied. Requires one of: ${allowedRoles.join(', ')}.`
            });
            return;
        }
        next();
    };
}
