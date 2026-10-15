// Local practice input only. A live engine must verify the event's origin.
// Copy only the three contract fields; never retain the original event objects.
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(event => {
    const at = event?.at;
    const method = event?.method;
    const sub = event?.identity?.sub;
    if (typeof at !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(at)
        || !Number.isFinite(Date.parse(at))
        || typeof method !== 'string' || !/^[A-Z]+$/u.test(method)
        || typeof sub !== 'string' || !sub.trim()) {
      // Fixed error code only; never include the rejected input.
      throw new TypeError('invalid_detection_event');
    }
    return { at, method, identity: { sub } };
  });
}

// Local proposal only; the engine must separately verify and enforce revocation.
export function detect(events) {
  const readsBySubject = new Map();
  for (const { at, method, identity } of readDetectionEvents(events)) {
    if (method !== 'GET') continue;
    const timestamp = Date.parse(at);
    if (!readsBySubject.has(identity.sub)) readsBySubject.set(identity.sub, []);
    readsBySubject.get(identity.sub).push(timestamp);
  }
  for (const [subject, times] of readsBySubject) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      // Include the exact ten-minute boundary; remove only older events.
      while (times[end] - times[start] > 10 * 60 * 1000) start += 1;
      if (end - start + 1 > 120) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }
  return { action: 'observe' };
}
