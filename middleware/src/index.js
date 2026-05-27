const express = require('express');
const cors = require('cors');
const configRouter = require('./routes/config');
const executeRouter = require('./routes/execute');
const schemaRouter = require('./routes/schema');
const { setupTray } = require('./tray');

const PORT = 3737;
const app = express();

const ALLOWED_ORIGINS = [
  'https://simjaesugn.github.io',
  'http://localhost',
  'http://localhost:3000',
  'http://127.0.0.1',
  null // file:// 로컬 실행 시
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origin === 'null' || ALLOWED_ORIGINS.includes(origin) || origin.startsWith('http://localhost')) {
      cb(null, true);
    } else {
      cb(new Error(`CORS 차단: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.get('/ping', (req, res) => {
  res.json({ ok: true, version: '1.0.0', port: PORT });
});

app.use('/config', configRouter);
app.use('/execute', executeRouter);
app.use('/schema', schemaRouter);

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`UXERManager 미들웨어 실행 중 — http://127.0.0.1:${PORT}`);
  try {
    setupTray(PORT);
    console.log('트레이 아이콘 등록됨 — 트레이에서 종료 가능');
  } catch (e) {
    console.log('트레이 등록 실패 (콘솔 모드로 실행 중). 종료: Ctrl+C');
  }
});

process.on('SIGINT', () => process.exit(0));
