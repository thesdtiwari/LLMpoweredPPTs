'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { randomId } from '@/domain/schema/ids';
import { buildAiDeckView } from '@/domain/serialize/aiView';
import { useDeckActions } from '@/store/DeckProvider';
import { useEditorUi } from '@/store/EditorUiProvider';
import type { ChatMessage, ToolCall } from '../shared/protocol';
import { fetchTurn } from './sse';
import { executeTool } from './toolExecutor';

export type ChatItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string }
  | { id: string; kind: 'tool'; name: string; status: 'running' | 'ok' | 'error'; summary: string }
  | { id: string; kind: 'error'; text: string }
  | { id: string; kind: 'notice'; text: string };

type NewItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, 'id'> : never) : never;

/** Safety net against runaway loops; a full deck generation takes 2–4 steps. */
const MAX_STEPS = 12;
/** Older turns are dropped from the request; the deck state is re-sent in full every step anyway. */
const HISTORY_USER_TURNS = 6;

const RUNNING_LABELS: Record<string, string> = {
  plan_deck: 'Planning the deck…',
  populate_slide: 'Writing a slide…',
};

function recentHistory(messages: readonly ChatMessage[]): ChatMessage[] {
  let seen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user' && ++seen === HISTORY_USER_TURNS) return messages.slice(i);
  }
  return [...messages];
}

/**
 * The client half of the agent loop. Each step POSTs the conversation and the
 * current deck to /api/ai/turn, applies every tool call to the canonical store
 * the moment it arrives (so slides appear progressively), then sends the tool
 * results back until the model stops calling tools.
 *
 * All changes in one turn share a history group, so one ⌘Z undoes the turn.
 */
export function useAiSession() {
  const actions = useDeckActions();
  const ui = useEditorUi();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [running, setRunning] = useState(false);
  const transcriptRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  /** History sequence at the end of the last AI turn; manual edits after it are reported to the model. */
  const lastAiSeqRef = useRef(0);
  const uiRef = useRef(ui);
  useEffect(() => {
    uiRef.current = ui;
  });
  useEffect(() => () => abortRef.current?.abort(), []);

  const addItem = useCallback((item: NewItem): string => {
    const id = randomId('el');
    setItems((prev) => [...prev, { ...item, id } as ChatItem]);
    return id;
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<ChatItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...patch } as ChatItem) : it)));
  }, []);

  const send = useCallback(
    async (input: string) => {
      const prompt = input.trim();
      if (!prompt || abortRef.current) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      actions.setAiBusy(true);
      const groupId = randomId('el');
      const transcript = transcriptRef.current;
      transcript.push({ role: 'user', content: prompt });
      addItem({ kind: 'user', text: prompt });
      let lastTouchedSlide: string | undefined;

      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          let text = '';
          let assistantItem: string | null = null;
          let failure: string | null = null;
          let statusItem: string | null = null;
          const toolCalls: ToolCall[] = [];
          const results: ChatMessage[] = [];
          const toolItems = new Map<string, string>();

          const { currentSlideId, selectedElementIds } = uiRef.current;
          const deck = buildAiDeckView(
            actions.getDeck(),
            { currentSlideId, selectedElementIds },
            actions.userChangesSince(lastAiSeqRef.current),
          );

          try {
            for await (const event of fetchTurn({ messages: recentHistory(transcript), deck }, controller.signal)) {
              if (event.type === 'text') {
                text += event.delta;
                assistantItem ??= addItem({ kind: 'assistant', text: '' });
                updateItem(assistantItem, { text });
              } else if (event.type === 'tool_call_start') {
                const label = RUNNING_LABELS[event.name] ?? `${event.name.replaceAll('_', ' ')}…`;
                toolItems.set(event.id, addItem({ kind: 'tool', name: event.name, status: 'running', summary: label }));
              } else if (event.type === 'tool_call') {
                const { call } = event;
                toolCalls.push(call);
                const outcome = executeTool(call.name, call.arguments, {
                  getDeck: actions.getDeck,
                  apply: (ops, label) => actions.dispatch(ops, { source: 'ai', label, groupId }),
                });
                results.push({ role: 'tool', toolCallId: call.id, content: outcome.content });
                if (outcome.touchedSlideId) lastTouchedSlide = outcome.touchedSlideId;
                const status = outcome.ok ? 'ok' : 'error';
                const itemId = toolItems.get(call.id);
                if (itemId) updateItem(itemId, { status, summary: outcome.summary });
                else addItem({ kind: 'tool', name: call.name, status, summary: outcome.summary });
              } else if (event.type === 'status') {
                if (statusItem) updateItem(statusItem, { text: event.message });
                else statusItem = addItem({ kind: 'notice', text: event.message });
              } else if (event.type === 'error') {
                failure = event.message;
              }
            }
          } finally {
            // Record whatever happened (even on abort) so the transcript matches the deck.
            if (text || toolCalls.length > 0) transcript.push({ role: 'assistant', content: text, toolCalls });
            transcript.push(...results);
          }

          if (failure) {
            addItem({ kind: 'error', text: failure });
            break;
          }
          if (toolCalls.length === 0) break;
          if (step === MAX_STEPS - 1) addItem({ kind: 'notice', text: `Stopped after ${MAX_STEPS} steps.` });
        }
      } catch (err) {
        if (controller.signal.aborted) addItem({ kind: 'notice', text: 'Stopped. Changes made so far are kept.' });
        else addItem({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
      } finally {
        abortRef.current = null;
        lastAiSeqRef.current = actions.getSeq();
        actions.setAiBusy(false);
        setRunning(false);
        if (lastTouchedSlide && actions.getDeck().slides[lastTouchedSlide]) uiRef.current.goToSlide(lastTouchedSlide);
      }
    },
    [actions, addItem, updateItem],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { items, running, send, stop };
}
