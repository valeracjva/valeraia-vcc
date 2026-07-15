import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WINRM_HEARTBEAT_SCRIPT, SSH_HEARTBEAT_CMD } from './heartbeat.js';

test('script WinRM escribe en la ruta esperada', () => {
  assert.match(WINRM_HEARTBEAT_SCRIPT, /C:\\ProgramData\\Monitoring\\vcc-heartbeat\.txt/);
});

test('comando SSH escribe en la ruta esperada', () => {
  assert.match(SSH_HEARTBEAT_CMD, /\/var\/lib\/monitoring-core\/vcc-heartbeat/);
});
