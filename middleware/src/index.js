const express = require('express');
const cors = require('cors');
const configRouter = require('./routes/config');
const executeRouter = require('./routes/execute');

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

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`UXERManager 미들웨어 실행 중 — http://127.0.0.1:${PORT}`);
  console.log('종료: Ctrl+C');
});

process.on('SIGINT', () => {
  console.log('\n미들웨어를 종료합니다.');
  process.exit(0);
});
