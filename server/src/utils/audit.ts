import { db } from '../db/database.js';

export function logAudit(
  userId: number | null,
  username: string | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: any,
  ipAddress: string = '127.0.0.1'
) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      userId,
      username || 'anonymous',
      action,
      entityType,
      entityId ? String(entityId) : null,
      typeof details === 'string' ? details : JSON.stringify(details),
      ipAddress
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
