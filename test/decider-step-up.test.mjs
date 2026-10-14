import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('normal allows; compound fixture requires additional verification with a reason', async () => {
  const { normal, suspicious } = fixtureRequests();
  assert.equal((await decide(normal)).decision, 'allow');
  const result = await decide(suspicious);
  assert.equal(result.decision, 'step_up');
  assert.equal(result.reasonCode, 'step_up_required');
  assert.ok(result.ruleIds.includes('step_up_required'));
  assert.equal(result.requestId, suspicious.requestId);
  assert.deepEqual(Object.keys(result).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
});

test('region alone never blocks, and every component of the compound event is needed', async () => {
  const { normal, suspicious } = fixtureRequests();
  const requests = [
    { ...normal, signals: { ...normal.signals, region: 'foreign' } },
    { ...suspicious, signals: { ...suspicious.signals, hour: 14 } },
    { ...suspicious, signals: { ...suspicious.signals, network: 'usual' } },
    { ...suspicious, recentEvents: [] },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 61, count: 20 }] },
    { ...suspicious, recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 19 }] },
  ];
  for (const request of requests) assert.equal((await decide(request)).decision, 'allow');
  assert.equal((await decide({ ...suspicious,
    signals: { ...suspicious.signals, region: 'local' } })).decision, 'step_up');
});

test('device and path restrictions precede additional verification', async () => {
  const { suspicious } = fixtureRequests();
  for (const stepUp of [{ verified: false, authAgeSeconds: null }, { verified: true, authAgeSeconds: 60 }]) {
    const result = await decide({ ...suspicious, deviceRegistered: false, stepUp });
    assert.equal(result.decision, 'deny');
    assert.equal(result.reasonCode, 'device_not_registered');
    assert.deepEqual(result.ruleIds, ['device_registered']);
    assert.equal((await decide({ ...suspicious, method: 'POST', stepUp })).decision, 'deny');
  }
});

test('unavailable sources and forged headers do not create compound evidence', async () => {
  const { suspicious } = fixtureRequests();
  for (const source of ['none', 'client', undefined]) {
    assert.equal((await decide({ ...suspicious,
      signals: { ...suspicious.signals, source },
      headers: { 'x-signal-source': 'judge_fixture' } })).decision, 'allow');
  }
  for (const field of ['hour', 'network']) {
    assert.equal((await decide({ ...suspicious,
      signals: { ...suspicious.signals, [field]: undefined } })).decision, 'allow');
  }
  assert.equal((await decide({ ...suspicious, recentEvents: undefined })).decision, 'allow');
});

test('only a valid fresh engine verification clears compound step up', async () => {
  const { suspicious } = fixtureRequests();
  for (const authAgeSeconds of [0, 60, 900]) {
    assert.equal((await decide({ ...suspicious,
      stepUp: { verified: true, authAgeSeconds } })).decision, 'allow');
  }
  for (const authAgeSeconds of [-1, 901, '60', null, undefined]) {
    assert.equal((await decide({ ...suspicious,
      stepUp: { verified: true, authAgeSeconds } })).decision, 'step_up');
  }
  assert.equal((await decide({ ...suspicious,
    stepUp: { verified: false, authAgeSeconds: 60 } })).decision, 'step_up');
});
