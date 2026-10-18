import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

/**
 * Creates an atomic point-in-time backup of an active SQLite database in WAL mode.
 * Uses SQLite's native VACUUM INTO which safely captures committed state without
 * corrupting dirty pages or requiring unsafe raw file copies.
 */
export function createSafeDatabaseBackup(db: DatabaseSync, targetBackupPath: string): void {
  // If backup destination already exists, remove it first (VACUUM INTO requires target not to exist)
  if (fs.existsSync(targetBackupPath)) {
    fs.unlinkSync(targetBackupPath);
  }

  // 1. Passive checkpoint to ensure recent commits are flushed if possible
  try {
    db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch {
    // Ignore checkpoint errors if in special transaction mode
  }

  // 2. Atomic snapshot into target backup path
  const sanitizedPath = targetBackupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${sanitizedPath}';`);

  // 3. Verify backup database integrity
  const backupDb = new DatabaseSync(targetBackupPath);
  try {
    const integrityResult = backupDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrityResult?.integrity_check !== 'ok') {
      throw new Error(`Backup integrity check failed: ${JSON.stringify(integrityResult)}`);
    }

    const fkResult = backupDb.prepare('PRAGMA foreign_key_check;').all();
    if (fkResult.length > 0) {
      throw new Error(`Backup foreign key violations detected: ${JSON.stringify(fkResult)}`);
    }
  } finally {
    backupDb.close();
  }
}
