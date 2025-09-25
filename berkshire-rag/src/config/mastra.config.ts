import 'dotenv/config';
import { Pool } from 'pg';
import { toSql } from 'pgvector/pg';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  VECTOR_DIM: z.string().transform((v) => parseInt(v, 10)).pipe(z.number().int().positive()),
});

const parsed = EnvSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  VECTOR_DIM: process.env.VECTOR_DIM ?? '1536',
});

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment for DB:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid env');
}

export const VECTOR_DIM = parsed.data.VECTOR_DIM;

export const pool = new Pool({ connectionString: parsed.data.DATABASE_URL });

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        text text NOT NULL,
        metadata jsonb,
        embedding vector(${VECTOR_DIM})
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS documents_embedding_idx
      ON documents USING ivfflat (embedding vector_l2_ops)
      WITH (lists = 100);
    `);
  } finally {
    client.release();
  }
}

export type VectorSearchRow = {
  id: string;
  text: string;
  metadata: any;
  distance: number;
};

export async function vectorSearchFromEmbedding(embedding: number[], topK = 6): Promise<VectorSearchRow[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, text, metadata, (embedding <-> $1::vector) AS distance
       FROM documents
       ORDER BY embedding <-> $1::vector
       LIMIT $2`,
      [toSql(embedding), topK]
    );
    return res.rows as VectorSearchRow[];
  } finally {
    client.release();
  }
}


