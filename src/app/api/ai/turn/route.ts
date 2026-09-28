import OpenAI from 'openai';
import { z } from 'zod';
import { streamTurn } from '@/ai/server/llmTurn';
import { type TurnEvent, TurnRequestSchema } from '@/ai/shared/protocol';
import { getServerEnv, MissingConfigError, requireGeminiApiKey } from '@/server/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Vercel's maximum on the Hobby plan (fluid compute). Slow free-tier model steps can take minutes. */
export const maxDuration = 300;

/** SSE comment lines keep the connection alive while the model is thinking silently. */
const KEEP_ALIVE_MS = 15_000;

const MAX_DECK_JSON = 300_000;

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

function describeError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    const detail = err.message.toLowerCase();
    if (err.status === 401 || err.status === 403 || detail.includes('api key not valid')) {
      return 'The Gemini API key was rejected. Check GEMINI_API_KEY.';
    }
    if (err.status === 429 || err.status === 503) {
      return 'All Gemini models are busy or out of free-tier quota right now. Please try again in a minute.';
    }
    if (err.status === 404) return `The model is not available for this key: ${err.message}`;
    return `Gemini error (${err.status ?? 'network'}): ${err.message}`;
  }
  return err instanceof Error ? err.message : 'Unexpected error';
}

/**
 * One model step. The browser sends the conversation plus the current deck;
 * this route streams text and completed tool calls back as Server-Sent Events.
 * Tools are executed in the browser against the canonical deck, so the server
 * holds no deck state — only the API key.
 */
export async function POST(req: Request) {
  let apiKey: string;
  try {
    apiKey = requireGeminiApiKey();
  } catch (err) {
    if (err instanceof MissingConfigError) return jsonError(503, err.message);
    throw err;
  }

  const parsed = TurnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, `Invalid request: ${z.prettifyError(parsed.error)}`);

  const deckJson = JSON.stringify(parsed.data.deck ?? {});
  if (deckJson.length > MAX_DECK_JSON) return jsonError(413, 'The deck is too large to send to the AI.');

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          clearInterval(keepAlive); // client went away
        }
      }, KEEP_ALIVE_MS);
      try {
        for await (const event of streamTurn({
          apiKey,
          models: [getServerEnv().GEMINI_MODEL, ...getServerEnv().GEMINI_FALLBACK_MODELS],
          messages: parsed.data.messages,
          deckJson,
          nudge: parsed.data.nudge,
          signal: req.signal,
        })) {
          send(event);
        }
      } catch (err) {
        if (!req.signal.aborted) send({ type: 'error', message: describeError(err) });
      } finally {
        clearInterval(keepAlive);
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
