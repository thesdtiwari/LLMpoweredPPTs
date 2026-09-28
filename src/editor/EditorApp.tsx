'use client';

import dynamic from 'next/dynamic';

/**
 * The editor is client-only: it measures the viewport to scale the artboard,
 * renders Recharts, and generates random ids that would not match a server render.
 */
const EditorShell = dynamic(() => import('./shell/EditorShell'), {
  ssr: false,
  loading: () => <div className="app-loading">Loading editor…</div>,
});

export function EditorApp() {
  return <EditorShell />;
}
