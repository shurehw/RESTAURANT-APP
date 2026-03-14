import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ } from '@/lib/scheduler-lite';

const makeTemplate = (label: string, start: string, end: string, hours: number, fixedCount?: number) => ({
  label,
  type: 'dinner' as const,
  start,
  end,
  hours,
  fixedCount,
});

test('distributeWaves keeps 2-wave allocation within peakStaff with bounded minima', () => {
  const templates = [
    makeTemplate('early', '16:00', '22:00', 6),
    makeTemplate('late', '18:00', '00:00', 6),
  ];
  const waves = __test__.distributeWaves(3, templates, false, 0.8, 2, 2);
  const total = waves.reduce((sum, wave) => sum + wave.count, 0);

  assert.equal(total, 3);
  assert.equal(waves.length, 2);
  assert.ok(waves[0].count >= 1);
  assert.ok(waves[1].count >= 1);
});

test('distributeWaves keeps 3-wave allocation sum stable and preserves main coverage', () => {
  const templates = [
    makeTemplate('opener', '15:00', '21:00', 6),
    makeTemplate('mid', '17:00', '23:00', 6),
    makeTemplate('closer', '19:00', '01:00', 6),
  ];
  const waves = __test__.distributeWaves(5, templates, false, 0.7, 1, 1);
  const total = waves.reduce((sum, wave) => sum + wave.count, 0);
  const mid = waves.find((w) => w.template.label === 'mid');

  assert.equal(total, 5);
  assert.ok(mid);
  assert.ok((mid?.count || 0) >= 1);
});

test('distributeWaves respects opener floor while conserving two-wave total', () => {
  const templates = [
    makeTemplate('prep', '11:00', '17:00', 6),
    makeTemplate('main', '16:00', '22:00', 6),
  ];
  const waves = __test__.distributeWaves(4, templates, false, 0.4, 2, 1);
  const prep = waves.find((w) => w.template.label === 'prep');
  const main = waves.find((w) => w.template.label === 'main');
  const total = waves.reduce((sum, wave) => sum + wave.count, 0);

  assert.equal(prep?.count, 2);
  assert.equal(main?.count, 2);
  assert.equal(total, 4);
});

test('distributeWaves conserves total for 3-wave split under aggressive opener fraction', () => {
  const templates = [
    makeTemplate('prep-am', '10:00', '14:00', 4),
    makeTemplate('service-main', '16:00', '23:00', 7),
    makeTemplate('closer', '18:00', '01:00', 7),
  ];
  const waves = __test__.distributeWaves(6, templates, false, 0.5, 2, 1);
  const fixed = waves.find((w) => w.template.label === 'prep-am');
  const main = waves.find((w) => w.template.label === 'service-main');
  const closer = waves.find((w) => w.template.label === 'closer');
  const total = waves.reduce((sum, wave) => sum + wave.count, 0);

  assert.equal(fixed?.count, 3);
  assert.ok((main?.count || 0) >= 1);
  assert.ok((closer?.count || 0) >= 1);
  assert.equal(total, 6);
});
