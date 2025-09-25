import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import OpenAI from 'openai';
import { pool, ensureSchema, VECTOR_DIM } from '../src/config/mastra.config.js';
import { toSql } from 'pgvector/pg';

const LETTERS_DIR = path.resolve('data/letters');

function approximateChunks(text: string, targetTokens = 800, overlapTokens = 150): string[] {
  const charsPerToken = 4; // rule of thumb
  const targetChars = targetTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + targetChars, text.length);
    const slice = text.slice(i, end);
    chunks.push(slice);
    if (end === text.length) break;
    i = end - overlapChars;
    if (i < 0) i = 0;
  }
  return chunks;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\f/g, '\n') // form feeds to new lines
    .replace(/[\t\r]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getPdfText(filePath: string): Promise<string> {
  const dataBuffer = await fs.promises.readFile(filePath);
  const data = await pdf(dataBuffer);
  return cleanText(data.text || '');
}

async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!openai.apiKey) throw new Error('OPENAI_API_KEY is required');

  await ensureSchema();

  const files = (await fs.promises.readdir(LETTERS_DIR)).filter((f) => f.toLowerCase().endsWith('.pdf'));
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No PDFs found in data/letters');
    return;
  }

  const client = await pool.connect();
  let totalChunks = 0;
  try {
    for (const filename of files) {
      const filePath = path.join(LETTERS_DIR, filename);
      // eslint-disable-next-line no-console
      console.log(`Processing ${filename}...`);
      const text = await getPdfText(filePath);
      const yearMatch = filename.match(/(19|20)\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

      const chunks = approximateChunks(text);
      totalChunks += chunks.length;

      for (let idx = 0; idx < chunks.length; idx++) {
        const chunk = chunks[idx];
        // Get embedding
        const embModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
        const emb = await openai.embeddings.create({
          model: embModel,
          input: chunk,
        });
        const vector = emb.data[0].embedding;
        if (vector.length !== VECTOR_DIM) {
          throw new Error(`Embedding length ${vector.length} != VECTOR_DIM ${VECTOR_DIM}`);
        }

        const metadata = {
          filename,
          year,
          chunk_index: idx,
        };

        await client.query(
          `INSERT INTO documents (text, metadata, embedding) VALUES ($1, $2::jsonb, $3::vector)`,
          [chunk, JSON.stringify(metadata), toSql(vector)]
        );
        if ((idx + 1) % 10 === 0) {
          // eslint-disable-next-line no-console
          console.log(`Inserted ${idx + 1}/${chunks.length} chunks for ${filename}`);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`Finished ${filename}: ${chunks.length} chunks.`);
    }
  } finally {
    client.release();
  }

  // eslint-disable-next-line no-console
  console.log(`Ingestion complete. Total chunks inserted: ${totalChunks}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});


