const express = require('express');
const cors = require('cors');
const configRouter = require('./routes/config');
const executeRouter = require('./routes/execute');
const schemaRouter = require('./routes/schema');
const healthRouter = require('./routes/health');
const { setupTray } = require('./tray');
const { version } = require('../package.json');

const PORT = 3737;
const app = express();

const ALLOWED_ORIGINS = [
  'https://simjaesugn.github.io',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1'
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === 'null' || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')) {
      cb(null, true);
    } else {
      cb(new Error(`CORS 차단: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '10mb' }));

app.get('/ping', (req, res) => {
  res.json({ ok: true, version, port: PORT });
});

app.use('/config', configRouter);
app.use('/execute', executeRouter);
app.use('/schema', schemaRouter);
app.use('/health', healthRouter);

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`UXERManager 미들웨어 실행 중 — http://127.0.0.1:${PORT}`);
  try {
    setupTray(PORT);
    console.log('트레이 아이콘 등록됨 — 트레이에서 종료 가능');
  } catch (e) {
    console.log('트레이 등록 실패 (콘솔 모드로 실행 중). 종료: Ctrl+C');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] 포트 ${PORT}가 이미 사용 중입니다. 기존 UXERManager를 종료하거나 포트를 변경하세요.`);
    process.exit(1);
  } else {
    throw err;
  }
});

process.on('SIGINT', () => process.exit(0));
