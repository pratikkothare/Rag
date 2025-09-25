import 'dotenv/config';
import OpenAI from 'openai';
import { vectorSearchFromEmbedding } from '../config/mastra.config.js';

const SYSTEM_PROMPT = `You are an expert financial analyst specialized in Warren Buffett's investment philosophy using only the provided Berkshire Hathaway shareholder letters as sources. Answer concisely, cite years and filenames for any quotes, and list the source chunks used.`;

export type RetrievedSource = {
  id: string;
  text: string;
  metadata: { filename?: string; year?: number; chunk_index?: number };
  distance: number;
};

export type AgentResponse = {
  stream: AsyncIterable<string>;
  sources: RetrievedSource[];
};

export async function answerWithRag(userQuery: string): Promise<AgentResponse> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!openai.apiKey) throw new Error('OPENAI_API_KEY is required');

  const embModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const emb = await openai.embeddings.create({ model: embModel, input: userQuery });
  const queryEmbedding = emb.data[0].embedding as number[];

  const retrieved = await vectorSearchFromEmbedding(queryEmbedding, 6);
  const sources: RetrievedSource[] = retrieved.map((r) => ({
    id: r.id,
    text: r.text,
    metadata: r.metadata,
    distance: r.distance,
  }));

  const context = sources
    .map((s, i) => `Source ${i + 1} (${s.metadata?.filename ?? 'unknown'} ${s.metadata?.year ?? ''} chunk ${s.metadata?.chunk_index ?? ''}):\n${s.text}`)
    .join('\n\n');

  const userPrompt = `Use only the provided sources. If unsure, say you don't know.\n\nSOURCES:\n${context}\n\nQUESTION: ${userQuery}`;

  const completion = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
  });

  async function* iterator() {
    for await (const chunk of completion) {
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      if (delta) yield delta;
    }
  }

  return { stream: iterator(), sources };
}



