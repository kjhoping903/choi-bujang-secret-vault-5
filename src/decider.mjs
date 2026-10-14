// Only engine-verified decision-contract requests belong at this boundary.
// The engine verifies login and the subject/device binding before calling decide.
export const RULE_IDS = Object.freeze(['device_registered', 'notes_read_scope', 'resource_read_scope', 'step_up_required']);

// This boundary receives engine requests, never raw HTTP headers. A source label
// alone cannot authenticate a request; judge fixtures remain simulated evidence.
export function inspectConnectionInput(request) {
  const contract = request?.schema === 'aleph.decision.v1';
  const signals = contract ? request.signals : null;
  const source = signals?.source === 'judge_fixture' ? 'judge_fixture'
    : signals?.source === 'none' ? 'none' : 'untrusted';
  const fixture = source === 'judge_fixture';
  const knownText = value => typeof value === 'string' && value.trim().length > 0
    && value !== 'unknown' ? value : null;
  const events = contract ? request.recentEvents : null;
  const validEvents = Array.isArray(events) && events.length <= 12
    && events.every(event => event && typeof event.kind === 'string'
      && event.kind.trim().length > 0
      && Number.isSafeInteger(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isSafeInteger(event.count) && event.count >= 0);
  return {
    source,
    region: fixture ? knownText(signals.region) : null,
    network: fixture ? knownText(signals.network) : null,
    hour: fixture && Number.isInteger(signals.hour)
      && signals.hour >= 0 && signals.hour <= 23 ? signals.hour : null,
    // Empty engine events mean no reported events; missing events stay unknown.
    recentEvents: validEvents ? events.map(({ kind, ageSeconds, count }) =>
      ({ kind, ageSeconds, count })) : null,
  };
}

// Decode only to reject path ambiguities, not to impose a UUID format on IDs.
function matchesItemPath(path, root) {
  if (typeof path !== 'string' || !path.startsWith(`${root}/`)) return false;
  const rawId = path.slice(root.length + 1);
  let id;
  try { id = decodeURIComponent(rawId); } catch { return false; }
  return id.trim().length > 0 && !/[\s/\\?#%]/u.test(id)
    && id !== '.' && id !== '..' && id.toLowerCase() !== 'export';
}

function inspectDecisionInput(request) {
  const registered = request?.schema === 'aleph.decision.v1'
    && typeof request.subjectId === 'string' && request.subjectId.trim().length > 0
    && typeof request.deviceId === 'string' && /^[a-f0-9]{16}$/u.test(request.deviceId)
    && request.deviceRegistered === true;
  const read = request?.method === 'GET' && request.queryLength === 0;
  const notesRead = read && request.service === 'notes'
    && request.route === 'GET /notes/:id' && matchesItemPath(request.path, '/notes');
  const announcementsRead = read && request.service === 'announcements'
    && ((request.route === 'GET /announcements' && request.path === '/announcements')
      || (request.route === 'GET /announcements/:id'
        && matchesItemPath(request.path, '/announcements')));
  // Instructor materials and unknown service/route combinations never allow.
  return { registered, notesRead, resourceRead: notesRead || announcementsRead,
    connection: inspectConnectionInput(request) };
}

export async function decide(request) {
  const { registered, notesRead, resourceRead, connection } = inspectDecisionInput(request);
  const allowed = registered && resourceRead;
  const scopeRules = ['device_registered', notesRead ? 'notes_read_scope' : 'resource_read_scope'];
  // The existing fixture represents a read burst with risk_signal. This is
  // simulated evidence, not measured location or live request telemetry.
  const compoundRisk = connection.source === 'judge_fixture'
    && connection.hour !== null && connection.hour < 6
    && connection.network === 'unusual'
    && connection.recentEvents?.some(event => event.kind === 'risk_signal'
      && event.ageSeconds <= 60 && event.count >= 20) === true;
  // Only the engine can verify reauthentication before passing this contract.
  // Never accept a browser header or an unbounded authentication age here.
  const rechecked = request?.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  const requiresStepUp = allowed && compoundRisk && !rechecked;
  return {
    schema: 'aleph.decision.v1',
    requestId: request?.requestId,
    decision: requiresStepUp ? 'step_up' : allowed ? 'allow' : 'deny',
    // Keep the existing denial code; do not invent an unregistered engine code.
    reasonCode: requiresStepUp ? 'step_up_required' : allowed ? 'approved' : 'device_not_registered',
    ruleIds: !registered ? ['device_registered']
      : compoundRisk && allowed ? [...scopeRules, 'step_up_required'] : scopeRules,
  };
}
