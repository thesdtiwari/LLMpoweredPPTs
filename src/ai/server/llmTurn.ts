import 'server-only';
import OpenAI from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions/completions';
import type { ChatMessage, ToolCall, TurnEvent } from '../shared/protocol';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, TOOL_SCHEMAS } from '../shared/tools';
import { toToolParameters } from './jsonSchema';
import { deckStateMessage, SYSTEM_PROMPT } from './prompt';
import { type ToolCallDelta, ToolCallAccumulator } from './toolCallAccumulator';

/**
 * Google's OpenAI-compatible endpoint for the Gemini API. Using it keeps this
 * adapter provider-neutral: the `openai` package is only the HTTP client.
 */
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

/** Tool definitions generated from the shared Zod schemas, so the model and the executor use one contract. */
const TOOLS: ChatCompletionTool[] = TOOL_NAMES.map((name) => ({
  type: 'function',
  function: { name, description: TOOL_DESCRIPTIONS[name], parameters: toToolParameters(TOOL_SCHEMAS[name]) },
}));

/** Key we add inside a tool call's `extra` to remember which model signed it; stripped before sending. */
const PRODUCED_BY = 'producedBy';
/**
 * Gemini's documented placeholder for function calls whose thought_signature
 * came from a different model (e.g. after falling back mid-turn).
 */
const SKIP_SIGNATURE = 'skip_thought_signature_validator';

/** Echo each call's provider data back; replace signatures that another model produced. */
function extraContentFor(call: ToolCall, model: string): Record<string, unknown> | undefined {
  if (!call.extra) return undefined;
  const { [PRODUCED_BY]: producedBy, ...extra } = call.extra;
  const google = extra.google as Record<string, unknown> | undefined;
  if (producedBy !== model && google?.thought_signature) {
    return { ...extra, google: { ...google, thought_signature: SKIP_SIGNATURE } };
  }
  return extra;
}

function toProviderMessages(
  messages: readonly ChatMessage[],
  deckJson: string,
  model: string,
  nudge?: string,
): ChatCompletionMessageParam[] {
  const history = messages.map((m): ChatCompletionMessageParam => {
    switch (m.role) {
      case 'user':
        return { role: 'user', content: m.content };
      case 'tool':
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      case 'assistant':
        return m.toolCalls.length > 0
          ? {
              role: 'assistant',
              content: m.content || null,
              tool_calls: m.toolCalls.map((c) => {
                // Gemini rejects follow-up steps unless its thought_signature is echoed back.
                const extra = extraContentFor(c, model);
                return {
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: c.arguments },
                  ...(extra && { extra_content: extra }),
                } as ChatCompletionMessageToolCall;
              }),
            }
          : { role: 'assistant', content: m.content };
    }
  });
  // The deck state rides on the newest message so it is the freshest thing the model reads.
  // (A trailing system message does not work: Gemini merges all system messages into one
  // instruction at the top, where stale chat history would sit closer to the question.)
  const state = deckStateMessage(deckJson) + (nudge ? `\n\nNOTE FROM THE APP: ${nudge}` : '');
  const last = history.at(-1);
  if (last?.role === 'user' && typeof last.content === 'string') {
    history[history.length - 1] = { role: 'user', content: `${state}\n\nUSER REQUEST:\n${last.content}` };
  } else {
    history.push({ role: 'user', content: `${state}\n\n(Deck state after your tool calls. Continue the task.)` });
  }
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}

// ---------- Capacity handling ----------

/** Waits before each extra pass over the model list. Overload spikes are usually brief. */
const ROUND_DELAYS_MS = [0, 2_000, 5_000];
/**
 * A model that sends nothing for this long is treated as stuck and the next
 * model is tried. Congested free-tier models sometimes accept a request and
 * then stay silent until the platform kills the function.
 */
const FIRST_CHUNK_TIMEOUT_MS = 50_000;
/** Stop starting new attempts after this long; the route's maxDuration is 300 s. */
const STEP_BUDGET_MS = 250_000;

/** Models that returned 429, skipped until Google's stated retry time (per server instance). */
const quotaCooldownUntil = new Map<string, number>();

class FirstChunkTimeout extends Error {}

const isCapacityError = (err: unknown): err is InstanceType<typeof OpenAI.APIError> =>
  err instanceof OpenAI.APIError && (err.status === 429 || err.status === 503 || err.status === 500);

function retryAfterMs(err: InstanceType<typeof OpenAI.APIError>): number {
  const seconds = /retry in ([\d.]+)s/i.exec(err.message)?.[1];
  return seconds ? Math.ceil(Number(seconds) * 1000) : 60_000;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

type ChunkIterator = AsyncIterator<ChatCompletionChunk>;

/**
 * Opens a stream on one model and waits for its first chunk, giving up after
 * `timeoutMs`. Returns the iterator plus that first chunk, so nothing is lost.
 */
async function openModel(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  signal: AbortSignal,
  timeoutMs: number,
): Promise<{ iterator: ChunkIterator; first: IteratorResult<ChatCompletionChunk> }> {
  const attempt = new AbortController();
  const forwardAbort = () => attempt.abort();
  signal.addEventListener('abort', forwardAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    attempt.abort();
  }, timeoutMs);

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        parallel_tool_calls: true,
        stream: true,
        // Gemini 3 thinks before answering; "low" keeps a full deck generation fast.
        reasoning_effort: 'low',
      },
      { signal: attempt.signal },
    );
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();
    return { iterator, first };
  } catch (err) {
    if (timedOut && !signal.aborted) throw new FirstChunkTimeout(`${model} sent nothing for ${timeoutMs / 1000}s`);
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forwardAbort);
  }
}

/**
 * Streams one model step and yields provider-neutral events. Each tool call is
 * emitted as soon as it is complete, so the browser can apply it while the
 * model keeps writing.
 *
 * Free-tier Gemini quotas are per model, models get overloaded, and a
 * congested model can accept a request and then stay silent. So this walks the
 * model list — skipping models known to be out of quota, abandoning any model
 * that sends nothing within FIRST_CHUNK_TIMEOUT_MS — and retries the list a few
 * times with short waits, all within the step's time budget.
 */
export async function* streamTurn(options: {
  apiKey: string;
  models: readonly string[];
  messages: readonly ChatMessage[];
  deckJson: string;
  nudge?: string;
  signal: AbortSignal;
}): AsyncGenerator<TurnEvent> {
  const { signal } = options;
  const deadline = Date.now() + STEP_BUDGET_MS;
  // No SDK-level retries: failing fast lets us move to the next model instead of waiting.
  const client = new OpenAI({ apiKey: options.apiKey, baseURL: GEMINI_BASE_URL, maxRetries: 0 });

  let opened: { iterator: ChunkIterator; first: IteratorResult<ChatCompletionChunk> } | undefined;
  let model = '';
  let lastError: unknown;
  let tried = 0;

  rounds: for (const [round, delay] of ROUND_DELAYS_MS.entries()) {
    if (delay > 0) {
      if (Date.now() + delay > deadline) break;
      yield { type: 'status', message: `Gemini is busy — retrying (${round + 1}/${ROUND_DELAYS_MS.length})…` };
      await sleep(delay, signal);
    }
    for (const candidate of options.models) {
      if ((quotaCooldownUntil.get(candidate) ?? 0) > Date.now()) continue;
      const remaining = deadline - Date.now();
      if (remaining < 10_000) break rounds;
      if (tried > 0) yield { type: 'status', message: `Switching to ${candidate}…` };
      tried += 1;
      try {
        opened = await openModel(
          client,
          candidate,
          toProviderMessages(options.messages, options.deckJson, candidate, options.nudge),
          signal,
          Math.min(FIRST_CHUNK_TIMEOUT_MS, remaining),
        );
        model = candidate;
        break rounds;
      } catch (err) {
        if (signal.aborted) throw err;
        if (err instanceof FirstChunkTimeout) {
          console.warn(`[ai] ${err.message}; trying next model`);
          lastError = err;
          continue;
        }
        if (!isCapacityError(err)) throw err;
        lastError = err;
        if (err.status === 429) quotaCooldownUntil.set(candidate, Date.now() + retryAfterMs(err));
        console.warn(`[ai] ${candidate} unavailable (${err.status}); trying next model`);
      }
    }
  }
  if (!opened) {
    if (lastError instanceof FirstChunkTimeout) {
      throw new Error('Gemini is not responding right now (every model timed out). Please try again in a minute.');
    }
    throw lastError ?? new Error('Every configured Gemini model is out of quota. Try again in a minute.');
  }

  const calls = new ToolCallAccumulator();
  let finishReason: string | null = null;
  /** Remember which model signed each call, so a fallback model later gets a placeholder signature. */
  const tagged = (call: ToolCall): ToolCall =>
    call.extra ? { ...call, extra: { ...call.extra, [PRODUCED_BY]: model } } : call;

  for (let next = opened.first; !next.done; next = await opened.iterator.next()) {
    const choice = next.value.choices[0];
    if (!choice) continue;
    const delta = choice.delta;

    if (delta.content) yield { type: 'text', delta: delta.content };

    for (const tc of (delta.tool_calls ?? []) as ToolCallDelta[]) {
      const { completed, started } = calls.push(tc);
      for (const call of completed) yield { type: 'tool_call', call: tagged(call) };
      if (started?.name) yield { type: 'tool_call_start', id: started.id, name: started.name };
    }

    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  for (const call of calls.flush()) yield { type: 'tool_call', call: tagged(call) };
  yield { type: 'done', finishReason };
}
