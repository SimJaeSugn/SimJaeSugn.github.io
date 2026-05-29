const fs = require('fs');
const path = require('path');
const os = require('os');

const AUDIT_DIR  = path.join(os.homedir(), '.uxermanager');
const AUDIT_FILE = path.join(AUDIT_DIR, 'audit.log');
const MAX_BYTES  = 10 * 1024 * 1024;

function rotateIfNeeded() {
  if (!fs.existsSync(AUDIT_FILE)) return;
  if (fs.statSync(AUDIT_FILE).size >= MAX_BYTES) {
    const backup = AUDIT_FILE + '.1';
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(AUDIT_FILE, backup);
  }
}

function writeAuditLog(tag, sql, result) {
  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    rotateIfNeeded();
    const ts = new Date().toISOString();
    const shortSql = sql.length > 200 ? sql.slice(0, 200) + '...' : sql;
    const detail = result.error
      ? `ERROR: ${result.error}`
      : `${result.durationMs}ms, ${result.rowCount ?? 0} rows`;
    fs.appendFileSync(AUDIT_FILE, `${ts} [${tag}] ${shortSql} (${detail})\n`, 'utf8');
  } catch (_) {}
}

module.exports = { writeAuditLog };
