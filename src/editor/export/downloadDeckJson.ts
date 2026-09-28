import type { Deck } from '@/domain/schema/deck';

/** Saves the canonical deck as JSON: the exact schema the editor and the AI share. */
export function downloadDeckJson(deck: Deck): void {
  const blob = new Blob([JSON.stringify(deck, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${deck.title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'deck'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
