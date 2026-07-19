import test from 'node:test';
import assert from 'node:assert/strict';
import { RISK_COLORS } from '../modules/tabs/inventory.js';

test('RISK_COLORS usa los mismos tokens que .infra-card.risk-* en style.css', () => {
  assert.equal(RISK_COLORS.bajo, 'var(--success)');
  assert.equal(RISK_COLORS.moderado, 'var(--warning)');
  assert.equal(RISK_COLORS.alto, 'var(--risk-alto)');
  assert.equal(RISK_COLORS.critico, 'var(--danger)');
});
