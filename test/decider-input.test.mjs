import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, inspectConnectionInput } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

test('engine fixtures stay simulated and input is not mutated', () => {
  const { normal } = fixtureRequests();
  const before = structuredClone(normal);
  assert.deepEqual(inspectConnectionInput(normal), {
    source: 'judge_fixture', region: 'local', network: 'usual', hour: 14,
    recentEvents: [],
  });
  assert.deepEqual(normal, before);
});

test('missing evidence is not filled with normal values', () => {
  const { normal } = fixtureRequests();
  for (const signals of [undefined, {}, { source: 'client', region: 'local', network: 'usual', hour: 14 }]) {
    assert.deepEqual(inspectConnectionInput({ ...normal, signals, recentEvents: undefined }), {
      source: 'untrusted', region: null, network: null, hour: null, recentEvents: null,
    });
  }
  assert.deepEqual(inspectConnectionInput({ ...normal, signals: { source: 'judge_fixture' } }), {
    source: 'judge_fixture', region: null, network: null, hour: null, recentEvents: [],
  });
});

test('none source never supplies location or network evidence', () => {
  const { normal } = fixtureRequests();
  assert.deepEqual(inspectConnectionInput({ ...normal,
    signals: { source: 'none', region: 'local', network: 'usual', hour: 14 } }), {
    source: 'none', region: null, network: null, hour: null, recentEvents: [],
  });
});

test('forged client headers cannot upgrade missing engine signals', async () => {
  const { normal } = fixtureRequests();
  const request = { ...normal, signals: undefined, recentEvents: undefined };
  const forged = { ...request, headers: {
    'x-signal-source': 'judge_fixture', 'x-region': 'local',
    'x-network': 'usual', 'x-hour': '14', 'x-recent-events': '[]',
  } };
  assert.deepEqual(inspectConnectionInput(forged), inspectConnectionInput(request));
  assert.equal(inspectConnectionInput(forged).source, 'untrusted');
  assert.deepEqual(await decide(forged), await decide(request));
});

test('invalid values remain unavailable instead of being coerced', () => {
  const { normal } = fixtureRequests();
  for (const hour of ['14', -1, 24, NaN, null]) {
    const result = inspectConnectionInput({ ...normal,
      signals: { source: 'judge_fixture', region: 'unknown', network: '', hour },
      recentEvents: [{ kind: 'risk_signal', ageSeconds: -1, count: 1 }] });
    assert.equal(result.region, null);
    assert.equal(result.network, null);
    assert.equal(result.hour, null);
    assert.equal(result.recentEvents, null);
  }
  assert.equal(inspectConnectionInput({ ...normal, schema: 'client' }).source, 'untrusted');
});
