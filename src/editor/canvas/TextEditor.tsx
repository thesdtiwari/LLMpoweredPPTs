'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { TextElement } from '@/domain/schema/elements';
import type { Theme } from '@/domain/theme';

interface Props {
  element: TextElement;
  theme: Theme;
  scale: number;
  onCommit(text: string): void;
  onClose(): void;
}

/**
 * In-place text editing: a textarea laid exactly over the element, using the
 * same font metrics. Commits on blur, Escape, or ⌘/Ctrl+Enter.
 */
export function TextEditor({ element, theme, scale, onCommit, onClose }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(element.text);
  const { bbox, style } = element;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const finish = () => {
    if (value !== element.text) onCommit(value);
    onClose();
  };

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Edit text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      style={{
        left: bbox.x,
        top: bbox.y,
        width: bbox.w,
        height: bbox.h,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight === 'bold' ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        color: style.color ?? theme.colors.text,
        textAlign: style.align,
        paddingLeft: element.listStyle === 'none' ? 0 : '1.2em',
        outlineWidth: 2 / scale,
      }}
    />
  );
}
