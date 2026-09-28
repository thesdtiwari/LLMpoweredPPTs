/**
 * Decides what the agent loop does after one model step. Kept pure so the
 * recovery rules are unit-testable.
 *
 * Models do not always end a step cleanly: Gemini sometimes returns a
 * MALFORMED_FUNCTION_CALL finish reason with no tool call and no text, a
 * hosting limit can cut the stream, or the model stops while planned slides
 * are still empty. Treating any of those as "done" leaves the user staring
 * at placeholders, so they are retried with a short note to the model.
 */

export interface StepEnd {
  /** The server sent its final `done` event (otherwise the stream was cut off). */
  sawDone: boolean;
  finishReason: string | null;
  toolCallCount: number;
  text: string;
}

export interface PendingSlide {
  id: string;
  position: number;
  title: string;
}

export type StepDecision =
  | { kind: 'continue' }
  | { kind: 'finish' }
  | { kind: 'retry'; nudge: string; notice: string }
  | { kind: 'fail'; message: string };

export const MAX_RECOVERIES = 4;

const NORMAL_FINISH = new Set(['stop', 'tool_calls', 'function_call']);

function describePending(pending: readonly PendingSlide[]): string {
  return pending.map((s) => `slide ${s.position} "${s.title}" (id ${s.id})`).join(', ');
}

export function decideNextStep(end: StepEnd, pending: readonly PendingSlide[], recoveriesUsed: number): StepDecision {
  const canRetry = recoveriesUsed < MAX_RECOVERIES;
  const reason = end.finishReason ?? '';

  // 1. The stream ended without the server's final event: cut off mid-response.
  if (!end.sawDone) {
    return canRetry
      ? {
          kind: 'retry',
          notice: 'The response was cut off — retrying…',
          nudge: 'Your previous response was cut off before it finished. Continue the task using the tools.',
        }
      : { kind: 'fail', message: 'The AI response was cut off repeatedly. Please try again.' };
  }

  // Tool calls were made: the model is mid-task; send results back and keep going.
  if (end.toolCallCount > 0) return { kind: 'continue' };

  // 2. No tool call, and the model ended abnormally (e.g. MALFORMED_FUNCTION_CALL, length).
  if (reason && !NORMAL_FINISH.has(reason)) {
    const malformed = /malformed|filter/i.test(reason);
    return canRetry
      ? {
          kind: 'retry',
          notice: malformed
            ? 'The AI produced an invalid tool call — retrying…'
            : `The AI stopped early (${reason}) — retrying…`,
          nudge: malformed
            ? 'Your previous response contained a malformed function call and was discarded. Call the tools again with ' +
              'valid JSON arguments. Use at most 2 populate_slide calls per response and at most 8 elements per slide.'
            : 'Your previous response ended early. Continue with shorter responses: at most 2 slides per response.',
        }
      : { kind: 'fail', message: `The AI could not produce a valid response (${reason}). Please try again.` };
  }

  // 3. Planned slides are still empty: the model stopped too early.
  if (pending.length > 0) {
    return canRetry
      ? {
          kind: 'retry',
          notice: `Filling the remaining ${pending.length === 1 ? 'slide' : `${pending.length} slides`}…`,
          nudge:
            `These planned slides are still empty: ${describePending(pending)}. ` +
            'Call populate_slide for them now (at most 2 per response).',
        }
      : {
          kind: 'fail',
          message: `Some slides are still empty (${pending.map((s) => s.position).join(', ')}). Ask me to "continue" to finish them.`,
        };
  }

  // 4. An empty reply with nothing left to do is unusual but harmless; one nudge, then stop.
  if (!end.text.trim() && recoveriesUsed === 0) {
    return {
      kind: 'retry',
      notice: 'The AI returned an empty response — retrying…',
      nudge: 'Your previous response was empty. Complete the request using the tools, then reply briefly.',
    };
  }

  return { kind: 'finish' };
}
