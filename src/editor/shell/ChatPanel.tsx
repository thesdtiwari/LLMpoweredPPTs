'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { type ChatItem, useAiSession } from '@/ai/client/useAiSession';

const EXAMPLES = [
  'Create a 6-slide deck on our Q3 product roadmap with a revenue chart and a pricing table.',
  'Make a 5-slide pitch for a coffee subscription startup, including market size data.',
  'Build a short onboarding deck for new engineers.',
];

function ChatItemView({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="chat-msg chat-msg--user">{item.text}</div>;
    case 'assistant':
      return <div className="chat-msg chat-msg--assistant">{item.text}</div>;
    case 'tool':
      return (
        <div className={`tool-chip tool-chip--${item.status}`} title={`${item.name}: ${item.summary}`}>
          <span className="tool-chip__icon" aria-hidden>
            {item.status === 'running' ? '' : item.status === 'ok' ? '✓' : '!'}
          </span>
          <span className="tool-chip__text">{item.summary}</span>
        </div>
      );
    case 'error':
      return (
        <div className="chat-msg chat-msg--error" role="alert">
          {item.text}
        </div>
      );
    case 'notice':
      return <div className="chat-msg chat-msg--notice">{item.text}</div>;
  }
}

export function ChatPanel() {
  const { items, running, send, stop } = useAiSession();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || running) return;
    void send(draft);
    setDraft('');
  };

  const last = items.at(-1);
  const thinking = running && (!last || last.kind === 'user' || (last.kind === 'tool' && last.status !== 'running'));

  return (
    <aside className="chat" aria-label="AI assistant">
      <div className="chat__header">Assistant</div>

      <div className="chat__messages" ref={listRef} aria-live="polite">
        {items.length === 0 ? (
          <div className="empty-state">
            <h2>Ask the AI to build or edit your deck</h2>
            <p>It edits the slides directly, so you can keep working on the canvas at any time.</p>
            <div className="chat__examples">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" onClick={() => void send(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat__list">
            {items.map((item) => (
              <ChatItemView key={item.id} item={item} />
            ))}
            {thinking && <div className="chat-msg chat-msg--notice chat-thinking">Thinking…</div>}
          </div>
        )}
      </div>

      <form className="chat__composer" onSubmit={submit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={running ? 'The AI is editing the deck…' : 'Describe a deck, or ask for a change (Enter to send)'}
          rows={3}
          aria-label="Message the AI"
        />
        {running ? (
          <button type="button" onClick={stop} className="button--danger">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()} className="button--primary">
            Send
          </button>
        )}
      </form>
    </aside>
  );
}
