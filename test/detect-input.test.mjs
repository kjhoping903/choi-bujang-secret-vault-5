import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect, readDetectionEvents } from '../src/detect.mjs';

const events = count => Array.from({ length: count }, (_, index) => ({
  at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(),
  method: 'GET', identity: { sub: 'learner_fixture' },
}));

test('normal and burst fixtures retain only three contract fields without mutation', () => {
  for (const count of [30, 120, 121, 200]) {
    const input = events(count);
    const before = structuredClone(input);
    for (const event of input) {
      for (const field of ['network', 'device', 'region', 'body', 'token', 'name']) {
        Object.defineProperty(event, field, { enumerable: true,
          get() { throw new Error('unexpected_field_read'); } });
      }
      Object.defineProperty(event.identity, 'role', { enumerable: true,
        get() { throw new Error('unexpected_identity_field_read'); } });
    }
    const result = readDetectionEvents(input);
    assert.deepEqual(result, before);
    assert.deepEqual(Object.keys(result[0]).sort(), ['at', 'identity', 'method']);
    assert.deepEqual(Object.keys(result[0].identity), ['sub']);
    assert.notEqual(result[0], input[0]);
    assert.notEqual(result[0].identity, input[0].identity);
    assert.deepEqual(detect(input), count > 120
      ? { action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' }
      : { action: 'observe' });
    assert.equal(input[0].identity.sub, 'learner_fixture');
  }
});

test('rolling window uses only event time and handles unordered boundary events', () => {
  const start = Date.UTC(2026, 9, 1);
  const at = ms => new Date(start + ms).toISOString();
  const event = ms => ({ at: at(ms), method: 'GET', identity: { sub: 'learner_fixture' } });
  const boundary = [event(0), ...Array.from({ length: 120 }, () => event(600000))];
  const before = structuredClone(boundary);
  assert.deepEqual(detect([...boundary].reverse()), {
    action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture',
  });
  assert.deepEqual(boundary, before);
  assert.deepEqual(detect([event(0), ...Array.from({ length: 120 }, () => event(600001))]),
    { action: 'observe' });
  // A burst spanning fixed clock buckets must still be found.
  const shifted = Array.from({ length: 121 }, (_, i) => event(590000 + i * 1000));
  assert.equal(detect([event(0), ...shifted]).reasonCode, 'burst_read');
});

test('non-GET events and different subjects do not contribute to a burst', () => {
  const hundred = events(100);
  assert.deepEqual(detect([...hundred,
    ...events(100).map(event => ({ ...event, identity: { sub: 'other_fixture' } })),
    ...events(200).map(event => ({ ...event, method: 'POST' }))]), { action: 'observe' });
  assert.deepEqual(detect(events(200).map((event, i) => ({ ...event,
    at: new Date(Date.UTC(2026, 9, 1) + i * 7000).toISOString() }))), { action: 'observe' });
});

test('invalid and missing fields fail with a fixed code instead of invented values', () => {
  assert.throws(() => readDetectionEvents(null), { message: 'invalid_detection_events' });
  for (const event of [null, {}, { ...events(1)[0], at: 'invalid' },
    { ...events(1)[0], at: 123 }, { ...events(1)[0], method: undefined },
    { ...events(1)[0], method: 'get' }, { ...events(1)[0], identity: {} },
    { ...events(1)[0], identity: { sub: ' ' } }]) {
    assert.throws(() => detect([event]), { message: 'invalid_detection_event' });
  }
  assert.deepEqual(readDetectionEvents([]), []);
});
