# AI Presentation Builder

Generate slide decks from a prompt, refine them through chat, and edit them on a free-form canvas.

> Status: AI generation and editing, canvas editing and drag and drop are working. Inspectors, the insert menu and export are in progress.

## Setup

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY (server-only, used by /api/ai/turn)
npm run dev                  # http://localhost:3000
```

| Script                        | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `npm run dev`                 | Development server                          |
| `npm run build` / `npm start` | Production build / serve                    |
| `npm run check`               | Typecheck + lint + unit tests (same as CI)  |
| `npm run typecheck`           | Strict TypeScript check                     |
| `npm run lint`                | ESLint, including architecture import rules |
| `npm test`                    | Unit tests (Vitest)                         |
| `npm run format`              | Prettier                                    |

### Environment

| Variable         | Required    | Notes                                                               |
| ---------------- | ----------- | ------------------------------------------------------------------- |
| `OPENAI_API_KEY` | For AI chat | Server-only. Read in `src/server/env.ts`; never sent to the browser |
| `OPENAI_MODEL`   | No          | Defaults to `gpt-4.1` (fast, reliable tool calling)                 |

`GET /api/health` reports `{ status, aiConfigured, model, commit }` without exposing the key. Use it to verify a deployment.

### Deploying (Vercel)

Import the repository in Vercel (framework preset: Next.js, no extra config), set `OPENAI_API_KEY` in Project Settings → Environment Variables, and deploy. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and build on every push and pull request.

## Architecture

```
src/
  domain/      Pure TypeScript + Zod. No React.
    schema/      Deck, Slide, Element (text | image | shape | chart | table), geometry, ids
    operations/  Operation union (Zod) + applyOperations(): the only way to change a deck
    invariants.ts, queries.ts, factories.ts, theme.ts, sampleDeck.ts
  ai/
    shared/      Tool schemas (Zod, one source for the model and the executor) and the wire protocol
    server/      System prompt + OpenAI streaming adapter (server-only)
    client/      Agent loop (useAiSession), tool executor, SSE reader
  server/      Server-only code (`import 'server-only'`): env and secrets
  store/       One canonical deck store (React Context)
    DeckProvider.tsx   dispatch / undo / redo / getDeck / setAiBusy
    history.ts         snapshot undo stack with grouping (one AI turn = one undo step)
    policy.ts          editor rules, e.g. no manual deletes while the AI is editing
    EditorUiProvider   selection + current slide (not part of the deck)
  editor/      React UI; reads the store, changes it only via dispatch
    slide/       SlideView + per-kind renderers, shared by canvas, filmstrip and export
    shell/       TopBar, Filmstrip, CanvasArea, ChatPanel
  app/         Next.js App Router entry, error / not-found pages, /api routes
```

**Data flow:** UI action or AI tool call → `Operation[]` → `dispatch` → `applyOperations` (validate, all-or-nothing, invariants) → new immutable deck → history entry → every view re-renders only what changed.

**Coordinates:** every slide is a fixed 1920×1080 artboard. Elements store `{x, y, w, h, rotation}` in those units. The UI scales the artboard with a CSS transform, so pointer math divides by the same scale factor.

**Boundaries (enforced by ESLint):** `domain/` cannot import React, the store or UI; client code cannot import `server/`.

## Drag and drop

**Coordinate space.** Every slide is a fixed 1920×1080 artboard. Elements store `{x, y, w, h}` in slide units, and the canvas scales the artboard with a CSS transform. Pointer movement is converted with `delta / scale`, so snapping and clamping always happen in slide units ([`editor/canvas/geometry.ts`](src/editor/canvas/geometry.ts), unit-tested).

**Moving and resizing on the canvas** use custom Pointer Events handling ([`useCanvasDrag`](src/editor/canvas/useCanvasDrag.ts)) rather than a library, because it needs scale-aware math, resize handles and grid snapping. While dragging, only a preview of the boxes is kept in React state; the deck changes once, on pointer up, as a single `element.setBBox` transaction (one undo step). Positions snap to a 20-unit grid (hold ⌘/Ctrl to place freely), Shift keeps the aspect ratio when resizing, and Escape cancels and restores the original position.

**Moving elements to another slide.** The same canvas drag checks what's under the pointer (`document.elementFromPoint`) for a filmstrip thumbnail marked `data-drop-slide-id`. When one is found, the thumbnail is highlighted with "Move here" (or "Copy here" while ⌥/Alt is held, which you can toggle mid-drag), and the dragged elements fade in place. On drop, one `element.transfer` operation moves or copies the whole selection. Elements keep their position, clamped into the target artboard, so an oversized element still lands fully on the slide. The operation changes the element's `slideId`, so the AI sees the new parent slide on its next turn. Undo reverses the whole transfer.

**Reordering slides** uses `@dnd-kit/sortable` in the filmstrip. Thumbnails shift apart and the dragged slide's slot becomes a dashed placeholder showing where it will land, while a copy follows the pointer. The drop dispatches `slide.move`. A 6px activation distance keeps plain clicks working as navigation, and Escape cancels.

## AI architecture

The model edits the deck only through **tool calls**, which are validated and applied in the browser against the one canonical store:

```
Chat → useAiSession ──POST {messages, deck view}──▶ /api/ai/turn ──▶ OpenAI (streaming, tools)
          ▲                                               │
          └──────── SSE: text deltas, completed tool calls ◀┘
          │
   executeTool(): Zod-validate → domain operations → dispatch (source "ai", one undo group per turn)
          │
   tool results go back to the model in the next step, until it stops calling tools
```

- **One canonical deck.** The server holds only the API key and has no copy of the deck. Every step sends a fresh compact deck view ([`buildAiDeckView`](src/domain/serialize/aiView.ts)) with ids, boxes, text, chart data and table rows, plus the user's current slide and selection. Manual edits, including cross-slide drags, are therefore always visible to the model.
- **Tools** match the brief: `add_slide`, `update_slide`, `delete_slide`, `reorder_slides`, `duplicate_slide`, `change_layout`, `add_element`, `update_element`, `delete_element`, `move_element` (including to another slide), `resize_element`, `reorder_elements`, `add_chart`, `update_chart_data`, `change_chart_type`, `update_table`, plus `plan_deck` / `populate_slide`. Their Zod schemas ([`ai/shared/tools.ts`](src/ai/shared/tools.ts)) generate the JSON Schema sent to the model and validate every call before it is applied.
- **Two-phase generation.** `plan_deck` creates the outline as "pending" slides and returns their ids; `populate_slide` fills each one. The executor enforces this: `populate_slide` only works on pending slides, and adding slides to an empty deck requires a plan first.
- **Targeted patches.** Edits are surgical operations on ids (`update_element`, `move_element`, …). The executor never regenerates the deck, and untouched slides and elements keep their identity.
- **Streaming.** The route re-emits OpenAI's stream as Server-Sent Events and emits each tool call as soon as its arguments are complete. The browser applies it immediately, so slides appear one by one while the model is still writing.
- **Safety.** Invalid or failing tool calls return an error result to the model, which usually corrects itself; they never throw. While the AI is working, manual deletes are disabled, locked elements can't be changed, and one ⌘Z undoes the whole AI turn.

## Export

**Decision: print to PDF, not a `.pptx` file.** Click **Export PDF** (or press ⌘P) and choose "Save as PDF". There is also a **JSON** button that downloads the deck in its exact schema.

- Every slide prints on its own 16:9 page (1280×720 CSS px = 13.33 × 7.5 in, the PowerPoint widescreen size).
- The print view ([`PrintDeck`](src/editor/export/PrintDeck.tsx)) renders each slide from the same canonical deck with the same `SlideView` as the canvas, at the same 1920×1080 artboard scaled to the page. Positions, sizes and z-order therefore match the editor exactly. Charts print as vector Recharts SVG, and tables and images print as themselves.
- It lives inside the editor page (hidden on screen and shown by `@media print`) because the deck exists only in memory. A separate `/print` route would open with an empty deck.
- Verified in headless Chrome: after moving and resizing a chart, every element's printed box matches its stored bbox (maximum error 0 units), the chart prints with all its bars, and the PDF has one 960×540 pt page per slide.
- Not included: an editable `.pptx` export.
