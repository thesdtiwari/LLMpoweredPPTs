'use client';

import { useDeckView } from '@/store/DeckProvider';
import { useEditorUi } from '@/store/EditorUiProvider';
import { useEditorCommands } from '../commands/useEditorCommands';
import { InsertMenu } from './InsertMenu';

/** Insert menu plus actions for the current selection (also reachable by keyboard). */
export function CanvasToolbar() {
  const { aiBusy } = useDeckView();
  const { selectedElementIds } = useEditorUi();
  const commands = useEditorCommands();
  const count = selectedElementIds.length;

  if (count === 0) {
    return (
      <div className="canvas-toolbar">
        <InsertMenu />
        <span className="canvas-toolbar__sep" />
        <span className="canvas-toolbar__hint">
          Click to select · Shift-click to add · Double-click text to edit · ⌘/Ctrl-drag ignores the grid
        </span>
      </div>
    );
  }

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Selection">
      <InsertMenu />
      <span className="canvas-toolbar__sep" />
      <span className="canvas-toolbar__count">{count === 1 ? '1 element' : `${count} elements`}</span>
      <button type="button" onClick={commands.duplicateSelection} title="Duplicate (⌘D)">
        Duplicate
      </button>
      <span className="canvas-toolbar__sep" />
      <button type="button" onClick={() => commands.reorder('front')} title="Bring to front">
        To front
      </button>
      <button type="button" onClick={() => commands.reorder('forward')} title="Bring forward">
        Forward
      </button>
      <button type="button" onClick={() => commands.reorder('backward')} title="Send backward">
        Backward
      </button>
      <button type="button" onClick={() => commands.reorder('back')} title="Send to back">
        To back
      </button>
      <span className="canvas-toolbar__sep" />
      <button
        type="button"
        className="button--danger"
        onClick={commands.deleteSelection}
        disabled={aiBusy}
        title={aiBusy ? 'Deleting is disabled while the AI is editing' : 'Delete (⌫)'}
      >
        Delete
      </button>
    </div>
  );
}
