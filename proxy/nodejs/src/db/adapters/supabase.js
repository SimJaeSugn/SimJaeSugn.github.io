'use strict';
// Supabase 어댑터 — PostgreSQL 프로토콜 위의 Supabase 전용 연결 처리.
// SQL 방언·스키마 조회는 postgres 와 동일(connector.sqlDialect 가 supabase → postgres 로 정규화).
// 다른 것은 연결 조건뿐이라 postgres 어댑터에 다음을 주입해 위임한다.
//   1. TLS 필수 (Supabase 는 평문 연결 불가)
//   2. 기본값 보정 — port 5432, database/username 미입력 시 'postgres'
const postgres = require('./postgres');

const DEFAULTS = { port: 5432, database: 'postgres', username: 'postgres' };

function sbConfig(config) {
  return {
    ...config,
    port: config.port || DEFAULTS.port,
    database: config.database || DEFAULTS.database,
    username: config.username || DEFAULTS.username,
    // pg 드라이버 옵션 — Supabase 인증서는 자체 CA 라 검증은 끄고 암호화만 강제
    ssl: config.ssl || { rejectUnauthorized: false }
  };
}

function hint(err, config) {
  const msg = String((err && err.message) || err);
  const low = msg.toLowerCase();
  const host = String(config.host || '');
  const user = String(config.username || '');
  const netFail = ['enetunreach', 'ehostunreach', 'etimedout', 'enotfound', 'econnrefused', 'timeout']
    .some(k => low.includes(k));
  const hints = [];
  if (netFail && host.startsWith('db.') && host.endsWith('.supabase.co')) {
    hints.push('직접 연결(db.<ref>.supabase.co)은 IPv6 전용입니다. IPv4 환경이면 Connection Pooler 호스트'
      + '(aws-…-<region>.pooler.supabase.com, 세션 5432 / 트랜잭션 6543)를 사용하세요.');
  }
  if (low.includes('password authentication failed')) {
    hints.push(host.includes('.pooler.supabase.com') && !user.includes('.')
      ? "풀러 접속의 사용자명은 'postgres.<project-ref>' 형식이어야 합니다."
      : '비밀번호는 프로젝트 생성 시 지정한 데이터베이스 비밀번호입니다.');
  }
  return hints.length ? `${msg} — ${hints.join(' ')}` : msg;
}

async function execute(config, sql) {
  const cfg = sbConfig(config);
  try {
    return await postgres.execute(cfg, sql);
  } catch (e) {
    const m = hint(e, cfg);
    throw m === String(e.message) ? e : new Error(m);
  }
}

async function executeParams(config, sql, params) {
  const cfg = sbConfig(config);
  try {
    return await postgres.executeParams(cfg, sql, params);
  } catch (e) {
    const m = hint(e, cfg);
    throw m === String(e.message) ? e : new Error(m);
  }
}

async function test(config) {
  const result = await execute(config, 'SELECT 1 AS ok');
  return result.rows.length > 0;
}

async function closePool(key = null) {
  // 풀은 postgres 어댑터가 소유(같은 pg Pool 맵) — 위임만 한다.
  await postgres.closePool(key);
}

module.exports = { execute, executeParams, test, closePool };
