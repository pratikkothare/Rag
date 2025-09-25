import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ensureSchema, pool } from '../config/mastra.config.js';
import { answerWithRag } from './agent.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/ingest', async (_req, res) => {
  // Optional: could spawn child process to run scripts/ingest.ts
  res.status(202).json({ status: 'trigger ingestion manually via npm run ingest' });
});

app.post('/chat', async (req, res) => {
  const message: string | undefined = req.body?.message;
  if (!message) return res.status(400).json({ error: 'message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const { stream, sources } = await answerWithRag(message);
    for await (const token of stream) {
      res.write(`event: token\n`);
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ sources })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: err?.message || 'unknown error' })}\n\n`);
    res.end();
  }
});

app.get('/document/:id', async (req, res) => {
  const id = req.params.id;
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT id, text, metadata FROM documents WHERE id = $1', [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  } finally {
    client.release();
  }
});

// Serve simple static UI
app.use('/', express.static('src/frontend')); // index.html

const port = parseInt(process.env.PORT || '4111', 10);
ensureSchema()
  .then(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on http://localhost:${port}`);
    });
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure schema', e);
    process.exit(1);
  });



