import assert from 'node:assert/strict';
import test from 'node:test';
import { __test__ } from '@/lib/scheduler-lite';

test('findFirstSustainedThreshold ignores single-interval spike', () => {
  const curve = [
    { time: 16.0, staffNeeded: 1 },
    { time: 16.5, staffNeeded: 2 }, // single spike
    { time: 17.0, staffNeeded: 1 },
    { time: 17.5, staffNeeded: 2 },
    { time: 18.0, staffNeeded: 2 }, // first sustained pair
  ];

  const point = __test__.findFirstSustainedThreshold(curve, 2, 15.5);
  assert.ok(point);
  assert.equal(point?.time, 18.0);
});

test('findLastSustainedThreshold ignores single-interval tail noise', () => {
  const curve = [
    { time: 20.0, staffNeeded: 2 },
    { time: 20.5, staffNeeded: 2 }, // sustained
    { time: 21.0, staffNeeded: 1 },
    { time: 21.5, staffNeeded: 2 }, // isolated tail spike
  ];

  const point = __test__.findLastSustainedThreshold(curve, 2, 19.5);
  assert.ok(point);
  assert.equal(point?.time, 20.0);
});
