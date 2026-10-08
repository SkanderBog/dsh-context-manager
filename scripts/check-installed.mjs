import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'

if (process.argv.length !== 5) throw new Error('Usage: npm run test:installed -- RUNTIME_ROOT PROFILE_ROOT PDF_READER_CHECKOUT')
const [runtime, profile, pdfRoot] = process.argv.slice(2).map(value => resolve(value))
const contextRoot = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(runtime, 'package.json'))
const profileRequire = createRequire(join(profile, 'package.json'))
const load = name => import(pathToFileURL(require.resolve(name)).href)
const installed = name => import(pathToFileURL(profileRequire.resolve(name)).href)
const { Context, Service } = await load('@deepseek-ai/cordis')
const { createUserMessage } = await load('@deepseek-ai/dsh-llm')
const { Session } = await load('@deepseek-ai/dsh-session')
const home = await mkdtemp(join(tmpdir(), 'dsh-plugin-coexist-'))
process.env.DSH_HOME = home
const ctx = new Context()
const fibers = []
let waitForAbort = false, entered, streamedSignal
class TestLlm extends Service {
  constructor(ctx) { super(ctx, 'llm', true) }
  async resolveModelInfo() { return { inputModalities: ['text', 'image'], contextWindow: 131072 } }
  async *stream(options) {
    if (waitForAbort) {
      streamedSignal = options.signal
      entered()
      await new Promise((_, reject) => {
        options.signal.throwIfAborted()
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Prior analysis completed; continue the remaining request.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
// The settings UI, loader inventory and web-runtime carrier are fixture services. All session,
// command, tool, persistence, HTTP registry and plugin implementations are real.
class SettingsFixture extends Service {
  constructor(ctx) { super(ctx, 'settings', true) }
  describe() { return [] }
  configure() { return () => {} }
}
class WebRuntimeFixture extends Service {
  constructor(ctx) { super(ctx, 'webRuntime', true); this.trustedHosts = ['127.0.0.1'] }
}
class LoaderFixture extends Service {
  constructor(ctx) { super(ctx, 'loader', true) }
  entries() { return [] }
  async await() {}
}
async function mount(plugin, config) {
  const fiber = await ctx.plugin(plugin, config)
  fibers.push(fiber)
  return fiber
}
try {
  const { PluginPackages, createRuntimeResolution } = await load('@deepseek-ai/dsh-app-boot')
  await mount(PluginPackages, { resolution: await createRuntimeResolution({
    installAnchor: require.resolve('@deepseek-ai/dsh/package.json'),
    home: dirname(dirname(profile)),
    profile: { name: 'compat', dir: profile, layers: [], patches: [], skippedBundles: [] },
  }) })
  for (const name of ['session', 'session-projection', 'agent', 'tools', 'system-prompt', 'token-meter', 'commands', 'invariants'])
    await mount((await load(`@deepseek-ai/dsh-${name}`)).default)
  await mount(await load('@deepseek-ai/dsh-compaction/invariant'))
  await mount(TestLlm)
  await mount(SettingsFixture)
  await mount(WebRuntimeFixture)
  await mount((await load('@deepseek-ai/dsh-host-webserver')).default, { host: '127.0.0.1', port: 0, compression: 'none' })
  await mount((await load('@deepseek-ai/dsh-fs-local')).LocalFileSystem, { cwd: home })
  await mount((await load('@deepseek-ai/dsh-attachment-local')).LocalAttachmentStore, { dshHome: home })
  await mount((await load('@deepseek-ai/dsh-session-persistence-jsonl')).default, { root: join(home, 'sessions'), compression: 'none' })
  await mount((await load('@deepseek-ai/dsh-agent-loop')).default, {})
  await mount(await installed('dsh-rewind-plugin'), { snapshotDir: join(home, 'snapshots'), dshHome: home, autoCleanupEnabled: false })
  await mount(await installed('dsh-better-sidebar'))
  await mount(LoaderFixture)
  await mount(await installed('dshmarket'), { profile: 'compat', allowRestart: false })
  const contextFiber = await mount(await import(pathToFileURL(join(contextRoot, 'lib/index.mjs')).href))
  const pdfFiber = await mount(await import(pathToFileURL(join(pdfRoot, 'src/index.mjs')).href))
  const agent = await ctx.agentLoop.create('compat-fixture', { provider: 'fixture', model: 'controlled', cwd: home })
  const user = text => agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  const long = 'Verified prior work and exact constraints. '.repeat(250)
  user(long); user(long); const latest = user('Latest user request')
  const signal = () => new AbortController().signal
  const command = async text => (await ctx.commands.execute(agent, text, [], signal())).result
  const context = async args => {
    const result = await command(`/context-manager ${JSON.stringify(args)}`)
    assert.equal(result.kind, 'success', result.text)
    return JSON.parse(result.text)
  }
  const preview = async action => {
    const view = await context({ op: 'inspect' })
    return context({ op: 'preview', fingerprint: view.fingerprint, choices: { [view.groups.find(g => !g.locked).id]: action }, outputs: 'summarize' })
  }
  for (const name of ['rewind', 'undo', 'context-manager']) assert(ctx.commands.find(agent, name))
  for (const name of ['pdf_status', 'pdf_inspect', 'pdf_read', 'pdf_search', 'pdf_render']) assert(ctx.tools.get(name))
  assert(ctx.webServer.match('/sidebar/api/fs.list'))
  assert(ctx.webServer.match('/dsh-market/api/v1/capabilities'))
  const market = await fetch(`http://127.0.0.1:${ctx.webServer.port}/dsh-market/api/v1/capabilities`)
  assert.equal(market.status, 200)
  const stale = await preview('omit')
  assert.equal((await command(`/rewind @${latest.seq} chat`)).kind, 'success')
  const refused = await command(`/context-manager ${JSON.stringify({ op: 'apply', id: stale.id })}`)
  assert.equal(refused.kind, 'error'); assert.match(refused.text, /changed/)
  user('New request after rewind')
  const plan = await preview('summarize')
  assert.equal((await context({ op: 'apply', id: plan.id })).applied, 1)
  await ctx.sessions.flush(agent.session)
  const handle = await ctx.sessionPersistence.open(agent.session.id, 'read')
  const saved = await handle.read(); await handle.close()
  assert.deepEqual(Session.create(agent.session.id, saved.events, agent.session.header).deriveMessages(), agent.session.deriveMessages())
  const checkpoint = agent.session.surface.nodes[0]
  assert.equal((await command('/rewind')).kind, 'success')
  assert(agent.session.surface.nodes.includes(checkpoint), 'Rewind must preserve an earlier compaction checkpoint')
  user('Request for cancellation test')
  const ready = new Promise(resolve => { entered = resolve })
  waitForAbort = true
  const view = await context({ op: 'inspect' })
  const pending = command(`/context-manager ${JSON.stringify({ op: 'preview', fingerprint: view.fingerprint, choices: { [view.groups.find(g => !g.locked).id]: 'summarize' }, outputs: 'summarize' })}`)
  await ready
  assert.equal((await command('/rewind')).kind, 'success')
  assert(streamedSignal.aborted, 'Rewind must promptly cancel the obsolete summary request')
  assert.equal((await pending).kind, 'error')
  assert.equal(agent.status, 'idle')
  const pdf = await ctx.tools.execute({ name: 'pdf_read', arguments: { file_path: join(pdfRoot, 'test/fixtures/research-sample.pdf'), ocr: 'off' }, agent, callId: 'compat-read', signal: signal() })
  assert.equal(pdf.isError, false, JSON.stringify(pdf))
  assert.match(pdf.value.pages[0].text, /ORCHID-739/)
  const image = await ctx.tools.execute({ name: 'pdf_render', arguments: { file_path: join(pdfRoot, 'test/fixtures/research-sample.pdf'), page: 3, pixels: 600 }, agent, callId: 'compat-image', signal: signal() })
  assert.equal(image.isError, false, JSON.stringify(image))
  assert.equal(image.content[1].type, 'image')
  assert(await ctx.attachments.readImage(image.value.image))
  await pdfFiber.dispose(); fibers.pop()
  await contextFiber.dispose(); fibers.pop()
  assert.equal(ctx.tools.get('pdf_read'), undefined)
  assert.equal(ctx.commands.find(agent, 'context-manager'), undefined)
  assert(ctx.commands.find(agent, 'rewind'))
  assert(ctx.webServer.match('/sidebar/api/fs.list'))
  for (const name of ['@deepseek-ai/dsh', 'dsh-rewind-plugin', 'dsh-better-sidebar', 'dshmarket']) {
    const resolver = name.startsWith('@deepseek-ai/') ? require : profileRequire
    const manifest = JSON.parse(await readFile(resolver.resolve(`${name}/package.json`), 'utf8'))
    console.log(`${name}: ${manifest.version}`)
  }
  console.log('PASS: stale-preview rejection, durable compaction, rewind preservation, in-flight cancellation, PDF text/image tools, market capabilities route, isolated disposal.')
} finally {
  for (const fiber of fibers.reverse()) await fiber.dispose()
  await rm(home, { recursive: true, force: true })
}
