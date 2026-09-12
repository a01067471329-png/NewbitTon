require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const geocodeRouter = require('./routes/geocode');
const routesRouter = require('./routes/routes');
const pushRouter = require('./routes/push');
const alternativesRouter = require('./routes/alternatives');
const { startPushScheduler } = require('./services/pushScheduler');

const app = express();
const PORT = process.env.PORT || 4000;

// CORS_ORIGIN은 콤마로 여러 origin을 나열할 수 있다(예: 로컬 개발 주소 + 배포된 프론트 주소를
// 동시에). 콤마가 없으면 예전처럼 단일 origin(또는 "*")으로 취급한다.
function parseCorsOrigin(raw) {
  if (!raw || !raw.includes(',')) return raw || '*';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

app.use(
  cors({
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  })
);
app.use(express.json());

// F5(Web Push) 실기기 검증용 임시 테스트 페이지 (실제 프론트 구현이 아님, public/push-test 참고)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'newbiton-backend', time: new Date().toISOString() });
});

app.use('/api/geocode', geocodeRouter);
app.use('/api/routes', routesRouter);
app.use('/api/push', pushRouter);
app.use('/api/alternatives', alternativesRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`[Newbiton backend] http://localhost:${PORT} 에서 실행 중`);
  startPushScheduler();
});
