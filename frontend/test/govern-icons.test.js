import test from 'node:test';
import assert from 'node:assert/strict';
import { GOVERN_SCRIPTS } from '../modules/tabs/govern.js';

test('todos los iconos de Gobernanza son glifos geométricos monocromáticos, ningún emoji a color', () => {
  // Emojis a color caen en el rango Misc Symbols and Pictographs (U+1F300–U+1FAFF) u
  // otros bloques de emoji Unicode — los glifos geométricos usados hoy (⬡⚙◈⇅◼▦↻) son
  // todos BMP (código < U+10000).
  for (const s of GOVERN_SCRIPTS) {
    const codePoint = s.icon.codePointAt(0);
    assert.ok(
      codePoint < 0x1F000,
      `${s.id} usa un ícono fuera del rango de glifos geométricos: ${s.icon} (U+${codePoint.toString(16).toUpperCase()})`
    );
  }
});

test('los 7 scripts de Gobernanza tienen los iconos esperados', () => {
  const icons = Object.fromEntries(GOVERN_SCRIPTS.map(s => [s.id, s.icon]));
  assert.deepEqual(icons, {
    'workspace-health':    '⬡',
    'compile-agents':      '⚙',
    'web-context':         '◈',
    'sync-status':         '⇅',
    'cierre':              '◼',
    'knowledge-organizer': '▦',
    'daily-maintenance':   '↻',
  });
});
