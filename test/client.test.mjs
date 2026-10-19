import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import vm from 'node:vm'

// Override only for an existing local development runtime; CI uses devDependencies.
const require = createRequire(process.env.DSH_UI_RUNTIME ? join(process.env.DSH_UI_RUNTIME, 'package.json') : import.meta.url)
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
globalThis.IS_REACT_ACT_ENVIRONMENT = true

test('Context panel requires a reviewed preview, consumes failed apply, and refreshes successful apply', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', { url: 'http://localhost' })
  const saved = new Map()
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent']) { saved.set(name, globalThis[name]); globalThis[name] = dom.window[name] }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const components = new Map(), cleanups = [], commands = []
  const timers = new Map()
  let nextTimer = 0
  let plugin, decoration
  vm.runInNewContext(await readFile(process.env.DSH_CONTEXT_CLIENT_ENTRY ?? new URL('../src/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: entry => { plugin = entry.factory(require) } } },
    document: dom.window.document, Intl, AbortController, Map, JSON, Math,
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer },
    clearTimeout: id => timers.delete(id),
  })
  assert(plugin.inject.includes('remote') && plugin.inject.includes('remote.commands'), 'Cordis requires both the root remote and commands namespace')
  const snapshot = { fingerprint: 'before', totalTokens: 1600, contextWindow: 10000, percent: 16, breakdown: { user: 700, answers: 800, thinking: 100 }, groups: [
    { id: '1', seqs: [1], tokens: 800, excerpt: 'Older request', locked: false },
    { id: '2', seqs: [2], tokens: 800, excerpt: 'Latest request', locked: true, latest: true },
  ] }
  let failApply = true
  let delayPreview = false, resolvePreview
  const ctx = {
    remote: { commands: { async execute(_id, line) {
      const request = JSON.parse(line.slice('/context-manager '.length)); commands.push(request)
      let value = {}
      if (request.op === 'inspect') value = snapshot
      if (request.op === 'preview') {
        value = { id: 'reviewed-plan', expires: Date.now() + 600000, before: 1600, after: 1000, replacements: [{ seqs: [1], before: 800, after: 200, action: 'omit', summary: 'Exact preview checkpoint' }] }
        if (delayPreview) await new Promise(resolve => { resolvePreview = resolve })
      }
      if (request.op === 'apply' && failApply) return { ok: true, value: { result: { kind: 'error', text: 'The conversation changed after preview.' } } }
      if (request.op === 'apply') { snapshot.totalTokens = 1000; snapshot.percent = 10; value = { before: 1600, after: 1000, message: 'Context updated. Original messages remain.' } }
      return { ok: true, value: { result: { kind: 'success', text: JSON.stringify({ contextManager: 1, op: request.op, ...value }) } } }
    } } },
    slots: { inject(_name, callback) { return callback() }, register(entry, component) { components.set(entry.name, component); return () => components.delete(entry.name) } },
    commandUi: { decorate(value) { decoration = value; return () => {} } },
    effect(generator) { for (const cleanup of generator()) cleanups.push(cleanup) },
  }
  plugin.apply(ctx)
  const root = createRoot(document.querySelector('main'))
  t.after(async () => { await act(async () => root.unmount()); for (const cleanup of cleanups.reverse()) cleanup(); dom.window.close(); for (const [key, value] of saved) globalThis[key] = value })
  const Header = components.get('conversation.session.header.actions')
  await act(async () => root.render(React.createElement(Header, { sessionId: 'demo', useProjection: () => ({ pressureTokens: 1600, contextWindow: 10000 }) })))
  assert.match(document.querySelector('button').textContent, /Context.*16%/)
  const click = async text => { const b = [...document.querySelectorAll('button')].find(b => b.textContent === text); assert(b, text); await act(async () => b.click()) }
  await act(async () => document.querySelector('button').click())
  assert.match(document.body.textContent, /1,600 tokens/)
  assert(document.querySelector('select[aria-label="Action for history 2"]').disabled)
  const select = document.querySelector('select[aria-label="Action for history 1"]')
  await click('Summarize older groups')
  assert.match(document.querySelector('footer').textContent, /~800 tokens before replacement/)
  assert.match(document.querySelector('footer').textContent, /may incur normal usage/)
  assert.equal(select.value, 'summarize', 'The only eligible older exchange must be selected')
  assert.equal(document.querySelector('select[aria-label="Action for history 2"]').value, 'keep', 'The latest exchange stays protected')
  await click('Keep all')
  assert.equal(select.value, 'keep')
  await act(async () => { select.value = 'omit'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  assert.match(document.querySelector('footer').textContent, /Omission-only previews do not call the model/)
  await click('Generate preview')
  assert.equal(commands.find(c => c.op === 'preview').choices['1'], 'omit')
  assert.match(document.querySelector('.dcm-summary').textContent, /Exact preview checkpoint/)
  const applyButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Apply preview')
  const generateButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Generate preview')
  assert.equal(document.activeElement, document.querySelector('input[type="checkbox"]'), 'The new preview moves focus to review confirmation')
  assert(generateButton().disabled, 'Do not repeat a paid request while its preview is available')
  await click('Generate preview')
  assert.equal(commands.filter(c => c.op === 'preview').length, 1)
  await click('Discard preview')
  assert(!generateButton().disabled)
  assert.equal(document.querySelector('.dcm-summary'), null)
  assert(commands.some(c => c.op === 'discard' && c.id === 'reviewed-plan'))
  await click('Generate preview')
  assert.equal(timers.size, 1, 'Discarding a plan clears its expiry timer')
  await act(async () => { const [id, expire] = timers.entries().next().value; timers.delete(id); expire() })
  assert.match(document.body.textContent, /Preview expired/)
  assert(applyButton().disabled)
  assert(!generateButton().disabled)
  await click('Generate preview')
  assert(applyButton().disabled)
  await act(async () => document.querySelector('input[type="checkbox"]').click())
  assert(!applyButton().disabled)
  await click('Apply preview')
  assert.match(document.querySelector('[role="alert"]').textContent, /changed after preview/)
  assert(applyButton().disabled, 'An uncertain/failed apply cannot reuse the old preview')
  await click('Generate preview')
  await act(async () => document.querySelector('input[type="checkbox"]').click())
  failApply = false
  await click('Apply preview')
  assert.match(document.body.textContent, /Original messages remain/)
  assert.match(document.body.textContent, /1,000 tokens/)
  assert.equal(commands.filter(c => c.op === 'apply').length, 2)
  await click('Summarize older groups')
  delayPreview = true
  await click('Generate preview')
  await click('Cancel operation')
  await act(async () => resolvePreview())
  assert.equal(document.querySelector('.dcm-summary'), null, 'A late response must not revive a cancelled preview')
  assert.match(document.querySelector('[role="alert"]').textContent, /Operation cancelled/)
  assert(applyButton().disabled)
  assert.equal(timers.size, 0)
  await click('Close')
  assert.equal(document.querySelector('dialog'), null)

  const props = { sessionId: 'demo', useProjection: () => null }
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(Header, { ...props, key: 'main' }),
    React.createElement(Header, { ...props, key: 'second-view' }))))
  await act(async () => decoration.ui.run({ sessionId: 'demo' }))
  assert.equal(document.querySelectorAll('dialog').length, 1, 'A command opens only one view')
  await click('Close')
  await act(async () => root.render(React.createElement(React.Fragment, null,
    React.createElement(Header, { ...props, key: 'main' }))))
  assert(decoration.available({ sessionId: 'demo' }), 'Unmounting a second view must not disable the remaining view')
  await act(async () => decoration.ui.run({ sessionId: 'demo' }))
  assert.equal(document.querySelectorAll('dialog').length, 1)
  await click('Close')
  await act(async () => root.render(null))
  assert.equal(decoration.available({ sessionId: 'demo' }), false)
})

test('panel separates usage, reads ACP and originals on demand, and invalidates previews when notes change', async t => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main></main></body></html>', { url: 'http://localhost' })
  const saved = new Map()
  for (const name of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent']) { saved.set(name, globalThis[name]); globalThis[name] = dom.window[name] }
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  let plugin
  const components = new Map(), cleanups = [], calls = []
  vm.runInNewContext(await readFile(process.env.DSH_CONTEXT_CLIENT_ENTRY ?? new URL('../src/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: entry => { plugin = entry.factory(require) } } },
    document, Intl, AbortController, Map, JSON, Math, setTimeout, clearTimeout,
  })
  const snapshot = { fingerprint: 'before', totalTokens: 9000, percent: 90, contextWindow: 10000, breakdown: { thinking: 100 }, acpAvailable: true,
    accounting: { lastRequest: { inputTokens: 1500, outputTokens: 200, provider: 'test', model: 'fixture' } },
    groups: [{ id: '1', seqs: [1, 2], tokens: 8000, excerpt: 'Prior investigation', hasReasoning: true, locked: false, notes: [{ kind: 'decision', text: 'Existing choice', sourceSeq: 0 }] }, { id: '9', seqs: [9], tokens: 1000, excerpt: 'Latest', locked: true }] }
  const ctx = {
    slots: { inject(_name, callback) { return callback() }, register(entry, component) { components.set(entry.name, component); return () => {} } },
    commandUi: { decorate() { return () => {} } },
    effect(generator) { for (const cleanup of generator()) cleanups.push(cleanup) },
    remote: { commands: { async execute(sid, line) {
      assert.equal(sid, 'demo')
      const payload = JSON.parse(line.slice('/context-manager '.length)); calls.push(payload)
      let result
      if (payload.op === 'inspect') result = snapshot
      if (payload.op === 'acp-status') result = { text: 'Effective context: 1,400 tokens', source: 'acp_status' }
      if (payload.op === 'history') result = { records: [{ seq: 20, origin: 'Context Manager', state: 'active', originalCount: 6, provider: 'test', model: 'fixture', text: 'Saved checkpoint', usage: null }], nextCursor: null }
      if (payload.op === 'originals') result = { recordSeq: 20, messages: [{ seq: payload.offset ? 6 : 1, role: 'user', text: 'Original visible message', truncated: true }], total: 6, nextOffset: payload.offset ? null : 5 }
      if (payload.op === 'preview') result = { id: 'notes-preview', expires: Date.now() + 600000, before: 9000, after: 3000, usage: { calls: 1, reportedCalls: 1, inputTokens: 300, outputTokens: 50 }, replacements: [{ seqs: [1, 2], action: 'summarize', before: 8000, after: 2000, summary: JSON.stringify(payload.notes) }] }
      return { ok: true, value: { result: { kind: 'success', text: JSON.stringify(result ?? {}) } } }
    } } },
  }
  plugin.apply(ctx)
  const root = createRoot(document.querySelector('main'))
  t.after(async () => { await act(async () => root.unmount()); for (const cleanup of cleanups.reverse()) cleanup(); dom.window.close(); for (const [name, value] of saved) globalThis[name] = value })
  const Header = components.get('conversation.session.header.actions')
  await act(async () => root.render(React.createElement(Header, { sessionId: 'demo', useProjection: () => null })))
  const click = async label => { const button = [...document.querySelectorAll('button')].find(button => button.textContent === label); assert(button, label); await act(async () => button.click()) }
  await click('Context')
  assert.match(document.body.textContent, /Local context: ~9,000/)
  assert.match(document.body.textContent, /1,500 input \+ 200 output/)
  assert.equal(calls.length, 1, 'Opening the panel never invokes an external tool')
  await click('Read ACP status')
  assert.match(document.body.textContent, /Effective context: 1,400/)
  assert.match(document.body.textContent, /Local context: ~9,000/, 'ACP does not overwrite the host estimate')
  await click('Load compression history')
  await click('View originals for record 20')
  assert.match(document.querySelector('[aria-label="Original messages"]').textContent, /Original visible message/)
  assert.match(document.body.textContent, /Message display truncated/)
  await click('Next originals')
  assert.equal(calls.at(-1).offset, 5)
  await click('Summarize older groups')
  const textarea = document.querySelector('textarea[aria-label="Decision for history 1"]')
  assert(textarea)
  const change = async text => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  await change('Keep the bounded cache')
  await click('Generate preview')
  assert.equal(calls.find(call => call.op === 'preview').notes['1'].decision, 'Keep the bounded cache')
  assert.match(document.querySelector('[aria-label="Compaction preview"]').textContent, /300 input \+ 50 output/)
  await change('Keep the revised bounded cache')
  assert.equal(document.querySelector('[aria-label="Compaction preview"]'), null)
  assert(calls.some(call => call.op === 'discard'))
  await click('Refresh')
  assert.equal(document.querySelector('[aria-label="Original messages"]'), null)
  assert(!document.body.textContent.includes('Effective context: 1,400'))
})
