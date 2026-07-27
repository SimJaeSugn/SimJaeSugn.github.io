'use strict';
const express = require('express');
const router = express.Router();
const { getAdapter, sqlDialect } = require('../db/connector');
const { loadConfig } = require('./config');

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function _nowExpr(dbType) {
  dbType = sqlDialect(dbType);   // supabase → postgres
  if (dbType === 'mssql') return 'GETUTCDATE()';
  if (dbType === 'oracle') return 'SYSTIMESTAMP';
  return 'NOW()';
}

function _ph(dbType, n) {
  dbType = sqlDialect(dbType);   // supabase → postgres
  if (dbType === 'postgres') return `$${n}`;
  if (dbType === 'mysql') return '?';
  if (dbType === 'mssql') return `@p${n}`;
  if (dbType === 'oracle') return `:${n}`;
  return '?';
}

function _initDdl(dbType) {
  dbType = sqlDialect(dbType);   // supabase → postgres
  if (dbType === 'postgres') {
    return `CREATE TABLE IF NOT EXISTS UXER_ERD_DIAGRAM (
  diagram_id  VARCHAR(64)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  payload     TEXT         NOT NULL,
  version     INTEGER      NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by  VARCHAR(128),
  CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
)`;
  }
  if (dbType === 'mysql') {
    return `CREATE TABLE IF NOT EXISTS UXER_ERD_DIAGRAM (
  diagram_id  VARCHAR(64)   NOT NULL,
  name        VARCHAR(255)  NOT NULL,
  payload     LONGTEXT       NOT NULL,
  version     INT            NOT NULL DEFAULT 1,
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by  VARCHAR(128),
  PRIMARY KEY (diagram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
  }
  if (dbType === 'mssql') {
    return `IF OBJECT_ID(N'UXER_ERD_DIAGRAM', N'U') IS NULL
  CREATE TABLE UXER_ERD_DIAGRAM (
    diagram_id  VARCHAR(64)    NOT NULL,
    name        NVARCHAR(255)  NOT NULL,
    payload     NVARCHAR(MAX)   NOT NULL,
    version     INT             NOT NULL DEFAULT 1,
    updated_at  DATETIME2(3)    NOT NULL DEFAULT GETUTCDATE(),
    updated_by  NVARCHAR(128),
    CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
  )`;
  }
  if (dbType === 'oracle') {
    return `DECLARE
  v_cnt NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_cnt
    FROM user_tables WHERE table_name = 'UXER_ERD_DIAGRAM';
  IF v_cnt = 0 THEN
    EXECUTE IMMEDIATE 'CREATE TABLE UXER_ERD_DIAGRAM (
      diagram_id  VARCHAR2(64)   NOT NULL,
      name        VARCHAR2(255)  NOT NULL,
      payload     CLOB           NOT NULL,
      version     NUMBER(10,0)   DEFAULT 1 NOT NULL,
      updated_at  TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
      updated_by  VARCHAR2(128),
      CONSTRAINT pk_uxer_erd_diagram PRIMARY KEY (diagram_id)
    )';
  END IF;
END;`;
  }
  throw new Error(`지원하지 않는 DB 타입: ${dbType}`);
}

async function _getCtx(profileName) {
  const config = loadConfig(profileName || null);
  if (!config) {
    const msg = profileName
      ? `프로파일 '${profileName}'을 찾을 수 없습니다.`
      : '접속정보가 설정되지 않았습니다.';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  const adapter = getAdapter(config.dbType);
  return { config, adapter };
}

function _normRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    // 숫자(version 등)는 타입 보존, 그 외(날짜 등)는 직렬화 위해 문자열화
    out[k.toLowerCase()] = (typeof v === 'number') ? v : (v != null ? String(v) : null);
  }
  return out;
}

// ── POST /erd-store/init ──────────────────────────────────────────────────────

router.post('/init', async (req, res) => {
  let ctx;
  try {
    const pn = (req.query.profileName) || (req.body && req.body.profileName) || null;
    ctx = await _getCtx(pn);
  } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { config, adapter } = ctx;
  try {
    const ddl = _initDdl(config.dbType);
    await adapter.execute(config, ddl);
    res.json({ ok: true, message: 'UXER_ERD_DIAGRAM 테이블이 준비됐습니다.' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── GET /erd-store/list ───────────────────────────────────────────────────────

router.get('/list', async (req, res) => {
  let ctx;
  try { ctx = await _getCtx(req.query.profileName || null); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { config, adapter } = ctx;
  const sql = 'SELECT diagram_id, name, version, updated_at, updated_by FROM UXER_ERD_DIAGRAM ORDER BY updated_at DESC';
  try {
    const result = await adapter.execute(config, sql);
    const items = (result.rows || []).map(_normRow);
    res.json({ ok: true, items });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── GET /erd-store/:diagramId ─────────────────────────────────────────────────

router.get('/:diagramId', async (req, res) => {
  let ctx;
  try { ctx = await _getCtx(req.query.profileName || null); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { config, adapter } = ctx;
  const { diagramId } = req.params;
  const p1 = _ph(config.dbType, 1);
  const sql = `SELECT * FROM UXER_ERD_DIAGRAM WHERE diagram_id = ${p1}`;
  try {
    const result = await adapter.executeParams(config, sql, [diagramId]);
    const rows = result.rows || [];
    if (!rows.length) {
      return res.status(404).json({ error: `다이어그램 '${diagramId}'를 찾을 수 없습니다.` });
    }
    res.json({ ok: true, ..._normRow(rows[0]) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── PUT /erd-store/:diagramId ─────────────────────────────────────────────────

router.put('/:diagramId', async (req, res) => {
  const body = req.body || {};
  const { name, payload, updatedBy = null, profileName = null } = body;
  const expectedVersion = body.expectedVersion !== undefined ? Number(body.expectedVersion) : 0;
  let ctx;
  try { ctx = await _getCtx(profileName); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { config, adapter } = ctx;
  const { diagramId } = req.params;
  const dbType = config.dbType;
  const now = _nowExpr(dbType);
  const p = (n) => _ph(dbType, n);

  if (expectedVersion === 0) {
    // INSERT
    const sql = `INSERT INTO UXER_ERD_DIAGRAM (diagram_id, name, payload, version, updated_at, updated_by) VALUES (${p(1)}, ${p(2)}, ${p(3)}, 1, ${now}, ${p(4)})`;
    try {
      await adapter.executeParams(config, sql, [diagramId, name, payload, updatedBy]);
      res.json({ ok: true, version: 1 });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  } else {
    // UPDATE + 낙관적 잠금
    const sql = `UPDATE UXER_ERD_DIAGRAM SET name=${p(1)}, payload=${p(2)}, version=version+1, updated_at=${now}, updated_by=${p(3)} WHERE diagram_id=${p(4)} AND version=${p(5)}`;
    try {
      const result = await adapter.executeParams(config, sql, [name, payload, updatedBy, diagramId, expectedVersion]);
      const rc = result.rowCount || 0;
      if (rc === 0) {
        return res.status(409).json({
          ok: false,
          reason: 'conflict',
          message: '다른 사용자가 수정했습니다. 최신 버전을 다시 로드하세요.'
        });
      }
      res.json({ ok: true, version: expectedVersion + 1 });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
});

// ── DELETE /erd-store/:diagramId ──────────────────────────────────────────────

router.delete('/:diagramId', async (req, res) => {
  let ctx;
  try { ctx = await _getCtx(req.query.profileName || null); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const { config, adapter } = ctx;
  const { diagramId } = req.params;
  const p1 = _ph(config.dbType, 1);
  const sql = `DELETE FROM UXER_ERD_DIAGRAM WHERE diagram_id = ${p1}`;
  try {
    const result = await adapter.executeParams(config, sql, [diagramId]);
    const rc = result.rowCount || 0;
    if (rc === 0) {
      return res.status(404).json({ error: `다이어그램 '${diagramId}'를 찾을 수 없습니다.` });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
