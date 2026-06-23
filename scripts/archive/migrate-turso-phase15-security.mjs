/**
 * Turso migration — Phase 15: Enterprise Security + Backup
 * Adds Phase 15 columns and new tables.
 *
 * Usage:
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... node scripts/migrate-turso-phase15-security.mjs
 */
import { createClient } from '@libsql/client'

const url   = process.env.TURSO_DATABASE_URL
const token = process.env.TURSO_AUTH_TOKEN

if (!url || !token) {
  console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set')
  process.exit(1)
}

const client = createClient({ url, authToken: token })

async function exec(sql, label) {
  await client.execute(sql).catch(err => {
    const msg = String(err)
    if (msg.includes('already exists') || msg.includes('duplicate column name')) {
      console.log(`[migrate-turso-phase15] ${label} — already exists, skip`)
    } else {
      throw err
    }
  })
}

async function run() {
  console.log('[migrate-turso-phase15] connecting to', url)

  // -- User table additions --
  await exec(`ALTER TABLE users ADD COLUMN locked_until DATETIME`, 'users.locked_until')
  await exec(`ALTER TABLE users ADD COLUMN password_changed_at DATETIME`, 'users.password_changed_at')

  // -- LoginAttempt table --
  await exec(`
    CREATE TABLE login_attempts (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      ip         TEXT,
      user_agent TEXT,
      success    INTEGER NOT NULL DEFAULT 0,
      user_id    TEXT,
      reason     TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `, 'login_attempts table')

  await exec(`CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at)`, 'idx_login_attempts_email')
  await exec(`CREATE INDEX idx_login_attempts_user  ON login_attempts(user_id)`, 'idx_login_attempts_user')

  // -- SecurityEvent table --
  await exec(`
    CREATE TABLE security_events (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      event_type  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'INFO',
      description TEXT NOT NULL,
      ip          TEXT,
      user_agent  TEXT,
      metadata    TEXT,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `, 'security_events table')

  await exec(`CREATE INDEX idx_security_events_user ON security_events(user_id, created_at)`, 'idx_security_events_user')
  await exec(`CREATE INDEX idx_security_events_sev  ON security_events(severity)`, 'idx_security_events_sev')

  // -- DeviceSession table --
  await exec(`
    CREATE TABLE device_sessions (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      session_id   TEXT NOT NULL UNIQUE,
      ip           TEXT,
      user_agent   TEXT,
      browser      TEXT,
      os           TEXT,
      device_type  TEXT,
      country      TEXT,
      is_revoked   INTEGER NOT NULL DEFAULT 0,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, 'device_sessions table')

  await exec(`CREATE INDEX idx_device_sessions_user ON device_sessions(user_id)`, 'idx_device_sessions_user')

  // -- OtpCode table --
  await exec(`
    CREATE TABLE otp_codes (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      challenge  TEXT NOT NULL UNIQUE,
      code       TEXT NOT NULL,
      channel    TEXT NOT NULL DEFAULT 'LINE',
      used       INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, 'otp_codes table')

  await exec(`CREATE INDEX idx_otp_codes_user ON otp_codes(user_id)`, 'idx_otp_codes_user')

  // -- TwoFactorSetup table --
  await exec(`
    CREATE TABLE two_factor_setups (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL UNIQUE,
      enabled     INTEGER NOT NULL DEFAULT 0,
      channel     TEXT NOT NULL DEFAULT 'LINE',
      totp_secret TEXT,
      enabled_at  DATETIME,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `, 'two_factor_setups table')

  // -- BackupRecord table --
  await exec(`
    CREATE TABLE backup_records (
      id           TEXT PRIMARY KEY,
      filename     TEXT NOT NULL,
      size_bytes   INTEGER NOT NULL DEFAULT 0,
      tables       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'COMPLETED',
      created_by_id TEXT,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note         TEXT
    )
  `, 'backup_records table')

  await exec(`CREATE INDEX idx_backup_records_created ON backup_records(created_at)`, 'idx_backup_records_created')

  // AuditAction enum values are stored as TEXT in SQLite — no ALTER needed.
  // NotificationType enum values are stored as TEXT in SQLite — no ALTER needed.

  console.log('[migrate-turso-phase15] ✅ done')
}

run().catch(err => { console.error(err); process.exit(1) })
