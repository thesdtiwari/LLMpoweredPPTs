import type { ToolCall } from '../shared/protocol';

/** The subset of an OpenAI-style streamed tool-call delta we rely on. */
export interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
  /** Gemini's OpenAI-compatible endpoint puts the thought_signature here. */
  extra_content?: Record<string, unknown>;
}

/**
 * Reassembles streamed tool calls. Handles both dialects of the
 * OpenAI-compatible wire format:
 * - OpenAI: one call is split across many deltas, grouped by `index`.
 * - Gemini: each delta is a complete call with its own `id` and no `index`.
 *
 * Calls stream one after another, so a call is complete as soon as a delta for
 * a different call arrives (or the stream ends). `push` returns the calls that
 * just completed, so they can be executed while the model keeps writing.
 */
export class ToolCallAccumulator {
  private readonly calls = new Map<string, ToolCall>();
  private readonly emitted = new Set<string>();
  private lastKey: string | null = null;

  /** Returns [calls completed by this delta, name of a newly started call]. */
  push(delta: ToolCallDelta): { completed: ToolCall[]; started: ToolCall | null } {
    const key = delta.index !== undefined ? `i${delta.index}` : delta.id ? `id:${delta.id}` : (this.lastKey ?? 'i0');
    const completed = key !== this.lastKey ? this.flush(key) : [];
    this.lastKey = key;

    let started: ToolCall | null = null;
    let call = this.calls.get(key);
    if (!call) {
      call = { id: delta.id ?? `call_${this.calls.size}`, name: delta.function?.name ?? '', arguments: '' };
      this.calls.set(key, call);
      started = call;
    } else if (delta.function?.name) {
      call.name += delta.function.name;
    }
    if (delta.id) call.id = delta.id;
    if (delta.function?.arguments) call.arguments += delta.function.arguments;
    if (delta.extra_content) call.extra = { ...call.extra, ...delta.extra_content };
    return { completed, started };
  }

  /** Completes every call not yet emitted (except `keep`). Call with no argument at end of stream. */
  flush(keep?: string): ToolCall[] {
    const done: ToolCall[] = [];
    for (const [key, call] of this.calls) {
      if (key === keep || this.emitted.has(key)) continue;
      this.emitted.add(key);
      done.push(call);
    }
    return done;
  }
}
