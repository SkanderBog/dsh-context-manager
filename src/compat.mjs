/** Host and session surfaces this release depends on, checked before use. */

const SERVICES = {
  commands: ['register'],
  sessions: ['flush'],
  tokenMeter: ['measure', 'estimateMessage'],
  llm: ['stream'],
}

const SESSION_METHODS = ['deriveEventMessage', 'eventAt', 'requestHeader', 'requestContext']

function absentMethods(value, methods) {
  return methods.filter(method => typeof value?.[method] !== 'function')
}

/**
 * Reject a host whose injected services lack the methods this release calls.
 * @param ctx - the Cordis context handed to apply().
 */
export function assertHostSurface(ctx) {
  const absent = []
  for (const [service, methods] of Object.entries(SERVICES)) {
    const handle = ctx?.[service]
    if (handle === undefined || handle === null) {
      absent.push(service)
      continue
    }
    for (const method of absentMethods(handle, methods)) absent.push(`${service}.${method}`)
  }
  if (absent.length > 0) throw new Error(`DSH_CONTEXT_INCOMPATIBLE_HOST: this Context Manager release needs ${absent.join(', ')}. The running Harness does not expose them; install a Harness version with the supported plugin API or an older Context Manager release.`)
}

/**
 * Reject a session whose internal shape no longer matches the release.
 * @param session - the conversation session being inspected or compacted.
 */
export function assertSessionSurface(session) {
  const absent = absentMethods(session, SESSION_METHODS).map(method => `session.${method}`)
  if (!Array.isArray(session?.surface?.nodes)) absent.push('session.surface.nodes')
  if (typeof session?.surface?.contentGeneration !== 'number') absent.push('session.surface.contentGeneration')
  if (absent.length > 0) throw new Error(`DSH_CONTEXT_INCOMPATIBLE_HOST: this Context Manager release needs ${absent.join(', ')}. The running Harness changed its session API; install a Context Manager release built for it.`)
}
