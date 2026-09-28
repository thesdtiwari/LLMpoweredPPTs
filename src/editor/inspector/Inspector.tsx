'use client';

import { getTheme } from '@/domain/theme';
import { useDeckView } from '@/store/DeckProvider';
import { useEditorUi } from '@/store/EditorUiProvider';
import { useEditorCommands } from '../commands/useEditorCommands';
import { ChartInspector } from './ChartInspector';
import { ImagePanel, LayoutPanel, ShapePanel, TextPanel } from './ElementPanels';
import { SlideInspector } from './SlideInspector';
import { TableInspector } from './TableInspector';

/**
 * Right-hand properties panel. Edits go through the same editor commands (and
 * so the same store, history and validation) as everything else.
 */
export function Inspector() {
  const { deck, aiBusy } = useDeckView();
  const { currentSlideId, selectedElementIds, notify } = useEditorUi();
  const commands = useEditorCommands();
  const theme = getTheme(deck.themeId);
  const slide = currentSlideId ? deck.slides[currentSlideId] : undefined;
  if (!slide) return null;

  const selected = selectedElementIds.length === 1 ? deck.elements[selectedElementIds[0]!] : undefined;

  let body;
  if (selectedElementIds.length > 1) {
    body = (
      <p className="inspector__hint">
        {selectedElementIds.length} elements selected. Drag to move them together, or use the toolbar to duplicate,
        reorder or delete.
      </p>
    );
  } else if (selected) {
    const panelProps = { theme, commands, notify };
    body = (
      // Keyed by id so drafts reset when the selection changes.
      <div key={selected.id}>
        {selected.kind === 'chart' && <ChartInspector chart={selected} theme={theme} commands={commands} />}
        {selected.kind === 'table' && <TableInspector table={selected} commands={commands} />}
        {selected.kind === 'text' && <TextPanel element={selected} {...panelProps} />}
        {selected.kind === 'image' && <ImagePanel element={selected} {...panelProps} />}
        {selected.kind === 'shape' && <ShapePanel element={selected} {...panelProps} />}
        <LayoutPanel element={selected} commands={commands} />
      </div>
    );
  } else {
    body = (
      <SlideInspector
        key={slide.id}
        slide={slide}
        position={deck.slideOrder.indexOf(slide.id) + 1}
        theme={theme}
        aiBusy={aiBusy}
        commands={commands}
      />
    );
  }

  return (
    <aside className="inspector" aria-label="Properties">
      {body}
    </aside>
  );
}
