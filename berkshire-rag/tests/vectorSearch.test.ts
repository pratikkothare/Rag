import 'dotenv/config';
import OpenAI from 'openai';
import { ensureSchema, pool, vectorSearchFromEmbedding } from '../src/config/mastra.config.js';

async function main(){
  await ensureSchema();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const q = 'investment philosophy of Berkshire Hathaway and its shareholders';
  const emb = await openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small', input: q });
  const vec = emb.data[0].embedding as number[];
  const rows = await vectorSearchFromEmbedding(vec, 5);
  const ok = rows.some(r => JSON.stringify(r.metadata || {}).toLowerCase().includes('shareholder'));
  // eslint-disable-next-line no-console
  console.log('vectorSearch returned', rows.length, 'rows. contains shareholder in metadata?', ok);
}

main().catch((e)=>{ console.error(e); process.exit(1); });



