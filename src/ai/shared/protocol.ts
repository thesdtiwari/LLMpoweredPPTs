import { z } from 'zod';

/**
 * Wire contract between the browser (which owns the deck and executes tools)
 * and the /api/ai/turn route (which owns the API key and streams the model).
 * Provider-neutral: the server maps these to the LLM SDK's message format.
 */

export const ToolCallSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  /** Raw JSON arguments exactly as the model produced them. */
  arguments: z.string().max(100_000),
  /**
   * Opaque provider data that must be echoed back unchanged on the next request
   * (Gemini's thought_signature, without which multi-step tool use fails).
   */
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

export const ChatMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().min(1).max(8_000) }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().max(20_000),
    toolCalls: z.array(ToolCallSchema).max(40),
  }),
  z.object({ role: z.literal('tool'), toolCallId: z.string().min(1).max(200), content: z.string().max(20_000) }),
]);
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const TurnRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(200),
  /** Compact, current deck state (see domain/serialize/aiView). Re-sent every step so the model sees manual edits. */
  deck: z.unknown(),
});
export type TurnRequest = z.infer<typeof TurnRequestSchema>;

/** Server-sent events emitted by /api/ai/turn, one JSON object per `data:` line. */
export type TurnEvent =
  | { type: 'text'; delta: string }
  /** The model started writing a tool call; arguments are still streaming. */
  | { type: 'tool_call_start'; id: string; name: string }
  /** A tool call is complete and can be executed immediately. */
  | { type: 'tool_call'; call: ToolCall }
  /** Transient progress note, e.g. while waiting for model capacity. */
  | { type: 'status'; message: string }
  | { type: 'done'; finishReason: string | null }
  | { type: 'error'; message: string };
