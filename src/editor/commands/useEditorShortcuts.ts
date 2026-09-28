'use client';

import { useEffect, useRef } from 'react';
import { GRID } from '../canvas/geometry';
import { type EditorCommands, useEditorCommands } from './useEditorCommands';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Maps a key press to a command. Returns false when the key is not handled. */
function handleKey(e: KeyboardEvent, c: EditorCommands): boolean {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod) {
    if (key === 'z' && e.shiftKey) c.redo();
    else if (key === 'z') c.undo();
    else if (key === 'y') c.redo();
    else if (key === 'd') c.duplicateSelection();
    else if (key === 'a') c.selectAll();
    else return false;
    return true;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      c.deleteSelection();
      return true;
    case 'Escape':
      c.clearSelection();
      return true;
    case 'PageUp':
      c.previousSlide();
      return true;
    case 'PageDown':
      c.nextSlide();
      return true;
  }

  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const dir = arrows[e.key];
  if (!dir) return false;
  if (c.hasSelection) {
    // Arrow keys nudge the selection (Shift = one grid step)…
    const step = e.shiftKey ? GRID : 1;
    c.nudge(dir[0] * step, dir[1] * step);
  } else if (dir[0] + dir[1] < 0) {
    // …and navigate slides when nothing is selected.
    c.previousSlide();
  } else {
    c.nextSlide();
  }
  return true;
}

/** Global editor shortcuts. Ignored while typing in inputs or the text editor. */
export function useEditorShortcuts() {
  const commands = useEditorCommands();
  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (handleKey(e, commandsRef.current)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
