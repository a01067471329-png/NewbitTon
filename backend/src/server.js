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

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
  })
);
app.use(express.json());

// F5(Web Push) 실기기 검증용 임시 테스트 페이지 (실제 프론트 구현이 아님, public/push-test 참고)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'newbiton-backend', time: new Date().toISOString() });
});

// 임시 디버그용: 이 서버가 외부 API(ODsay 등)를 호출할 때 실제로 어떤 공인 IP로
// 나가는지 확인하기 위함 (Render Server IP 화이트리스트 등록용). 확인 끝나면 제거할 것.
app.get('/api/_debug/my-ip', async (req, res) => {
  try {
    const ip = await fetch('https://api.ipify.org').then((r) => r.text());
    res.json({ ip });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
