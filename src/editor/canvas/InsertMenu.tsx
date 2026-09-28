'use client';

import { useRef } from 'react';
import type { ElementKind } from '@/domain/schema/elements';
import { useEditorUi } from '@/store/EditorUiProvider';
import { readImageFile } from '../commands/readImageFile';
import { useEditorCommands } from '../commands/useEditorCommands';

const ITEMS: readonly { kind: Exclude<ElementKind, 'image'>; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'chart', label: 'Chart' },
  { kind: 'table', label: 'Table' },
  { kind: 'shape', label: 'Shape' },
];

/** Inserts elements onto the current slide at a default size, selected and ready to drag. */
export function InsertMenu() {
  const commands = useEditorCommands();
  const { notify } = useEditorUi();
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      commands.insertImage(await readImageFile(file));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that image.');
    }
  };

  return (
    <div className="insert-menu" role="group" aria-label="Insert">
      <span className="canvas-toolbar__label">Insert</span>
      {ITEMS.map((item) => (
        <button key={item.kind} type="button" onClick={() => commands.insertElement(item.kind)}>
          {item.label}
        </button>
      ))}
      <button type="button" onClick={() => fileRef.current?.click()} title="Upload an image (max 4 MB)">
        Image…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="image-upload"
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
