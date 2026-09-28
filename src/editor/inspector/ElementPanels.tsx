'use client';

import { useRef } from 'react';
import type { Element, ImageElement, ShapeElement, TextElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';
import { readImageFile } from '../commands/readImageFile';
import type { EditorCommands } from '../commands/useEditorCommands';
import { ColorField, CommitNumber, CommitText, Field, Section, Select, Toggle } from './fields';

type Props<T> = { element: T; theme: Theme; commands: EditorCommands; notify(message: string): void };

/** Position, size and lock — shared by every element kind. */
export function LayoutPanel({ element, commands }: Pick<Props<Element>, 'element' | 'commands'>) {
  const { x, y, w, h } = element.bbox;
  const set = (patch: Partial<typeof element.bbox>) => commands.setBBox(element.id, patch);
  return (
    <Section title="Position & size">
      <div className="field-grid">
        <Field label="X">
          <CommitNumber value={x} onCommit={(v) => set({ x: v })} />
        </Field>
        <Field label="Y">
          <CommitNumber value={y} onCommit={(v) => set({ y: v })} />
        </Field>
        <Field label="W">
          <CommitNumber value={w} min={20} onCommit={(v) => set({ w: v })} />
        </Field>
        <Field label="H">
          <CommitNumber value={h} min={20} onCommit={(v) => set({ h: v })} />
        </Field>
      </div>
      <Toggle
        label="Locked (can't be moved, edited or deleted by you or the AI)"
        checked={element.locked}
        onChange={(locked) =>
          commands.updateElement(element.id, { locked }, locked ? 'Locked element' : 'Unlocked element')
        }
      />
    </Section>
  );
}

export function TextPanel({ element, theme, commands }: Props<TextElement>) {
  const style = (patch: Partial<TextElement['style']>, label: string) =>
    commands.updateElement(element.id, { style: patch }, label);
  return (
    <Section title="Text">
      <Field label="Content">
        <CommitText
          multiline
          value={element.text}
          onCommit={(text) => commands.editText(element.id, text)}
          ariaLabel="Text content"
        />
      </Field>
      <div className="field-row">
        <Field label="Size">
          <CommitNumber
            value={element.style.fontSize}
            min={8}
            max={240}
            onCommit={(fontSize) => style({ fontSize }, 'Font size')}
          />
        </Field>
        <Field label="Align">
          <Select
            value={element.style.align}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(align) => style({ align }, 'Text alignment')}
          />
        </Field>
      </div>
      <div className="field-row">
        <Field label="List">
          <Select
            value={element.listStyle}
            options={[
              { value: 'none', label: 'None' },
              { value: 'bullet', label: 'Bullets' },
              { value: 'numbered', label: 'Numbered' },
            ]}
            onChange={(listStyle) => commands.updateElement(element.id, { listStyle }, 'List style')}
          />
        </Field>
        <Field label="Color">
          <ColorField
            value={element.style.color}
            fallback={theme.colors.text}
            onChange={(color) => style({ color }, 'Text color')}
          />
        </Field>
      </div>
      <div className="toggle-grid">
        <Toggle
          label="Bold"
          checked={element.style.fontWeight === 'bold'}
          onChange={(b) => style({ fontWeight: b ? 'bold' : 'normal' }, 'Bold')}
        />
        <Toggle label="Italic" checked={element.style.italic} onChange={(italic) => style({ italic }, 'Italic')} />
      </div>
    </Section>
  );
}

export function ImagePanel({ element, commands, notify }: Props<ImageElement>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const replace = async (file: File | undefined) => {
    if (!file) return;
    try {
      const image = await readImageFile(file);
      commands.updateElement(element.id, { src: image.src, alt: image.name }, `Replaced image with "${image.name}"`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that image.');
    }
  };
  return (
    <Section title="Image">
      <Field label="Description (alt text)">
        <CommitText
          value={element.alt}
          onCommit={(alt) => commands.updateElement(element.id, { alt }, 'Image description')}
        />
      </Field>
      <Field label="Fit">
        <Select
          value={element.fit}
          options={[
            { value: 'cover', label: 'Fill (crop)' },
            { value: 'contain', label: 'Fit (no crop)' },
          ]}
          onChange={(fit) => commands.updateElement(element.id, { fit }, 'Image fit')}
        />
      </Field>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void replace(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button type="button" className="button--small" onClick={() => fileRef.current?.click()}>
        Replace image…
      </button>
    </Section>
  );
}

export function ShapePanel({ element, theme, commands }: Props<ShapeElement>) {
  const update = (patch: Record<string, unknown>, label: string) => commands.updateElement(element.id, patch, label);
  return (
    <Section title="Shape">
      <Field label="Shape">
        <Select
          value={element.shape}
          options={[
            { value: 'rect', label: 'Rectangle' },
            { value: 'ellipse', label: 'Ellipse' },
            { value: 'line', label: 'Line' },
          ]}
          onChange={(shape) => update({ shape }, 'Shape type')}
        />
      </Field>
      <div className="field-row">
        <Field label="Fill">
          <ColorField
            value={element.fill}
            fallback={theme.colors.accent}
            onChange={(fill) => update({ fill }, 'Shape fill')}
          />
        </Field>
        <Field label="Outline">
          <ColorField
            value={element.stroke}
            fallback={theme.colors.text}
            onChange={(stroke) => update({ stroke }, 'Shape outline')}
          />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Outline width">
          <CommitNumber
            value={element.strokeWidth}
            min={0}
            max={40}
            onCommit={(strokeWidth) => update({ strokeWidth }, 'Outline width')}
          />
        </Field>
        {element.shape === 'rect' && (
          <Field label="Corner radius">
            <CommitNumber
              value={element.cornerRadius}
              min={0}
              onCommit={(cornerRadius) => update({ cornerRadius }, 'Corner radius')}
            />
          </Field>
        )}
      </div>
    </Section>
  );
}
