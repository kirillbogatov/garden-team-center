# Sticky notes: plain-input redesign

## Goal

Redesign the sticky-note component (`src/components/sticky-notes.jsx`, styles in
`src/styles.css` around `.sticky-note-*`) so each note looks like a plain application
input field instead of a colored post-it card. Keep autosave, drag reorder, delete,
and "move to notes" working. Add unlimited vertical resize and a fullscreen edit mode.

## Current state

A `.sticky-note-card` is a colored card (yellow/pink/blue/green background via
`is-{color}` classes), with a header row (`.sticky-note-head`) holding a bold/italic
formatting toolbar and color-cycle/delete buttons, a `Textarea` body capped at
`max-height: 220px`, and a footer with save-state text and a "В заметки" button.

## Changes

### Visual: card → plain input

- Drop the colored background (`is-yellow/pink/blue/green`), box-shadow, and the
  2px radius. Replace with the app's standard field look: `border: 1px solid
  hsl(var(--border)/.9)`, `background: hsl(var(--background))`, `border-radius: 8px`
  (matches `Input`/`Textarea` in `src/components/ui.jsx`).
- Keep the `sticky-note-card` class name (referenced by
  `test/client-parity.test.js`); only its styling changes.

### Remove entirely

- The card header (`.sticky-note-head`), the bold/italic formatting toolbar
  (`.sticky-note-formatbar`, `surround()`), and all color UI: the color-cycle
  button, `Palette` icon, `cycleColor()`, `noteColor()` usage for styling, and the
  `is-{color}` classes.
- Stop sending `color` in create/update payloads. Backend
  (`server/routes/comments.js`) already defaults to `'yellow'` when `color` is
  absent and only patches it when present — no backend change needed. Existing
  stored `color` values are left as-is and simply unused.
- All notes render identically (no per-note visual distinction by color).

### Delete / expand controls

- Two small icon buttons (delete, expand-to-fullscreen) placed in the top-right
  corner of the field, visible on hover/focus-within (same visibility pattern as
  today's `.sticky-note-actions`).
- Give them a visible gap and mute the delete icon's color relative to expand, to
  reduce mis-clicks. The existing `confirm('Удалить стикер?')` on non-draft delete
  stays as a safety net.

### Unlimited height

- Remove `max-height: 220px` from `.sticky-note-editor`. Keep `resize: vertical`
  and the existing `min-height: 72px`.

### Fullscreen expand

- New "expand" button opens the note's text in a modal overlay (dimmed backdrop)
  covering the viewport, with a large textarea bound to the same `text` state.
- Reuses the existing `updateText` / debounce / `saveNote` / `flush` garden — no new
  save path.
- Closes via Escape, a "Закрыть" button, or backdrop click; flushes pending save on
  close the same way blur does today.

### Untouched

- Drag-and-drop reorder (`draggedId`, `dropOn`, `persistOrder`).
- Autosave debounce (`updateText`, `saveNote`, `flush`).
- Save-state indicator and "В заметки" button/footer row.
- Empty-state "Добавить первый стикер" button.

## Out of scope

- No backend/API changes.
- No change to the `color` field in the data model — only its UI usage is removed.
