# Calendar absence create/edit/delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create отпуск/отгул/больничный entries from the Calendar page via a button, and edit/delete existing ones by clicking their bar in the calendar grid — gated by the existing `vacations` permission model.

**Architecture:** Frontend-only change, entirely inside `src/pages/operations.jsx` (`CalendarPage` and a new colocated `AbsenceDialog`). Reuses the existing `useCrudDialogForm` hook against the already-CRUD-capable `vacations` REST resource, and the existing `AlertDialog` delete-confirm pattern (same shape as `ResourceCrudDialog` in `src/pages/resources.jsx`). No server, route, or data-model changes.

**Tech Stack:** React 19, react-router-dom, the project's own `@/components/ui` (Radix-based) component library, `node:test` for source-text consistency tests (this repo has no component-rendering test harness — see `test/client-parity.test.js`, `test/crud-dialog-consistency.test.js` for the established convention of asserting against page source text).

## Global Constraints

- Permission levels for the `vacations` collection are exactly one of: `none`, `own_read`, `own_manage`, `all_own_manage`, `all_manage` (from `server/auth-core.js`). "Can manage own" = level is `own_manage`, `all_own_manage`, or `all_manage`. "Can manage anyone's" = level is exactly `all_manage`.
- `GET /api/auth/me` returns `{ user: { personId, access: { vacations: <level>, ... }, ... } }`.
- The `vacations` record shape is `{ id, personId, type: 'vacation'|'sick'|'dayoff', startDate, endDate, note }` (see `server/demo-data.js`).
- Meetings and birthdays keep their current click behavior (navigate to the meeting/person) — do not touch that code path.
- No backend changes: `POST/PUT/DELETE /api/vacations` already exist via the generic CRUD routes and already enforce these permissions server-side.

---

## File Structure

- **Modify:** `src/pages/operations.jsx`
  - `CalendarPage` (currently lines 251-358): add permission derivations, dialog open/edit state, the "Добавить отсутствие" button, and change the absence-bar `onClick` to open the edit dialog when permitted.
  - New function `AbsenceDialog`, added directly after `CalendarPage` (before `function dateKey(date)`).
  - Import line (currently line 9): add `AlertDialog`.
- **Create:** `test/calendar-absence-crud.test.js` — source-text consistency tests, following the exact pattern of `test/crud-dialog-consistency.test.js` and `test/client-parity.test.js`.

---

## Task 1: Add the "Добавить отсутствие" button and `AbsenceDialog` (create garden)

**Files:**
- Modify: `src/pages/operations.jsx:9` (import), `src/pages/operations.jsx:251-358` (`CalendarPage`)
- Create (new function in same file, placed right after `CalendarPage`'s closing `}` at line 358): `AbsenceDialog`
- Test: `test/calendar-absence-crud.test.js`

**Interfaces:**
- Produces (used by Task 2): `canEditAbsence(item)`, `openEditAbsence(item)`, the `<AbsenceDialog>` element already rendered inside `CalendarPage`, and `AbsenceDialog`'s props `{ open, item, people, canManageAll, currentPersonId, onOpenChange, onSaved }`.

- [ ] **Step 1: Write the failing consistency test**

Create `test/calendar-absence-crud.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('CalendarPage derives vacation permission levels and exposes an absence-create button', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /const me\s*=\s*useEndpoint\('\/api\/auth\/me'\)/);
  assert.match(operations, /canManageOwnAbsences\s*=\s*\['own_manage','all_own_manage','all_manage'\]\.includes\(vacAccess\)/);
  assert.match(operations, /canManageAllAbsences\s*=\s*vacAccess\s*===\s*'all_manage'/);
  assert.match(operations, /const canEditAbsence\s*=\s*\(item\)\s*=>/);
  assert.ok(operations.includes('Добавить отсутствие'), 'create-absence button label missing');
});

test('AbsenceDialog exists, uses useCrudDialogForm against the vacations resource, and offers all three absence types', () => {
  const operations = read('src/pages/operations.jsx');
  assert.match(operations, /function AbsenceDialog\(/);
  const dialogSource = operations.slice(operations.indexOf('function AbsenceDialog('));
  assert.match(dialogSource, /useCrudDialogForm\(\{\s*\n?\s*resource:\s*'vacations'/);
  for (const label of ['Отпуск', 'Больничный', 'Отгул']) {
    assert.ok(dialogSource.includes(`label: '${label}'`), `${label} option missing from AbsenceDialog`);
  }
  assert.match(dialogSource, /d\.endDate\s*<\s*d\.startDate/, 'missing end-before-start validation');
  assert.match(dialogSource, /<AlertDialog/, 'AbsenceDialog should confirm deletion via the shared AlertDialog');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/calendar-absence-crud.test.js`
Expected: both tests FAIL (none of the asserted strings exist in `operations.jsx` yet).

- [ ] **Step 3: Add `AlertDialog` to the `@/components/ui` import**

In `src/pages/operations.jsx`, line 9, change:

```js
import { Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
```

to:

```js
import { AlertDialog, Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea } from '@/components/ui';
```

- [ ] **Step 4: Add permission derivations and dialog state to `CalendarPage`**

In `src/pages/operations.jsx`, inside `export function CalendarPage()`, change:

```js
  const state=useEndpoint(`/api/calendar/month?year=${year}&month=${month}`,[year,month]);
  const people=useResource('people');
```

to:

```js
  const state=useEndpoint(`/api/calendar/month?year=${year}&month=${month}`,[year,month]);
  const people=useResource('people');
  const me=useEndpoint('/api/auth/me');
  const vacAccess=me.data?.user?.access?.vacations || 'none';
  const canManageOwnAbsences=['own_manage','all_own_manage','all_manage'].includes(vacAccess);
  const canManageAllAbsences=vacAccess==='all_manage';
  const currentPersonId=me.data?.user?.personId || null;
  const canEditAbsence=(item)=>canManageAllAbsences||(canManageOwnAbsences&&item.personId===currentPersonId);
  const [absenceOpen,setAbsenceOpen]=React.useState(false);
  const [absenceItem,setAbsenceItem]=React.useState(null);
  const openCreateAbsence=()=>{ setAbsenceItem(null); setAbsenceOpen(true); };
  const openEditAbsence=(item)=>{ setAbsenceItem(item); setAbsenceOpen(true); };
```

- [ ] **Step 5: Add the "Добавить отсутствие" button to the page header**

In the same function, change:

```jsx
    <PageHeader title="Календарь" description="Встречи, дни рождения и отсутствия команды." actions={<div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month-2,1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" size="sm" onClick={()=>setCursor(new Date(today.getFullYear(),today.getMonth(),1))}>Сегодня</Button><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month,1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4"/></Button></div>}/>
```

to:

```jsx
    <PageHeader title="Календарь" description="Встречи, дни рождения и отсутствия команды." actions={<div className="flex items-center gap-2">{canManageOwnAbsences&&<Button size="sm" onClick={openCreateAbsence}><Plus className="h-4 w-4"/>Добавить отсутствие</Button>}<div className="flex items-center gap-1"><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month-2,1))} aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4"/></Button><Button variant="outline" size="sm" onClick={()=>setCursor(new Date(today.getFullYear(),today.getMonth(),1))}>Сегодня</Button><Button variant="outline" size="icon" onClick={()=>setCursor(new Date(year,month,1))} aria-label="Следующий месяц"><ChevronRight className="h-4 w-4"/></Button></div></div>}/>
```

- [ ] **Step 6: Render `AbsenceDialog` at the end of `CalendarPage`**

Change the end of `CalendarPage`'s JSX from:

```jsx
      })}
    </div>
  </Page>;
}
```

to:

```jsx
      })}
    </div>
    <AbsenceDialog
      open={absenceOpen}
      item={absenceItem}
      people={people.data}
      canManageAll={canManageAllAbsences}
      currentPersonId={currentPersonId}
      onOpenChange={(next)=>{ setAbsenceOpen(next); if(!next) setAbsenceItem(null); }}
      onSaved={()=>state.reload()}
    />
  </Page>;
}
```

- [ ] **Step 7: Add `ABSENCE_TYPE_OPTIONS` and the `AbsenceDialog` component**

In `src/pages/operations.jsx`, this is still before `function dateKey(date)`. Change the block you just produced in Step 6:

```jsx
    <AbsenceDialog
      open={absenceOpen}
      item={absenceItem}
      people={people.data}
      canManageAll={canManageAllAbsences}
      currentPersonId={currentPersonId}
      onOpenChange={(next)=>{ setAbsenceOpen(next); if(!next) setAbsenceItem(null); }}
      onSaved={()=>state.reload()}
    />
  </Page>;
}
```

to:

```jsx
    <AbsenceDialog
      open={absenceOpen}
      item={absenceItem}
      people={people.data}
      canManageAll={canManageAllAbsences}
      currentPersonId={currentPersonId}
      onOpenChange={(next)=>{ setAbsenceOpen(next); if(!next) setAbsenceItem(null); }}
      onSaved={()=>state.reload()}
    />
  </Page>;
}

const ABSENCE_TYPE_OPTIONS = [
  { value: 'vacation', label: 'Отпуск' },
  { value: 'sick', label: 'Больничный' },
  { value: 'dayoff', label: 'Отгул' },
];

function AbsenceDialog({ open, item, people, canManageAll, currentPersonId, onOpenChange, onSaved }) {
  const eligiblePeople = people.filter((p)=>p.type==='team' && !['dismissed','transferred'].includes(p.status));
  const { isEdit, draft, field, saving, error, save, remove, confirmOpen, setConfirmOpen } = useCrudDialogForm({
    resource: 'vacations', open, item, onOpenChange, onSaved,
    buildDraft: (current) => ({
      type: current?.type || 'vacation',
      personId: current?.personId || (canManageAll ? (eligiblePeople[0]?.id || '') : (currentPersonId || '')),
      startDate: current?.startDate || localTodayKey(),
      endDate: current?.endDate || localTodayKey(),
      note: current?.note || '',
    }),
    validate: (d) => {
      if (!d.personId) return 'Укажите сотрудника';
      if (!d.startDate || !d.endDate) return 'Укажите даты начала и окончания';
      if (d.endDate < d.startDate) return 'Дата окончания раньше даты начала';
      return null;
    },
    buildPayload: (d) => ({ type: d.type, personId: d.personId, startDate: d.startDate, endDate: d.endDate, note: d.note.trim() || null }),
    mapSaveError: (e) => e?.status===403 ? 'Недостаточно прав для изменения' : 'Не удалось сохранить',
  });
  const personName = (id) => people.find((p)=>p.id===id)?.name || 'Сотрудник';
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{isEdit?'Редактировать отсутствие':'Добавить отсутствие'}</DialogTitle><DialogDescription>Отпуска, отгулы и больничные отображаются на общем календаре команды.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div><Label>Тип</Label><Select value={draft.type||'vacation'} onValueChange={(v)=>field('type',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue/></SelectTrigger><SelectContent>{ABSENCE_TYPE_OPTIONS.map((option)=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Сотрудник</Label>{canManageAll ? <Select value={draft.personId||''} onValueChange={(v)=>field('personId',v)}><SelectTrigger className="mt-1.5 w-full"><SelectValue placeholder="Выберите сотрудника"/></SelectTrigger><SelectContent>{eligiblePeople.map((person)=><SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select> : <div className="mt-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">{personName(draft.personId)}</div>}</div>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Начало</Label><Input className="mt-1.5" type="date" value={draft.startDate||''} onChange={(e)=>field('startDate',e.target.value)}/></div><div><Label>Окончание</Label><Input className="mt-1.5" type="date" value={draft.endDate||''} onChange={(e)=>field('endDate',e.target.value)}/></div></div>
      <div><Label>Заметка</Label><Input className="mt-1.5" value={draft.note||''} onChange={(e)=>field('note',e.target.value)} placeholder="Необязательно"/></div>
      {error&&<div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
    </div>
    <DialogFooter className="justify-between"><div>{isEdit&&<Button variant="destructive" onClick={()=>setConfirmOpen(true)} disabled={saving}><Trash2 className="h-4 w-4"/>Удалить</Button>}</div><div className="flex gap-2"><Button variant="outline" onClick={()=>onOpenChange(false)}>Отмена</Button><Button onClick={save} disabled={saving}>{saving?'Сохраняю…':'Сохранить'}</Button></div></DialogFooter>
  </DialogContent>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="Удалить отсутствие?" onConfirm={remove} busy={saving}/>
  </Dialog>;
}
```

Note: the destructive "Удалить" button is shown whenever `isEdit` is true, with no extra permission check inside the dialog — this is safe because (per Task 2) the dialog is only ever opened in edit mode via `openEditAbsence(item)`, which is only called when `canEditAbsence(item)` already returned `true`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test test/calendar-absence-crud.test.js`
Expected: both tests PASS.

- [ ] **Step 9: Start the dev server and manually verify the create garden**

Run: `npm run dev`, open `/calendar` in the browser, logged in as a user whose `vacations` access is at least `own_manage` (check `server/seed.js` / the login screen for available demo accounts — an admin or teamlead account has `all_manage`).
Confirm:
- The "Добавить отсутствие" button appears in the page header.
- Clicking it opens the dialog defaulted to today's date; for an `all_manage` account the "Сотрудник" field is a dropdown, for an `own_manage`-only account it's fixed, read-only text showing your own name.
- Picking each of the three types, filling dates, and saving creates a new bar in the calendar grid for the right date range.
- Leaving the dates such that end < start shows the "Дата окончания раньше даты начала" validation error and blocks save.

- [ ] **Step 10: Commit**

```bash
git add src/pages/operations.jsx test/calendar-absence-crud.test.js
git commit -m "$(cat <<'EOF'
feat: add absence creation to the calendar page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Open the edit dialog when clicking an editable absence bar

**Files:**
- Modify: `src/pages/operations.jsx` (the `barItems` memo inside `CalendarPage`, currently at lines 291-298 of the pre-Task-1 file)
- Test: `test/calendar-absence-crud.test.js` (add a test)

**Interfaces:**
- Consumes: `canEditAbsence(item)` and `openEditAbsence(item)` from Task 1 (already defined inside `CalendarPage`).

- [ ] **Step 1: Write the failing test**

Append to `test/calendar-absence-crud.test.js`:

```js
test('absence bars open the edit dialog when the viewer can manage them, and fall back to the profile link otherwise', () => {
  const operations = read('src/pages/operations.jsx');
  const barItemsSource = operations.slice(operations.indexOf('const barItems=React.useMemo'), operations.indexOf('const weeks=[]'));
  assert.match(barItemsSource, /onClick:\s*canEditAbsence\(item\)\s*\?\s*\(\)\s*=>\s*openEditAbsence\(item\)\s*:\s*\(\)\s*=>\s*navigate/);
});
```

- [ ] **Step 2: Run the tests to verify the new test fails**

Run: `node --test test/calendar-absence-crud.test.js`
Expected: the new test FAILS (the bar's `onClick` still unconditionally navigates).

- [ ] **Step 3: Change the `barItems` memo's `onClick`**

In `src/pages/operations.jsx`, change:

```js
  const barItems=React.useMemo(()=>{
    if(!state.data)return[];
    return (state.data.vacations||[]).filter((item)=>filters[item.type]).map((item)=>({
      ...item,
      title:`${personName(item.personId)} — ${CALENDAR_ABSENCE_LABEL[item.type]}`,
      onClick:()=>navigate(`/people/${encodeURIComponent(item.personId)}`),
    }));
  },[state.data,filters.vacation,filters.sick,filters.dayoff,people.data]);
```

to:

```js
  const barItems=React.useMemo(()=>{
    if(!state.data)return[];
    return (state.data.vacations||[]).filter((item)=>filters[item.type]).map((item)=>({
      ...item,
      title:`${personName(item.personId)} — ${CALENDAR_ABSENCE_LABEL[item.type]}`,
      onClick: canEditAbsence(item) ? ()=>openEditAbsence(item) : ()=>navigate(`/people/${encodeURIComponent(item.personId)}`),
    }));
  },[state.data,filters.vacation,filters.sick,filters.dayoff,people.data,canManageAllAbsences,canManageOwnAbsences,currentPersonId]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/calendar-absence-crud.test.js`
Expected: all three tests PASS.

- [ ] **Step 5: Manually verify the edit/delete garden**

With the dev server still running (`npm run dev`), on `/calendar`:
- As an `all_manage` account: click any existing absence bar (including one belonging to a different person) → the edit dialog opens pre-filled with that entry's type/person/dates/note. Change a field and save → the bar updates in place. Reopen it and click "Удалить" → confirm in the `AlertDialog` → the bar disappears.
- As an `own_manage`-only account: click a bar that belongs to you → edit dialog opens. Click a bar that belongs to someone else → you're navigated to `/people/:id` instead (no dialog).

- [ ] **Step 6: Commit**

```bash
git add src/pages/operations.jsx test/calendar-absence-crud.test.js
git commit -m "$(cat <<'EOF'
feat: open edit dialog when clicking an editable absence in the calendar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
