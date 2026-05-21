import express from 'express';
import cors from 'cors';
import { systemRoute } from './routes/system.mjs';
import { newsRoute } from './routes/news.mjs';
import { emailRoute, scheduleRoute } from './routes/email.mjs';
import { agentsRoute } from './routes/agents.mjs';
import { aiRoute } from './routes/ai.mjs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_, res) => res.json({ ok: true, time: Date.now() }));

app.get('/api/system', systemRoute);
app.post('/api/news', newsRoute);
app.post('/api/email/important', emailRoute);
app.post('/api/schedule/today', scheduleRoute);
app.get('/api/agents/usage', agentsRoute);
app.post('/api/ai/chat', aiRoute);

const port = Number(process.env.PORT || 5174);
app.listen(port, '127.0.0.1', () => {
  console.log(`[aurora] api listening on http://127.0.0.1:${port}`);
});
