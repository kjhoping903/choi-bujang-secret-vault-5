// Only engine-verified decision-contract requests belong at this boundary.
// The engine verifies login and the subject/device binding before calling decide.
export const RULE_IDS = Object.freeze(['device_registered', 'notes_read_scope', 'step_up_required']);

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

function inspectDecisionInput(request) {
  const registered = request?.schema === 'aleph.decision.v1'
    && typeof request.subjectId === 'string' && request.subjectId.trim().length > 0
    && typeof request.deviceId === 'string' && /^[a-f0-9]{16}$/u.test(request.deviceId)
    && request.deviceRegistered === true;
  const notesRead = request?.service === 'notes' && request.method === 'GET'
    && ((request.route === 'GET /notes' && request.path === '/notes')
      || (request.route === 'GET /notes/:id' && typeof request.path === 'string'
        && /^\/notes\/[^/?#]+$/u.test(request.path)));
  return { registered, notesRead, connection: inspectConnectionInput(request) };
}

export async function decide(request) {
  const { registered, notesRead, connection } = inspectDecisionInput(request);
  const allowed = registered && notesRead;
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
      : compoundRisk && allowed ? [...RULE_IDS] : ['device_registered', 'notes_read_scope'],
  };
}
