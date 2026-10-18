import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Validates target backup path and ensures destination directory exists.
 * Strictly guarantees that existing valid backups are never overwritten or deleted.
 */
export function validateBackupPath(targetBackupPath: string): void {
  if (!targetBackupPath || typeof targetBackupPath !== 'string' || targetBackupPath.trim() === '') {
    throw new Error('Invalid backup path: Path must be a non-empty string.');
  }

  const resolved = path.resolve(targetBackupPath);
  const dir = path.dirname(resolved);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(resolved)) {
    throw new Error(`Target backup path already exists: "${resolved}". Overwriting existing backup files is strictly prohibited.`);
  }
}

/**
 * Generates a unique, collision-free timestamped backup filepath.
 * Format: {baseName}_backup_{isoTimestamp}_{randomHex}.db
 */
export function generateTimestampedBackupPath(dbPath: string, backupDir?: string): string {
  const dir = backupDir || path.join(path.dirname(path.resolve(dbPath)), 'backups');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const baseName = path.basename(dbPath, path.extname(dbPath)) || 'skoolsys';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nonce = crypto.randomBytes(4).toString('hex');
  return path.join(dir, `${baseName}_backup_${timestamp}_${nonce}.db`);
}

/**
 * Creates an atomic, verified point-in-time backup of an active SQLite database in WAL mode.
 * Uses SQLite's native VACUUM INTO which safely captures committed state without
 * corrupting dirty pages or requiring unsafe raw file copies.
 * 
 * Never deletes or overwrites existing backup files.
 */
export function createSafeDatabaseBackup(
  db: DatabaseSync,
  targetBackupPath: string
): { backupPath: string; verified: boolean; bytes: number } {
  // Validate path and ensure target doesn't already exist
  validateBackupPath(targetBackupPath);

  // 1. Passive checkpoint to ensure recent commits are flushed if possible
  try {
    db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch {
    // Ignore checkpoint errors if in special transaction mode
  }

  // 2. Atomic snapshot into target backup path via SQLite VACUUM INTO
  const sanitizedPath = targetBackupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${sanitizedPath}';`);

  // 3. Verify backup database integrity
  if (!fs.existsSync(targetBackupPath)) {
    throw new Error(`Backup snapshot failed: Target file was not created at ${targetBackupPath}`);
  }

  const stat = fs.statSync(targetBackupPath);
  if (stat.size === 0) {
    try { fs.unlinkSync(targetBackupPath); } catch {}
    throw new Error(`Backup snapshot failed: Target file size is 0 bytes at ${targetBackupPath}`);
  }

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

  return {
    backupPath: targetBackupPath,
    verified: true,
    bytes: stat.size
  };
}

/**
 * Restores a SQLite database from a verified point-in-time backup snapshot.
 * Verifies backup integrity before copying, and verifies restored destination.
 */
export function restoreFromBackup(backupPath: string, targetRestorePath: string): { restored: boolean; bytes: number } {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Restore source backup file does not exist: "${backupPath}"`);
  }

  // Verify source backup integrity prior to restore
  const srcDb = new DatabaseSync(backupPath);
  try {
    const integrity = srcDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`Cannot restore from corrupted backup "${backupPath}": PRAGMA integrity_check failed.`);
    }
  } finally {
    srcDb.close();
  }

  // Ensure restore directory exists
  const targetDir = path.dirname(path.resolve(targetRestorePath));
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Perform restore copy
  fs.copyFileSync(backupPath, targetRestorePath);

  // Clean up any stale WAL or SHM files for target database
  const targetWal = `${targetRestorePath}-wal`;
  const targetShm = `${targetRestorePath}-shm`;
  if (fs.existsSync(targetWal)) {
    try { fs.unlinkSync(targetWal); } catch {}
  }
  if (fs.existsSync(targetShm)) {
    try { fs.unlinkSync(targetShm); } catch {}
  }

  // Verify restored database integrity
  const restoredDb = new DatabaseSync(targetRestorePath);
  try {
    const integrity = restoredDb.prepare('PRAGMA integrity_check;').get() as { integrity_check?: string };
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`Restored database integrity check failed at "${targetRestorePath}".`);
    }
  } finally {
    restoredDb.close();
  }

  const stat = fs.statSync(targetRestorePath);
  return {
    restored: true,
    bytes: stat.size
  };
}

