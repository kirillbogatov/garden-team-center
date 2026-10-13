import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell = fs.readFileSync(new URL('../src/components/app-shell.jsx', import.meta.url), 'utf8');

test('sidebar search opens the global command palette', () => {
  assert.match(shell, /aria-label="Открыть поиск по всему сервису"/);
  assert.match(shell, /<span className="min-w-0 flex-1 truncate text-\[13px\]">Поиск<\/span>/);
  assert.ok(shell.includes('setSearchPaletteOpen(true)'));
  assert.ok(shell.includes('<SearchPalette open={searchPaletteOpen}'));
  assert.doesNotMatch(shell, /navigate\(value\?`\/search\?q=/);
  assert.doesNotMatch(shell, /menuSearchItems/);
});

test('notification and settings actions live in the profile menu, not the sidebar header', () => {
  const header = shell.slice(shell.indexOf("{!mobile && <div"), shell.indexOf("<ScrollArea", shell.indexOf("{!mobile && <div")));
  assert.doesNotMatch(header, /Уведомления/);
  assert.doesNotMatch(header, /Настройки/);
  assert.ok(shell.includes("navigate('/notifications')"));
  assert.ok(shell.includes("navigate('/settings')"));
});

test('collapsed footer keeps profile avatar without notification button', () => {
  const footerStart = shell.indexOf("<div className={cn('shrink-0 border-t'");
  const triggerEnd = shell.indexOf('</DropdownMenuTrigger>', footerStart);
  const trigger = shell.slice(footerStart, triggerEnd);
  assert.match(trigger, /<Avatar person={profilePerson}/);
  assert.doesNotMatch(trigger, /<Bell/);
});
