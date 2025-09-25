import 'dotenv/config';
import { ensureSchema, pool } from '../src/config/mastra.config.js';

async function main(){
  await ensureSchema();
  const client = await pool.connect();
  try{
    const r = await client.query('SELECT COUNT(*)::int AS c FROM documents');
    // eslint-disable-next-line no-console
    console.log('documents count:', r.rows[0].c);
  } finally {
    client.release();
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });



