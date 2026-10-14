import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';
import { fixtureRequests } from '../scripts/fixture-7.mjs';

const input = changes => ({ ...fixtureRequests().normal, ...changes });
const announcement = { service: 'announcements', path: '/announcements/demo',
  route: 'GET /announcements/:id' };

test('only exact note item and announcement read routes allow', async () => {
  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url)));
  assert.deepEqual(config.allowedRoutes, [
    'GET /api/notes/:id', 'GET /api/announcements', 'GET /api/announcements/:id',
  ]);
  for (const changes of [{}, { path: '/notes/fixture-note' }, announcement,
    { ...announcement, path: '/announcements', route: 'GET /announcements' }]) {
    const request = input(changes);
    const response = await decide(request);
    assert.equal(response.decision, 'allow');
    assert.equal(response.requestId, request.requestId);
    assert.deepEqual(Object.keys(response).sort(),
      ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.ok(response.ruleIds.every(rule => RULE_IDS.includes(rule)));
  }
});

test('lists, functions, ambiguous paths, queries and mismatched services deny', async () => {
  const cases = [
    { path: '/notes', route: 'GET /notes' },
    ...['', 'export', '%65xport', 'demo/export', 'demo/', '.', '..', '%2f', '%252f',
      'demo?export=1', 'demo#export', 'demo\\export'].map(id => ({ path: `/notes/${id}` })),
    { queryLength: 8 }, { queryLength: undefined },
    { service: 'unknown' }, { route: 'GET /notes' },
    { ...announcement, service: 'notes' },
    { ...announcement, path: '/announcements/export' },
    { ...announcement, path: '/announcements/demo/edit' },
    { ...announcement, route: 'GET /announcements' },
  ];
  for (const changes of cases) {
    assert.equal((await decide(input(changes))).decision, 'deny', JSON.stringify(changes));
  }
});

test('all writes and all instructor material requests deny even after step up', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const zone of [announcement,
      { ...announcement, path: '/announcements', route: 'GET /announcements' },
      { service: 'instructor-materials', path: '/instructor-materials/demo',
        route: 'GET /instructor-materials/:id' },
      { service: 'instructor-materials', path: '/instructor-materials',
        route: 'GET /instructor-materials' },
      { service: 'notes', path: '/notes/demo', route: 'GET /notes/:id' }]) {
      if (method === 'GET' && zone.service !== 'instructor-materials') continue;
      assert.equal((await decide(input({ ...zone, method,
        route: zone.route.replace('GET', method),
        stepUp: { verified: true, authAgeSeconds: 0 } }))).decision, 'deny');
    }
  }
});

test('announcement reads retain device and compound risk restrictions', async () => {
  assert.equal((await decide(input({ ...announcement, deviceRegistered: false }))).decision, 'deny');
  const { suspicious } = fixtureRequests();
  assert.equal((await decide({ ...suspicious, ...announcement })).decision, 'step_up');
  assert.equal((await decide({ ...suspicious, ...announcement,
    stepUp: { verified: true, authAgeSeconds: 60 } })).decision, 'allow');
});
