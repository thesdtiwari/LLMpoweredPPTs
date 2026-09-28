'use client';

import { createEmptyDeck } from '@/domain/factories';
import { DeckProvider } from '@/store/DeckProvider';
import { EditorUiProvider } from '@/store/EditorUiProvider';
import { useEditorShortcuts } from '../commands/useEditorShortcuts';
import { PrintDeck } from '../export/PrintDeck';
import { CanvasArea } from './CanvasArea';
import { ChatPanel } from './ChatPanel';
import { Filmstrip } from './Filmstrip';
import { TopBar } from './TopBar';

export default function EditorShell() {
  return (
    <DeckProvider initialDeck={createEmptyDeck}>
      <EditorUiProvider>
        <EditorLayout />
      </EditorUiProvider>
    </DeckProvider>
  );
}

/** Inside the providers so shortcuts can reach the store and UI state. */
function EditorLayout() {
  useEditorShortcuts();
  return (
    <>
      <div className="editor">
        <TopBar />
        <div className="editor__body">
          <Filmstrip />
          <CanvasArea />
          <ChatPanel />
        </div>
      </div>
      <PrintDeck />
    </>
  );
}
