import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

if (!process.argv[2]) throw new Error('Usage: node scripts/check-models.mjs RUNTIME_ROOT [PLUGIN_ENTRY]')
const runtime = resolve(process.argv[2])
const require = createRequire(join(runtime, 'package.json'))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const llm = await load('@deepseek-ai/dsh-llm')
const { DeepSeekAdapter, resolveAdapterOptions } = await load('@deepseek-ai/dsh-llm-deepseek')
const { ContextManager, fingerprint } = await import(process.argv[3] ? pathToFileURL(resolve(process.argv[3])).href : new URL('../src/index.mjs', import.meta.url).href)
const ctx = new Context()
const fibers = []
const requests = []
const originalFetch = globalThis.fetch
let failure = false
// Exercise the real request serializer, stream parser and LlmRuntime with a
// deterministic HTTP boundary. No socket, account token or paid call is used.
globalThis.fetch = async (url, init) => {
  assert.equal(new URL(url).hostname, 'context-fixture.invalid')
  assert(new URL(url).pathname.endsWith('/messages'))
  requests.push({ body: JSON.parse(init.body), headers: new Headers(init.headers) })
  if (failure) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'The fixture model is unavailable.' } }), { status: 400, headers: { 'content-type': 'application/json' } })
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 120, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The earlier investigation verified the input. Continue the latest request.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}

try {
  for (const name of ['session', 'session-projection', 'token-meter', 'llm']) fibers.push(await ctx.plugin((await load(`@deepseek-ai/dsh-${name}`)).default))
  const connection = resolveAdapterOptions({ baseURL: 'https://context-fixture.invalid', models: [{ id: 'future-account-model', contextWindow: 1048576, inputModalities: ['text'] }] })
  const adapter = new DeepSeekAdapter({
    options: () => connection,
    resolveAuth: async () => ({ headers: {} }),
    resolveUserId: () => 'context-model-test',
    prepareExtensions: async () => ({ fields: {}, accept: async () => {} }),
  })
  fibers.push(await ctx.plugin({ name: 'context-model-fixture', inject: ['llm'], apply: context => { context.llm.registerAdapter(['fixture-deepseek'], adapter) } }))
  const manager = new ContextManager(ctx)
  for (const effort of ['off', 'low', 'high', 'max', undefined]) {
    const session = ctx.sessions.create()
    const config = { provider: 'fixture-deepseek', model: 'future-account-model', ...(effort === undefined ? {} : { reasoningEffort: effort }) }
    session.append('request/header', { reason: 'initial', header: { config } })
    session.append('request/context', { provider: config.provider, model: config.model, contextWindow: 1048576 })
    const user = text => session.append('user/message', llm.createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
    user('Verified details and decisions from the previous investigation. '.repeat(180)); user('Latest request')
    const signal = new AbortController().signal
    const agent = { session, options: config, runMaintenance: operation => operation(signal) }
    const view = manager.inspect(agent)
    const before = fingerprint(session)
    const input = { fingerprint: view.fingerprint, choices: { [view.groups.find(group => !group.locked).id]: 'summarize' }, outputs: 'summarize' }
    const plan = await manager.preview(agent, input, signal)
    const request = requests.at(-1)
    assert.equal(request.body.model, config.model)
    assert.equal(request.body.max_tokens, 2048)
    assert.deepEqual(request.body.thinking, { type: effort === 'off' ? 'disabled' : 'enabled' })
    assert.deepEqual(request.body.output_config, effort === 'off' ? undefined : { effort: effort ?? 'high' })
    assert.equal(request.body.tools, undefined)
    assert.equal(request.headers.get('x-deepseek-harness-compact'), '1')
    assert.equal(request.headers.get('x-deepseek-harness-session-id'), session.id)
    assert.match(request.body.system, /untrusted data/)
    assert.equal(request.body.messages.length, 1)
    assert(plan.after < plan.before)
    assert.deepEqual(plan.usage, { calls: 1, reportedCalls: 1, inputTokens: 120, outputTokens: 20 })
    assert.equal(fingerprint(session), before)
    manager.discard(agent, plan.id)
    failure = true
    await assert.rejects(manager.preview(agent, input, signal), /fixture model is unavailable/)
    assert.equal(fingerprint(session), before)
    assert.equal(manager.plans.size, 0)
    failure = false
  }
  assert.equal(requests.length, 10, 'No hidden retries or unexpected network requests')
  console.log(`PASS: DeepSeek adapter ${require('@deepseek-ai/dsh-llm-deepseek/package.json').version}; five reasoning modes, future model ID, tool-free compaction serialization, parsed usage, normalized failures, unchanged history.`)
} finally {
  globalThis.fetch = originalFetch
  for (const fiber of fibers.reverse()) await fiber.dispose()
}
