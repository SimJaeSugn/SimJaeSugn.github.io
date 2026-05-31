// ── 기본 데이터 (새 다이어그램 초기값) ──────────────────────────
const DEFAULT_ENTITIES = [
  {
    id: 'vendor', logicalName: '밴더', physicalName: 'TB_VNDR', description: '밴더 정보', x: 60, y: 80,
    attrs: [
      { logicalName: '밴더ID',    physicalName: 'VNDR_ID',   type: 'VARCHAR(20)', kind: 'pk',     description: '밴더 고유 식별자', ref: null },
      { logicalName: '밴더명',    physicalName: 'VNDR_NM',   type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '설명',      physicalName: 'EXPLN',     type: 'TEXT',        kind: 'normal', description: '', ref: null },
      { logicalName: '사용여부',  physicalName: 'USE_YN',    type: 'CHAR(1)',     kind: 'normal', description: 'Y/N', ref: null },
      { logicalName: '등록일시',  physicalName: 'REG_DT',    type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',  physicalName: 'MDF_DT',    type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'model', logicalName: '모델', physicalName: 'TB_MDL', description: 'AI 모델 정보', x: 60, y: 380,
    attrs: [
      { logicalName: '모델순번',    physicalName: 'MDL_SN',      type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '밴더ID',      physicalName: 'VNDR_ID',     type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'vendor', attr: 'VNDR_ID' } },
      { logicalName: '모델명',      physicalName: 'MDL_NM',      type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '모델코드',    physicalName: 'MDL_CD',      type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '모델유형코드',physicalName: 'MDL_TYPE_CD', type: 'CHAR(4)',     kind: 'normal', description: '', ref: null },
      { logicalName: '설명',        physicalName: 'EXPLN',       type: 'TEXT',        kind: 'normal', description: '', ref: null },
      { logicalName: '사용여부',    physicalName: 'USE_YN',      type: 'CHAR(1)',     kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',    physicalName: 'REG_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',    physicalName: 'MDF_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'apikey', logicalName: 'API키정보', physicalName: 'TB_API_KEY', description: 'API 키 관리', x: 430, y: 260,
    attrs: [
      { logicalName: 'API키순번',  physicalName: 'APIKEY_SN',   type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '밴더ID',     physicalName: 'VNDR_ID',     type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'vendor', attr: 'VNDR_ID' } },
      { logicalName: '사용자ID',   physicalName: 'USER_ID',     type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'user',   attr: 'USER_ID' } },
      { logicalName: '키명',       physicalName: 'KEY_NM',      type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: 'API키값',    physicalName: 'API_KEY_VAL', type: 'VARCHAR',     kind: 'normal', description: '암호화 저장', ref: null },
      { logicalName: '사용여부',   physicalName: 'USE_YN',      type: 'CHAR(1)',     kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',   physicalName: 'REG_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',   physicalName: 'MDF_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'user', logicalName: '사용자', physicalName: 'TB_USER', description: '시스템 사용자 계정', x: 800, y: 80,
    attrs: [
      { logicalName: '사용자ID',   physicalName: 'USER_ID',  type: 'VARCHAR(20)', kind: 'pk',     description: '', ref: null },
      { logicalName: '사용자명',   physicalName: 'USER_NM',  type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '이메일주소', physicalName: 'EML_ADDR', type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '비밀번호',   physicalName: 'PSWD',     type: 'VARCHAR',     kind: 'normal', description: '해시 저장', ref: null },
      { logicalName: '역할코드',   physicalName: 'ROLE_CD',  type: 'CHAR(4)',     kind: 'normal', description: '', ref: null },
      { logicalName: '사용여부',   physicalName: 'USE_YN',   type: 'CHAR(1)',     kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',   physicalName: 'REG_DT',   type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',   physicalName: 'MDF_DT',   type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'activemodel', logicalName: '사용자별활성모델', physicalName: 'TB_ACTV_MDL', description: '사용자가 선택한 활성 모델', x: 430, y: 600,
    attrs: [
      { logicalName: '활성모델순번', physicalName: 'ACTV_MDL_SN', type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '사용자ID',    physicalName: 'USER_ID',     type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'user',  attr: 'USER_ID' } },
      { logicalName: '모델순번',    physicalName: 'MDL_SN',      type: 'BIGINT',      kind: 'fk',     description: '', ref: { entity: 'model', attr: 'MDL_SN'  } },
      { logicalName: '등록일시',    physicalName: 'REG_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',    physicalName: 'MDF_DT',      type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'hyperparam', logicalName: '하이퍼파라미터', physicalName: 'TB_HYPR_PRMTR', description: 'LLM 파라미터 설정', x: 800, y: 380,
    attrs: [
      { logicalName: '파라미터순번', physicalName: 'PRMTR_SN',  type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '사용자ID',    physicalName: 'USER_ID',    type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'user', attr: 'USER_ID' } },
      { logicalName: '온도',        physicalName: 'TEMP',       type: 'FLOAT',       kind: 'normal', description: '0~2', ref: null },
      { logicalName: 'Top-P',       physicalName: 'TOP_P',      type: 'FLOAT',       kind: 'normal', description: '', ref: null },
      { logicalName: '최대토큰',    physicalName: 'MAX_TKN',    type: 'INTEGER',     kind: 'normal', description: '', ref: null },
      { logicalName: '빈도패널티',  physicalName: 'FREQ_PENL',  type: 'FLOAT',       kind: 'normal', description: '', ref: null },
      { logicalName: '존재패널티',  physicalName: 'EXST_PENL',  type: 'FLOAT',       kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',    physicalName: 'REG_DT',     type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',    physicalName: 'MDF_DT',     type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'agentconfig', logicalName: '에이전트설정', physicalName: 'TB_AIAGT_CFG', description: 'RAG 에이전트 검색 설정', x: 1130, y: 380,
    attrs: [
      { logicalName: '에이전트설정순번', physicalName: 'AIAGT_CFG_SN', type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '사용자ID',        physicalName: 'USER_ID',       type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'user', attr: 'USER_ID' } },
      { logicalName: 'Top-K',           physicalName: 'TOP_K',         type: 'INTEGER',     kind: 'normal', description: '검색 후보 수', ref: null },
      { logicalName: 'Top-N',           physicalName: 'TOP_N',         type: 'INTEGER',     kind: 'normal', description: '리랭킹 결과 수', ref: null },
      { logicalName: '청크크기',        physicalName: 'CHUNK_SZ',      type: 'INTEGER',     kind: 'normal', description: '', ref: null },
      { logicalName: '리랭킹여부',      physicalName: 'RERNK_YN',      type: 'CHAR(1)',     kind: 'normal', description: '', ref: null },
      { logicalName: '벡터모드코드',    physicalName: 'VCTR_MODE_CD',  type: 'CHAR(4)',     kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',        physicalName: 'REG_DT',        type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',        physicalName: 'MDF_DT',        type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
  {
    id: 'prompt', logicalName: '프롬프트', physicalName: 'TB_PRMPT', description: '사용자 정의 프롬프트', x: 1130, y: 80,
    attrs: [
      { logicalName: '프롬프트순번', physicalName: 'PRMPT_SN',      type: 'BIGINT',      kind: 'pk',     description: '', ref: null },
      { logicalName: '사용자ID',    physicalName: 'USER_ID',        type: 'VARCHAR(20)', kind: 'fk',     description: '', ref: { entity: 'user', attr: 'USER_ID' } },
      { logicalName: '프롬프트명',  physicalName: 'PRMPT_NM',      type: 'VARCHAR',     kind: 'normal', description: '', ref: null },
      { logicalName: '프롬프트내용',physicalName: 'PRMPT_CN',      type: 'TEXT',        kind: 'normal', description: '', ref: null },
      { logicalName: '프롬프트유형',physicalName: 'PRMPT_TYPE_CD', type: 'CHAR(4)',     kind: 'normal', description: '', ref: null },
      { logicalName: '사용여부',    physicalName: 'USE_YN',         type: 'CHAR(1)',     kind: 'normal', description: '', ref: null },
      { logicalName: '등록일시',    physicalName: 'REG_DT',         type: 'DATETIME',    kind: 'normal', description: '', ref: null },
      { logicalName: '수정일시',    physicalName: 'MDF_DT',         type: 'DATETIME',    kind: 'normal', description: '', ref: null },
    ]
  },
];

const DEFAULT_RELATIONS = [
  { from: 'vendor',      to: 'model',       card: '1:N' },
  { from: 'vendor',      to: 'apikey',      card: '1:N' },
  { from: 'model',       to: 'activemodel', card: '1:1' },
  { from: 'user',        to: 'activemodel', card: '1:1' },
  { from: 'user',        to: 'hyperparam',  card: '1:1' },
  { from: 'user',        to: 'agentconfig', card: '1:1' },
  { from: 'user',        to: 'apikey',      card: '1:N' },
  { from: 'user',        to: 'prompt',      card: '1:N' },
];

// ── 스타일 상수 ──────────────────────────────────────────────
const W = 295;
const HEADER_H = 36;
const ROW_H = 22;
const RADIUS = 8;
let PANEL_W = 240;

// ── 색상 팔레트 ───────────────────────────────────────────────
const COLOR = {
  headerBg:    '#313244',
  headerText:  '#cdd6f4',
  bodyBg:      '#1e1e2e',
  border:      '#45475a',
  pkBg:        '#3d1f28',
  pkText:      '#f38ba8',
  fkBg:        '#2d2013',
  fkText:      '#fab387',
  normalText:  '#a6e3a1',
  typeText:    '#6c7086',
  line:        '#89b4fa',
  lineCard:    '#cba6f7',
  shadow:      'rgba(0,0,0,0.5)',
  hover:       '#45475a',
  // canvas-specific (not in CSS)
  selHdr:      '#2a2d4a',
  hovHdr:      '#3e3f55',
  lineHover:   '#b4d0fb',
  lineFill:    'rgba(137,180,250,0.35)',
  selGlow:     'rgba(137,180,250,0.55)',
  gridColor:   '#2a2a3d',
  snapGrid:    'rgba(49,50,68,0.5)',
  selFill:     'rgba(137,180,250,0.08)',
  ac_y:        '#f9e2af',
  sectionLabelBg: 'rgba(30,30,46,0.88)',
};

// ── 테마 정의 ─────────────────────────────────────────────────
const THEMES = {
  dark: {
    name: '다크',
    color: {
      headerBg:'#313244', headerText:'#cdd6f4', bodyBg:'#1e1e2e',
      border:'#45475a', pkBg:'#3d1f28', pkText:'#f38ba8',
      fkBg:'#2d2013', fkText:'#fab387', normalText:'#a6e3a1',
      typeText:'#6c7086', line:'#89b4fa', lineCard:'#cba6f7',
      shadow:'rgba(0,0,0,0.5)', hover:'#45475a',
      selHdr:'#2a2d4a', hovHdr:'#3e3f55', lineHover:'#b4d0fb',
      lineFill:'rgba(137,180,250,0.35)', selGlow:'rgba(137,180,250,0.55)', gridColor:'#2a2a3d',
      snapGrid:'rgba(49,50,68,0.5)', selFill:'rgba(137,180,250,0.08)',
      ac_y:'#f9e2af', sectionLabelBg:'rgba(30,30,46,0.88)',
    },
    preview: { bg:'#1e1e2e', header:'#313244', line:'#89b4fa', accent:'#f38ba8' },
  },
  light: {
    name: '라이트',
    color: {
      headerBg:'#ccd0da', headerText:'#4c4f69', bodyBg:'#eff1f5',
      border:'#bcc0cc', pkBg:'#fce8ec', pkText:'#d20f39',
      fkBg:'#fef0e4', fkText:'#fe640b', normalText:'#40a02b',
      typeText:'#7c7f93', line:'#1e66f5', lineCard:'#8839ef',
      shadow:'rgba(0,0,0,0.15)', hover:'#bcc0cc',
      selHdr:'#d4e2fb', hovHdr:'#dce6f8', lineHover:'#4f7ef7',
      lineFill:'rgba(30,102,245,0.35)', selGlow:'rgba(30,102,245,0.45)', gridColor:'#d4d8e8',
      snapGrid:'rgba(188,192,204,0.5)', selFill:'rgba(30,102,245,0.08)',
      ac_y:'#df8e1d', sectionLabelBg:'rgba(239,241,245,0.92)',
    },
    preview: { bg:'#eff1f5', header:'#ccd0da', line:'#1e66f5', accent:'#d20f39' },
  },
  frappe: {
    name: 'Frappé',
    color: {
      headerBg:'#414559', headerText:'#c6d0f5', bodyBg:'#303446',
      border:'#51576d', pkBg:'#3d2040', pkText:'#e78284',
      fkBg:'#302518', fkText:'#ef9f76', normalText:'#a6d189',
      typeText:'#737994', line:'#8caaee', lineCard:'#ca9ee6',
      shadow:'rgba(0,0,0,0.5)', hover:'#51576d',
      selHdr:'#2c3050', hovHdr:'#363a55', lineHover:'#a8c0f0',
      lineFill:'rgba(140,170,238,0.35)', selGlow:'rgba(140,170,238,0.55)', gridColor:'#272b3e',
      snapGrid:'rgba(65,69,89,0.5)', selFill:'rgba(140,170,238,0.08)',
      ac_y:'#e5c890', sectionLabelBg:'rgba(48,52,70,0.88)',
    },
    preview: { bg:'#303446', header:'#414559', line:'#8caaee', accent:'#e78284' },
  },
  macchiato: {
    name: 'Macchiato',
    color: {
      headerBg:'#363a4f', headerText:'#cad3f5', bodyBg:'#24273a',
      border:'#494d64', pkBg:'#3d1f30', pkText:'#ed8796',
      fkBg:'#2d2018', fkText:'#f5a97f', normalText:'#a6da95',
      typeText:'#6e738d', line:'#8aadf4', lineCard:'#c6a0f6',
      shadow:'rgba(0,0,0,0.5)', hover:'#494d64',
      selHdr:'#2a2d4a', hovHdr:'#333655', lineHover:'#a5c0f6',
      lineFill:'rgba(138,173,244,0.35)', selGlow:'rgba(138,173,244,0.55)', gridColor:'#1e2138',
      snapGrid:'rgba(54,58,79,0.5)', selFill:'rgba(138,173,244,0.08)',
      ac_y:'#eed49f', sectionLabelBg:'rgba(36,39,58,0.88)',
    },
    preview: { bg:'#24273a', header:'#363a4f', line:'#8aadf4', accent:'#ed8796' },
  },
};

let currentTheme = 'dark';
const THEME_STORAGE = 'erd_theme';

// ── 엔티티 색상 팔레트 ───────────────────────────────────────
const ENTITY_COLOR_PALETTE = [
  { id: null,     bg: '#45475a', dot: '#585b70', label: '기본' },
  { id: 'blue',   bg: '#1e4d8c', dot: '#89b4fa', label: '파랑' },
  { id: 'green',  bg: '#1a5c3a', dot: '#a6e3a1', label: '초록' },
  { id: 'orange', bg: '#8b4a10', dot: '#fab387', label: '주황' },
  { id: 'red',    bg: '#8b1a2e', dot: '#f38ba8', label: '빨강' },
  { id: 'purple', bg: '#5a1a8c', dot: '#cba6f7', label: '보라' },
  { id: 'yellow', bg: '#7a6010', dot: '#f9e2af', label: '노랑' },
  { id: 'teal',   bg: '#0e6878', dot: '#89dceb', label: '하늘' },
];

// ── 섹션 팔레트 ───────────────────────────────────────────────
const SECTION_LABEL_H = 28;
const SECTION_PALETTE = [
  { bg: 'rgba(137,180,250,0.07)', border: '#89b4fa' },
  { bg: 'rgba(166,227,161,0.07)', border: '#a6e3a1' },
  { bg: 'rgba(203,166,247,0.07)', border: '#cba6f7' },
  { bg: 'rgba(250,179,135,0.07)', border: '#fab387' },
  { bg: 'rgba(243,139,168,0.07)', border: '#f38ba8' },
  { bg: 'rgba(249,226,175,0.07)', border: '#f9e2af' },
];

// ── 스티커 메모 상수 ──────────────────────────────────────────
const NOTE_W = 180, NOTE_H = 110;
const NOTE_TAB_H = 24;           // 탭 바 높이 (월드 단위)
const NOTE_COLORS = ['#f9e2af', '#a6e3a1', '#89b4fa', '#f38ba8', '#cba6f7'];

// ── 스티커 메모 V2 상수 ────────────────────────────────────────
const NOTE_V2_W = 220, NOTE_V2_H = 160;
const NOTE_V2_MIN_W = 140, NOTE_V2_MIN_H = 100;
const NOTE_V2_THEMES = {
  cream:    { header: '#f5e6c4', text: '#5c4b32' },
  ocean:    { header: '#b8dff5', text: '#2c5f7c' },
  rose:     { header: '#f5b8ca', text: '#7c2c42' },
  mint:     { header: '#a8efc0', text: '#2c6b42' },
  lavender: { header: '#c8b0f0', text: '#4c2c7c' },
  sunset:   { header: '#f5c8a0', text: '#7c4b2c' },
  slate:    { header: '#c0c4d0', text: '#3c3f4c' },
  coral:    { header: '#f0a890', text: '#6b3225' },
};

// ── 그리드 ────────────────────────────────────────────────────
const GRID = 20;
const GAP = 15;

// ── Undo 스택 최대 크기 ────────────────────────────────────────
const UNDO_MAX = 50;

// ── 로컬스토리지 키 ────────────────────────────────────────────
const STORAGE_KEY = 'uxerd_v3';
const SNAPSHOT_KEY = 'erd_snapshots';
const SNAPSHOT_MAX = 20;
const TEMPLATE_KEY = 'uxerd_col_templates';
const AI_KEY_STORAGE = 'erd_ai_key';

// ── DB별 자료형 목록 ─────────────────────────────────────────
const DB_TYPES = {
  mysql: { label: 'MySQL / MariaDB', groups: [
    { label: '문자',     types: ['CHAR(1)','CHAR(4)','CHAR(8)','CHAR(10)','CHAR(20)','VARCHAR(10)','VARCHAR(20)','VARCHAR(50)','VARCHAR(100)','VARCHAR(200)','VARCHAR(255)','VARCHAR(500)','VARCHAR(1000)','TEXT','TINYTEXT','MEDIUMTEXT','LONGTEXT'] },
    { label: '정수',     types: ['TINYINT','SMALLINT','INT','INTEGER','BIGINT'] },
    { label: '소수',     types: ['FLOAT','DOUBLE','DECIMAL','DECIMAL(10,2)','DECIMAL(15,4)','DECIMAL(19,4)'] },
    { label: '날짜/시간',types: ['DATE','TIME','DATETIME','TIMESTAMP','YEAR'] },
    { label: '기타',     types: ['BOOLEAN','JSON','BLOB','TINYBLOB','MEDIUMBLOB','LONGBLOB','BINARY','VARBINARY','ENUM'] },
  ]},
  postgresql: { label: 'PostgreSQL', groups: [
    { label: '문자',     types: ['CHAR(1)','CHAR(4)','CHAR(10)','VARCHAR(20)','VARCHAR(50)','VARCHAR(100)','VARCHAR(255)','TEXT'] },
    { label: '정수',     types: ['SMALLINT','INTEGER','BIGINT','SERIAL','BIGSERIAL'] },
    { label: '소수',     types: ['REAL','DOUBLE PRECISION','NUMERIC','NUMERIC(10,2)','NUMERIC(15,4)','NUMERIC(19,4)'] },
    { label: '날짜/시간',types: ['DATE','TIME','TIMETZ','TIMESTAMP','TIMESTAMPTZ','INTERVAL'] },
    { label: '기타',     types: ['BOOLEAN','JSON','JSONB','UUID','BYTEA','ARRAY'] },
  ]},
  oracle: { label: 'Oracle', groups: [
    { label: '문자',     types: ['CHAR(1)','CHAR(4)','CHAR(10)','NCHAR(10)','VARCHAR2(20)','VARCHAR2(50)','VARCHAR2(100)','VARCHAR2(255)','VARCHAR2(500)','NVARCHAR2(100)','NVARCHAR2(255)','CLOB','NCLOB'] },
    { label: '숫자',     types: ['NUMBER','NUMBER(5)','NUMBER(10)','NUMBER(15)','NUMBER(10,2)','NUMBER(15,4)','INTEGER','FLOAT'] },
    { label: '날짜/시간',types: ['DATE','TIMESTAMP','TIMESTAMP(6)','TIMESTAMP WITH TIME ZONE','INTERVAL YEAR TO MONTH','INTERVAL DAY TO SECOND'] },
    { label: '기타',     types: ['BLOB','RAW','LONG RAW','XMLTYPE','BOOLEAN'] },
  ]},
  mssql: { label: 'SQL Server', groups: [
    { label: '문자',     types: ['CHAR(1)','CHAR(4)','CHAR(10)','NCHAR(10)','VARCHAR(20)','VARCHAR(50)','VARCHAR(100)','VARCHAR(255)','VARCHAR(500)','VARCHAR(MAX)','NVARCHAR(100)','NVARCHAR(255)','NVARCHAR(MAX)','TEXT','NTEXT'] },
    { label: '정수',     types: ['TINYINT','SMALLINT','INT','BIGINT'] },
    { label: '소수',     types: ['FLOAT','REAL','DECIMAL','DECIMAL(10,2)','DECIMAL(15,4)','NUMERIC','MONEY','SMALLMONEY'] },
    { label: '날짜/시간',types: ['DATE','TIME','DATETIME','DATETIME2','DATETIME2(7)','DATETIMEOFFSET','SMALLDATETIME'] },
    { label: '기타',     types: ['BIT','BINARY','VARBINARY','UNIQUEIDENTIFIER','XML'] },
  ]},
};

// ── 컬럼 템플릿 기본값 ────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  { id: 'audit', name: '감사 컬럼', attrs: [
    { logicalName:'등록일시',      physicalName:'REG_DT',       type:'DATETIME',    kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'', description:'', ref:null },
    { logicalName:'수정일시',      physicalName:'MDF_DT',       type:'DATETIME',    kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'', description:'', ref:null },
    { logicalName:'등록사용자ID',  physicalName:'REG_USER_ID',  type:'VARCHAR(20)', kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'', description:'', ref:null },
    { logicalName:'수정사용자ID',  physicalName:'MDF_USER_ID',  type:'VARCHAR(20)', kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'', description:'', ref:null },
  ]},
  { id: 'soft_delete', name: '소프트 삭제', attrs: [
    { logicalName:'삭제여부', physicalName:'DEL_YN', type:'CHAR(1)',    kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'N', description:'Y/N', ref:null },
    { logicalName:'삭제일시', physicalName:'DEL_DT', type:'DATETIME',  kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'',  description:'',    ref:null },
  ]},
  { id: 'use_yn', name: '사용여부', attrs: [
    { logicalName:'사용여부', physicalName:'USE_YN', type:'CHAR(1)', kind:'normal', notNull:false, unique:false, autoIncrement:false, defaultValue:'Y', description:'Y/N', ref:null },
  ]},
];

// ── SEC_RESIZE_HIT ─────────────────────────────────────────────
const SEC_RESIZE_HIT = 8;

// ── PORT 상수 ──────────────────────────────────────────────────
const PORT_R   = 5;
const PORT_HIT = 10;
