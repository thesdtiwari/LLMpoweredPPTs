import { describe, expect, it } from 'vitest';
import { createEmptyDeck } from '@/domain/factories';
import { applyOperations } from '@/domain/operations/apply';
import type { Operation } from '@/domain/operations/schema';
import type { Deck } from '@/domain/schema/deck';
import { commit, initialStoreState, redo, undo, userChangesSince } from '../history';
import { checkPolicy } from '../policy';

function change(deck: Deck, op: Operation): Deck {
  const result = applyOperations(deck, [op]);
  if (!result.ok) throw new Error(result.error);
  return result.deck;
}

describe('history', () => {
  it('undoes and redoes snapshots', () => {
    const d0 = createEmptyDeck();
    let s = initialStoreState(d0);
    const d1 = change(d0, { type: 'slide.add', slideId: 'A' });
    s = commit(s, d1, { label: 'Add', source: 'user' });

    s = undo(s);
    expect(s.deck).toBe(d0);
    s = redo(s);
    expect(s.deck).toBe(d1);
  });

  it('collapses one AI turn into a single undo step, but not across a user edit', () => {
    const d0 = createEmptyDeck();
    let s = initialStoreState(d0);
    const ai = { label: 'AI', source: 'ai' as const, groupId: 'turn-1' };

    s = commit(s, change(s.deck, { type: 'slide.add', slideId: 'A' }), ai);
    s = commit(s, change(s.deck, { type: 'slide.add', slideId: 'B' }), ai);
    expect(s.past).toHaveLength(1);

    s = commit(s, change(s.deck, { type: 'slide.update', slideId: 'A', patch: { title: 'Mine' } }), {
      label: 'Rename',
      source: 'user',
    });
    s = commit(s, change(s.deck, { type: 'slide.add', slideId: 'C' }), ai);
    expect(s.past).toHaveLength(3);

    s = undo(s); // AI's slide C
    s = undo(s); // user's rename
    expect(s.deck.slides.A!.title).toBe('Untitled slide');
    expect(s.deck.slideOrder).toEqual(['A', 'B']);
  });
});

describe('userChangesSince', () => {
  it('reports manual edits after the last AI turn, and drops undone ones', () => {
    let s = initialStoreState(createEmptyDeck());
    s = commit(s, change(s.deck, { type: 'slide.add', slideId: 'A' }), {
      label: 'AI plan',
      source: 'ai',
      groupId: 't1',
    });
    const afterAi = s.seq;
    s = commit(s, change(s.deck, { type: 'slide.add', slideId: 'B' }), { label: 'Added slide', source: 'user' });
    s = commit(s, change(s.deck, { type: 'slide.move', slideId: 'B', toIndex: 0 }), {
      label: 'Moved slide B',
      source: 'user',
    });
    expect(userChangesSince(s, afterAi)).toEqual(['Added slide', 'Moved slide B']);

    s = undo(s);
    expect(userChangesSince(s, afterAi)).toEqual(['Added slide']);
    expect(userChangesSince(s, s.seq)).toEqual([]);
  });
});

describe('policy', () => {
  it('blocks user deletes while the AI is busy', () => {
    const del: Operation = { type: 'element.delete', elementIds: ['x'] };
    expect(checkPolicy([del], 'user', true)).toMatch(/disabled/);
    expect(checkPolicy([del], 'user', false)).toBeNull();
    expect(checkPolicy([del], 'ai', true)).toBeNull();
    expect(checkPolicy([{ type: 'slide.delete', slideId: 'A' }], 'user', true)).toMatch(/disabled/);
  });
});
