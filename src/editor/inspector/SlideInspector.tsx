'use client';

import type { Slide, SlideLayout } from '@/domain/schema/deck';
import type { Theme } from '@/domain/theme';
import type { EditorCommands } from '../commands/useEditorCommands';
import { ColorField, CommitText, Field, Section, Select } from './fields';

const LAYOUTS: readonly { value: SlideLayout; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'content', label: 'Content' },
  { value: 'two-column', label: 'Two columns' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'section-break', label: 'Section break' },
  { value: 'chart-forward', label: 'Chart-forward' },
  { value: 'blank', label: 'Blank' },
];

/** Shown when no element is selected: slide metadata and slide operations. */
export function SlideInspector({
  slide,
  position,
  theme,
  aiBusy,
  commands,
}: {
  slide: Slide;
  position: number;
  theme: Theme;
  aiBusy: boolean;
  commands: EditorCommands;
}) {
  const update = (patch: Parameters<EditorCommands['updateSlide']>[1], label: string) =>
    commands.updateSlide(slide.id, patch, `${label} (slide ${position})`);

  return (
    <>
      <Section title={`Slide ${position}`}>
        <Field label="Name (shown in the filmstrip)">
          <CommitText value={slide.title} onCommit={(title) => update({ title }, `Renamed slide to "${title}"`)} />
        </Field>
        <Field label="Layout">
          <Select value={slide.layout} options={LAYOUTS} onChange={(layout) => update({ layout }, 'Changed layout')} />
        </Field>
        <Field label="Background">
          <ColorField
            value={slide.backgroundColor}
            fallback={theme.colors.background}
            onChange={(backgroundColor) => update({ backgroundColor }, 'Changed background')}
          />
        </Field>
        <Field label="Speaker notes">
          <CommitText
            multiline
            value={slide.notes}
            placeholder="Notes for the presenter"
            onCommit={(notes) => update({ notes }, 'Edited speaker notes')}
          />
        </Field>
      </Section>

      <Section title="Slide actions">
        <div className="button-column">
          <button type="button" onClick={() => commands.addSlide('after')}>
            Add blank slide after this one
          </button>
          <button type="button" onClick={() => commands.addSlide('end')}>
            Add blank slide at the end
          </button>
          <button type="button" onClick={() => commands.duplicateSlide(slide.id)}>
            Duplicate slide
          </button>
          <button
            type="button"
            className="button--danger"
            onClick={() => commands.deleteSlide(slide.id)}
            disabled={aiBusy}
            title={aiBusy ? 'Deleting is disabled while the AI is editing' : undefined}
          >
            Delete slide
          </button>
        </div>
      </Section>
    </>
  );
}
