import type { TurnEvent, TurnRequest } from '../shared/protocol';

/**
 * POSTs one model step to /api/ai/turn and yields its Server-Sent Events.
 * Non-2xx responses (missing key, bad request) become a single error event.
 */
export async function* fetchTurn(request: TurnRequest, signal: AbortSignal): AsyncGenerator<TurnEvent> {
  const res = await fetch('/api/ai/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    yield { type: 'error', message: body?.error ?? `The AI service returned ${res.status}.` };
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) yield JSON.parse(line.slice(6)) as TurnEvent;
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}
