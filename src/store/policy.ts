import { DELETE_OPERATION_TYPES, type Operation } from '@/domain/operations/schema';
import type { ChangeSource } from './history';

/**
 * Store-level rules that depend on editor state rather than deck contents.
 * Returns an error message when the change must be rejected.
 */
export function checkPolicy(ops: readonly Operation[], source: ChangeSource, aiBusy: boolean): string | null {
  if (aiBusy && source === 'user' && ops.some((op) => DELETE_OPERATION_TYPES.has(op.type))) {
    return 'Deleting is disabled while the AI is editing the deck.';
  }
  return null;
}
