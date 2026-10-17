"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const database_js_1 = require("../db/database.js");
function logAudit(userId, username, action, entityType, entityId, details, ipAddress = '127.0.0.1') {
    try {
        const stmt = database_js_1.db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(userId, username || 'anonymous', action, entityType, entityId ? String(entityId) : null, typeof details === 'string' ? details : JSON.stringify(details), ipAddress);
    }
    catch (err) {
        console.error('Failed to write audit log:', err);
    }
}
