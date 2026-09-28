'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Inspector inputs keep a local draft and commit once (blur / Enter), so one
 * edit becomes one undo step instead of one per keystroke. Escape reverts.
 */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector__section">
      <h3 className="inspector__heading">{title}</h3>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

interface CommitTextProps {
  value: string;
  onCommit(value: string): void;
  multiline?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

export function CommitText({ value, onCommit, multiline, placeholder, ariaLabel, className }: CommitTextProps) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  // Follow external changes (undo, AI edits) when not mid-edit.
  if (value !== prev) {
    setPrev(value);
    setDraft(value);
  }

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    placeholder,
    'aria-label': ariaLabel,
    className: className ?? 'input',
    onBlur: commit,
  };

  return multiline ? (
    <textarea
      {...common}
      rows={4}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setDraft(value);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur();
      }}
    />
  ) : (
    <input
      {...common}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}

interface CommitNumberProps {
  value: number;
  onCommit(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  className?: string;
}

export function CommitNumber({ value, onCommit, min, max, step = 1, ariaLabel, className }: CommitNumberProps) {
  const [draft, setDraft] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setDraft(String(value));
  }

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(n)) return setDraft(String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onCommit(clamped);
    else setDraft(String(value));
  };

  return (
    <input
      type="number"
      className={className ?? 'input input--number'}
      aria-label={ariaLabel}
      value={draft}
      min={min}
      max={max}
      step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setDraft(String(value));
      }}
    />
  );
}

/**
 * Native color picker. React's onChange fires continuously while dragging in
 * the picker; the DOM `change` event fires once when it closes, so we listen
 * to that to create a single history entry.
 */
export function ColorField({
  value,
  fallback,
  onChange,
  allowAuto = true,
  ariaLabel,
}: {
  value: string | null;
  /** Shown when value is null (theme default). */
  fallback: string;
  onChange(value: string | null): void;
  allowAuto?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handler = () => onChangeRef.current(node.value);
    node.addEventListener('change', handler);
    return () => node.removeEventListener('change', handler);
  }, []);

  return (
    <span className="color-field">
      <input
        ref={ref}
        type="color"
        aria-label={ariaLabel}
        defaultValue={value ?? fallback}
        key={value ?? `auto-${fallback}`}
      />
      {allowAuto && (
        <button type="button" className="button--small" onClick={() => onChange(null)} disabled={value === null}>
          {value === null ? 'Auto' : 'Reset'}
        </button>
      )}
    </span>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  ariaLabel?: string;
}) {
  return (
    <select className="input" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
