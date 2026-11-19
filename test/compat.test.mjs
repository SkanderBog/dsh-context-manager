import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertHostSurface, assertSessionSurface } from '../src/compat.mjs'

function host(overrides = {}) {
  return {
    commands: { register() {} },
    sessions: { flush() {} },
    tokenMeter: { measure() {}, estimateMessage() {} },
    llm: { stream() {} },
    ...overrides,
  }
}

function session(overrides = {}) {
  return {
    surface: { nodes: [], contentGeneration: 0 },
    deriveEventMessage() {},
    eventAt() {},
    requestHeader() {},
    requestContext() {},
    ...overrides,
  }
}

test('host probe accepts the services this release calls', () => {
  assert.doesNotThrow(() => assertHostSurface(host()))
})

test('host probe names each missing service and method', () => {
  assert.throws(() => assertHostSurface({}), /commands, sessions, tokenMeter, llm/)
  assert.throws(() => assertHostSurface(host({ commands: {} })), /commands\.register/)
  assert.throws(() => assertHostSurface(host({ tokenMeter: { measure() {} } })), /tokenMeter\.estimateMessage/)
  assert.throws(() => assertHostSurface(host({ sessions: undefined })), /DSH_CONTEXT_INCOMPATIBLE_HOST/)
})

test('session probe accepts the session surface this release reads', () => {
  assert.doesNotThrow(() => assertSessionSurface(session()))
})

test('session probe names a changed session shape instead of throwing a TypeError', () => {
  assert.throws(() => assertSessionSurface({}), /session\.deriveEventMessage/)
  assert.throws(() => assertSessionSurface(session({ surface: { nodes: [] } })), /session\.surface\.contentGeneration/)
  assert.throws(() => assertSessionSurface(session({ eventAt: undefined })), /session\.eventAt/)
})
