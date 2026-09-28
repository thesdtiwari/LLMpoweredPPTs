import { checkDeck } from '../invariants';
import type { Deck } from '../schema/deck';
import { type IdGenerator, randomId } from '../schema/ids';
import {
  addElement,
  deleteElements,
  duplicateElements,
  reorderElementZ,
  setElementBBox,
  transferElements,
  updateElement,
} from './elementHandlers';
import { type OpContext, OperationError } from './helpers';
import type { Operation } from './schema';
import { addSlide, deleteSlide, duplicateSlide, moveSlide, updateSlide } from './slideHandlers';

export type ApplyResult =
  { ok: true; deck: Deck; createdIds: string[] } | { ok: false; error: string; failedIndex: number };

function applyOne(deck: Deck, op: Operation, ctx: OpContext): Deck {
  switch (op.type) {
    case 'deck.update': {
      const { title, themeId } = op.patch;
      return { ...deck, ...(title !== undefined && { title }), ...(themeId !== undefined && { themeId }) };
    }
    case 'slide.add':
      return addSlide(deck, op, ctx);
    case 'slide.update':
      return updateSlide(deck, op);
    case 'slide.delete':
      return deleteSlide(deck, op);
    case 'slide.duplicate':
      return duplicateSlide(deck, op, ctx);
    case 'slide.move':
      return moveSlide(deck, op);
    case 'element.add':
      return addElement(deck, op, ctx);
    case 'element.update':
      return updateElement(deck, op);
    case 'element.setBBox':
      return setElementBBox(deck, op);
    case 'element.delete':
      return deleteElements(deck, op);
    case 'element.duplicate':
      return duplicateElements(deck, op, ctx);
    case 'element.transfer':
      return transferElements(deck, op, ctx);
    case 'element.reorderZ':
      return reorderElementZ(deck, op);
  }
}

/**
 * Applies a batch of operations as one all-or-nothing transaction.
 * Pure: the input deck is never mutated, and untouched slides/elements keep their identity.
 */
export function applyOperations(deck: Deck, ops: readonly Operation[], newId: IdGenerator = randomId): ApplyResult {
  const ctx: OpContext = { newId, created: [] };
  let next = deck;

  for (const [index, op] of ops.entries()) {
    try {
      next = applyOne(next, op, ctx);
    } catch (err) {
      if (err instanceof OperationError) return { ok: false, error: err.message, failedIndex: index };
      throw err;
    }
  }

  const problems = checkDeck(next);
  if (problems.length > 0) {
    return { ok: false, error: `Deck invariant violated: ${problems.join('; ')}`, failedIndex: ops.length - 1 };
  }

  if (next !== deck) next = { ...next, version: deck.version + 1 };
  return { ok: true, deck: next, createdIds: ctx.created };
}
