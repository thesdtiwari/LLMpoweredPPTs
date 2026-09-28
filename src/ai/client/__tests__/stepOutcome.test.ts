import { describe, expect, it } from 'vitest';
import { decideNextStep, MAX_RECOVERIES, type StepEnd } from '../stepOutcome';

const end = (patch: Partial<StepEnd>): StepEnd => ({
  sawDone: true,
  finishReason: 'stop',
  toolCallCount: 0,
  text: 'Done.',
  ...patch,
});
const pending = [{ id: 'sld_2', position: 2, title: 'Market' }];

describe('decideNextStep', () => {
  it('continues while the model is calling tools', () => {
    expect(decideNextStep(end({ toolCallCount: 2, text: '' }), pending, 0)).toEqual({ kind: 'continue' });
  });

  it('retries a MALFORMED_FUNCTION_CALL instead of stopping silently (the Vercel bug)', () => {
    const d = decideNextStep(
      end({ finishReason: 'function_call_filter: MALFORMED_FUNCTION_CALL', text: '' }),
      pending,
      0,
    );
    expect(d.kind).toBe('retry');
    expect(d.kind === 'retry' && d.nudge).toMatch(/malformed function call/);
  });

  it('retries a stream that was cut off before the done event', () => {
    expect(decideNextStep(end({ sawDone: false, text: '' }), [], 0).kind).toBe('retry');
  });

  it('asks the model to fill planned slides it left empty', () => {
    const d = decideNextStep(end({}), pending, 0);
    expect(d.kind === 'retry' && d.nudge).toContain('slide 2 "Market" (id sld_2)');
  });

  it('finishes normally when nothing is pending', () => {
    expect(decideNextStep(end({}), [], 0)).toEqual({ kind: 'finish' });
  });

  it('gives up with a clear message once the retry budget is spent', () => {
    const malformed = decideNextStep(end({ finishReason: 'MALFORMED_FUNCTION_CALL', text: '' }), [], MAX_RECOVERIES);
    expect(malformed.kind).toBe('fail');
    const stillPending = decideNextStep(end({}), pending, MAX_RECOVERIES);
    expect(stillPending.kind === 'fail' && stillPending.message).toMatch(/continue/);
  });

  it('nudges an empty reply once, then accepts it', () => {
    expect(decideNextStep(end({ text: '' }), [], 0).kind).toBe('retry');
    expect(decideNextStep(end({ text: '' }), [], 1).kind).toBe('finish');
  });
});
