import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyActivityEvent, createActivityState } from '../modules/core/activity-rail.js';

test('job-started crea una card running con el script', () => {
  const state = applyActivityEvent(createActivityState(), {
    type: 'job-started',
    jobId: 'ws-1',
    script: 'compile-agents',
  });

  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].jobId, 'ws-1');
  assert.equal(state.jobs[0].script, 'compile-agents');
  assert.equal(state.jobs[0].status, 'running');
});

test('output acumula lineas y deja preview acotado', () => {
  const started = applyActivityEvent(createActivityState(), {
    type: 'job-started',
    jobId: 'ws-1',
    script: 'compile-agents',
  });
  const updated = applyActivityEvent(started, {
    type: 'output',
    jobId: 'ws-1',
    data: 'uno\ndos\ntres\ncuatro\ncinco\n',
  });

  assert.equal(updated.jobs[0].lineCount, 5);
  assert.deepEqual(updated.jobs[0].preview, ['dos', 'tres', 'cuatro', 'cinco']);
  assert.equal(updated.jobs[0].message, 'cinco');
});

test('done con exitCode 0 marca success', () => {
  const started = applyActivityEvent(createActivityState(), {
    type: 'job-started',
    jobId: 'ws-1',
    script: 'compile-agents',
  });
  const finished = applyActivityEvent(started, {
    type: 'done',
    jobId: 'ws-1',
    exitCode: 0,
  });

  assert.equal(finished.jobs[0].status, 'success');
  assert.equal(finished.jobs[0].message, 'completado');
});

test('error marca la card como error y conserva el job', () => {
  const started = applyActivityEvent(createActivityState(), {
    type: 'job-started',
    jobId: 'ws-1',
    script: 'compile-agents',
  });
  const failed = applyActivityEvent(started, {
    type: 'error',
    jobId: 'ws-1',
    message: 'timeout remoto',
  });

  assert.equal(failed.jobs[0].status, 'error');
  assert.equal(failed.jobs[0].message, 'timeout remoto');
});

test('note permite eventos manuales no ligados a scripts', () => {
  const state = applyActivityEvent(createActivityState(), {
    type: 'note',
    entryId: 'ssl-refresh-1',
    title: 'SSL / Dominios',
    category: 'refresh',
    status: 'success',
    message: 'verificación completada',
    details: ['25 dominios', '2 críticos'],
  });

  assert.equal(state.jobs[0].kind, 'note');
  assert.equal(state.jobs[0].script, 'SSL / Dominios');
  assert.equal(state.jobs[0].category, 'refresh');
  assert.equal(state.jobs[0].status, 'success');
  assert.deepEqual(state.jobs[0].preview, ['25 dominios', '2 críticos']);
});
