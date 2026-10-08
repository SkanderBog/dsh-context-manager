/* Harness browser entry: platform modules are supplied by the host module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-context-manager',
  factory: require => {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef } = React
    const format = value => new Intl.NumberFormat().format(Math.round(value))
    const labels = { instructions: 'System / developer instructions', harnessContext: 'Harness instructions / runtime context', user: 'User messages', answers: 'Assistant answers', thinking: 'Stored reasoning', toolOutputs: 'Tool / file outputs', toolCalls: 'Tool calls', attachments: 'Attachment references', toolDefinitions: 'Tool definitions', other: 'Other content' }
    const CSS = `
      .dcm-open{font:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border,#7775);border-radius:8px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap}
      .dcm{color:var(--foreground,#e6e8ec);background:var(--background,#1c1d21);border:1px solid #8885;border-radius:16px;padding:0;width:min(1040px,94vw);max-height:90vh;box-shadow:0 20px 90px #0008;font:14px/1.5 system-ui,sans-serif;color-scheme:light dark}
      .dcm::backdrop{background:#0008}.dcm *{box-sizing:border-box}.dcm header,.dcm footer{padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #8883}.dcm footer{border-top:1px solid #8883;border-bottom:0;flex-wrap:wrap}.dcm h2{font-size:20px;margin:0}.dcm h3{font-size:15px;margin:0 0 8px}.dcm p{margin:7px 0}.dcm-body{overflow:auto;max-height:65vh;padding:18px 22px}.dcm-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dcm-muted{opacity:.75;font-size:12px}.dcm button,.dcm select{font:inherit;color:inherit;background:transparent;border:1px solid #8886;border-radius:7px;padding:7px 11px;cursor:pointer}.dcm select{background:var(--background,#1c1d21)}.dcm button:disabled,.dcm select:disabled{opacity:.45;cursor:default}.dcm button:focus-visible,.dcm select:focus-visible{outline:2px solid #7da2ff;outline-offset:2px}.dcm button.dcm-primary{background:#345cda;color:white;border-color:#345cda}.dcm-error{border:1px solid #df7272;background:#cc44441c;padding:10px;border-radius:8px;margin-bottom:12px}.dcm-success{border:1px solid #55a87d;padding:10px;border-radius:8px;margin-bottom:12px}.dcm-meter{height:7px;background:#8883;border-radius:9px;overflow:hidden;margin:9px 0 16px}.dcm-meter span{display:block;background:#6b95ff;height:100%}.dcm-breakdown{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 20px}.dcm-stat{border:1px solid #8883;border-radius:8px;padding:8px 10px}.dcm-stat strong{display:block;font-size:17px;font-variant-numeric:tabular-nums}.dcm-controls{padding:12px;border:1px solid #8883;border-radius:9px;margin:12px 0}.dcm-groups{display:flex;flex-direction:column;gap:8px}.dcm-group{display:grid;grid-template-columns:1fr auto;gap:12px;border:1px solid #8883;border-radius:9px;padding:11px}.dcm-group p{white-space:pre-wrap;overflow-wrap:anywhere;max-height:90px;overflow:auto;font-size:12px;margin-bottom:0}.dcm-tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:5px;background:#8882;margin-left:7px}.dcm-summary{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 ui-monospace,monospace;max-height:260px;overflow:auto;border:1px solid #8884;border-radius:8px;padding:12px}.dcm-preview{margin-bottom:16px}.dcm-check{display:flex;gap:8px;align-items:center}.dcm-check input{width:17px;height:17px}.dcm-page{margin:12px 0}.dcm .dcm-danger{color:#e68787}@media(max-width:650px){.dcm-breakdown{grid-template-columns:repeat(2,1fr)}.dcm header,.dcm footer,.dcm-body{padding:12px}.dcm-group{grid-template-columns:1fr}.dcm-body{max-height:60vh}}
    `

    function ContextPanel({ ctx, sessionId, close, updateMeter }) {
      const dialog = useRef(null)
      const abort = useRef(null)
      const mounted = useRef(true)
      const currentPlan = useRef(null)
      const [snapshot, setSnapshot] = useState(null)
      const [choices, setChoices] = useState({})
      const [outputs, setOutputs] = useState('summarize')
      const [plan, setPlan] = useState(null)
      const [reviewed, setReviewed] = useState(false)
      const [busy, setBusy] = useState('Loading context…')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [page, setPage] = useState(0)
      const request = async (payload, signal) => {
        const response = await ctx.remote.commands.execute(sessionId, `/context-manager ${JSON.stringify(payload)}`, [], signal)
        if (!response.ok) throw new Error(response.error?.message ?? 'Connection failed. Refresh before retrying.')
        const result = response.value?.result
        if (!result) throw new Error('The context manager is not available on this host.')
        if (result.kind !== 'success') throw new Error(result.text ?? 'Operation failed.')
        return JSON.parse(result.text)
      }
      const run = async (label, task) => {
        if (abort.current) return
        const controller = new AbortController()
        abort.current = controller
        setBusy(label); setError('')
        try { await task(controller.signal) } catch (e) {
          if (mounted.current) setError(controller.signal.aborted ? 'Operation cancelled. Refresh before applying another preview.' : e.message)
        } finally { abort.current = null; if (mounted.current) setBusy('') }
      }
      const invalidate = () => {
        const previous = currentPlan.current
        currentPlan.current = null; setPlan(null); setReviewed(false)
        if (previous) void request({ op: 'discard', id: previous.id }).catch(() => {})
      }
      const refresh = signal => request({ op: 'inspect' }, signal).then(value => {
        if (!mounted.current) return
        invalidate(); setSnapshot(value); setChoices({}); setPage(0); updateMeter(value.percent)
      })
      useEffect(() => {
        mounted.current = true
        const previouslyFocused = document.activeElement
        dialog.current.showModal()
        void run('Loading context…', refresh)
        return () => {
          mounted.current = false; abort.current?.abort()
          const previous = currentPlan.current
          if (previous) void request({ op: 'discard', id: previous.id }).catch(() => {})
          if (previouslyFocused?.isConnected) previouslyFocused.focus()
        }
      }, [])
      const choose = (id, action) => { invalidate(); setChoices(values => ({ ...values, [id]: action })); setNotice('') }
      const selectOlder = () => {
        invalidate(); setNotice('')
        const eligible = snapshot.groups.filter(g => !g.locked)
        setChoices(Object.fromEntries(eligible.map(g => [g.id, 'summarize'])))
      }
      const preview = () => run('Preparing summary preview…', async signal => {
        invalidate(); setNotice('')
        const value = await request({ op: 'preview', fingerprint: snapshot.fingerprint, choices, outputs }, signal)
        if (mounted.current) { currentPlan.current = value; setPlan(value); setReviewed(false) }
        else void request({ op: 'discard', id: value.id }).catch(() => {})
      })
      const apply = () => run('Applying and saving context…', async signal => {
        const id = currentPlan.current?.id
        if (!id) throw new Error('Generate a new preview first.')
        // Consume the local preview even when a transport error leaves the outcome uncertain.
        currentPlan.current = null; setPlan(null); setReviewed(false)
        const value = await request({ op: 'apply', id }, signal)
        if (mounted.current) { setNotice(value.message); await refresh(signal) }
      })
      const selected = Object.values(choices).filter(v => v !== 'keep').length
      const rows = snapshot?.groups.slice(page * 30, (page + 1) * 30) ?? []
      return createPortal(h('dialog', { ref: dialog, className: 'dcm', 'aria-labelledby': 'dcm-title', onCancel: event => { event.preventDefault(); if (!busy.startsWith('Applying')) close() } },
        h('header', null, h('div', null, h('h2', { id: 'dcm-title' }, 'Context manager'), h('div', { className: 'dcm-muted' }, 'Choose what the model carries into its next reply.')), h('button', { onClick: close, disabled: busy.startsWith('Applying'), 'aria-label': 'Close context manager' }, 'Close')),
        h('div', { className: 'dcm-body', 'aria-busy': !!busy },
          error && h('div', { className: 'dcm-error', role: 'alert' }, error),
          notice && h('div', { className: 'dcm-success', role: 'status' }, notice),
          busy && h('p', { role: 'status' }, busy),
          snapshot && h(React.Fragment, null,
            h('div', { className: 'dcm-row' }, h('strong', null, `~${format(snapshot.totalTokens)} tokens`), h('span', null, snapshot.contextWindow ? `of ${format(snapshot.contextWindow)} · ${snapshot.percent}% used` : 'Context limit not reported by this model'), h('button', { disabled: !!busy, onClick: () => run('Refreshing context…', refresh) }, 'Refresh')),
            h('div', { className: 'dcm-meter', 'aria-hidden': true }, h('span', { style: { width: `${Math.min(100, snapshot.percent ?? 0)}%` } })),
            h('p', { className: 'dcm-muted' }, 'The total uses Harness’s context meter. Categories below are text estimates; provider accounting, image pricing, and message overhead can differ. Stored reasoning may not be sent by every model.'),
            h('div', { className: 'dcm-breakdown' }, Object.entries(snapshot.breakdown).filter(([, value]) => value > 0).map(([key, value]) => h('div', { className: 'dcm-stat', key }, h('span', { className: 'dcm-muted' }, labels[key]), h('strong', null, `~${format(value)}`)))),
            h('h3', null, 'History groups'),
            h('p', { className: 'dcm-muted' }, 'Keep preserves the original messages, reasoning, and attachments. Summarize replaces the selected exchanges with a text checkpoint and drops their reasoning. Omit removes their details from active context. Original messages remain in the chat log.'),
            h('div', { className: 'dcm-controls' },
              h('div', { className: 'dcm-row' }, h('label', { htmlFor: 'dcm-outputs' }, 'Tool / file outputs in summaries'), h('select', { id: 'dcm-outputs', value: outputs, disabled: !!busy, onChange: e => { invalidate(); setOutputs(e.target.value) } }, h('option', { value: 'summarize' }, 'Summarize useful details'), h('option', { value: 'keep' }, 'Keep original text'), h('option', { value: 'omit' }, 'Omit output text'))),
              h('p', { className: 'dcm-muted' }, 'This controls recorded tool output, including PDF extracts and file contents. Files on disk stay untouched. Images are not visually summarized; keep their group to retain them.'),
              h('div', { className: 'dcm-row' }, h('button', { disabled: !!busy, onClick: selectOlder }, 'Summarize older groups'), h('button', { disabled: !!busy, onClick: () => { invalidate(); setChoices({}) } }, 'Keep all'), h('span', { className: 'dcm-muted' }, 'Selections apply to this operation. Automatic compaction remains controlled by Harness.'))),
            h('div', { className: 'dcm-groups' }, rows.map(group => h('div', { className: 'dcm-group', key: group.id }, h('div', null,
              h('strong', null, `History #${group.id} · ~${format(group.tokens)} tokens`),
              group.locked && h('span', { className: 'dcm-tag' }, group.latest ? 'Latest exchange · kept' : 'Protected'),
              group.hasAttachments && h('span', { className: 'dcm-tag' }, 'Has attachments'),
              h('p', null, group.excerpt || 'No text excerpt')),
              h('select', { 'aria-label': `Action for history ${group.id}`, disabled: group.locked || !!busy, value: choices[group.id] ?? 'keep', onChange: e => choose(group.id, e.target.value) }, h('option', { value: 'keep' }, 'Keep'), h('option', { value: 'summarize' }, 'Summarize'), h('option', { value: 'omit' }, 'Omit'))))),
            snapshot.groups.length > 30 && h('div', { className: 'dcm-row dcm-page' }, h('button', { disabled: page === 0, onClick: () => setPage(page - 1) }, 'Previous'), h('span', null, `Page ${page + 1} of ${Math.ceil(snapshot.groups.length / 30)}`), h('button', { disabled: (page + 1) * 30 >= snapshot.groups.length, onClick: () => setPage(page + 1) }, 'Next')),
            plan && h('section', { 'aria-label': 'Compaction preview' },
              h('h3', null, `Preview: ~${format(plan.before)} → ~${format(plan.after)} tokens`),
              h('p', { className: 'dcm-muted' }, 'Nothing has changed yet. Review each replacement before applying. Preview expires in 10 minutes or when the conversation changes.'),
              plan.replacements.map((r, i) => h('div', { className: 'dcm-preview', key: i }, h('strong', null, `${r.action === 'omit' ? 'Omit' : 'Summarize'} ${r.seqs.length} history items · ~${format(r.before)} → ~${format(r.after)}`), h('pre', { className: 'dcm-summary' }, r.summary))),
              h('label', { className: 'dcm-check' }, h('input', { type: 'checkbox', checked: reviewed, disabled: !!busy, onChange: e => setReviewed(e.target.checked) }), 'I reviewed the replacement text.')))),
        h('footer', null,
          h('span', { className: 'dcm-muted' }, `${selected} group(s) selected. Summary previews use your model and may incur normal usage.`),
          h('div', { className: 'dcm-row' }, busy && !busy.startsWith('Applying') && h('button', { onClick: () => abort.current?.abort() }, 'Cancel operation'), h('button', { disabled: !!busy || !selected, onClick: preview }, 'Generate preview'), h('button', { className: 'dcm-primary', disabled: !!busy || !plan || !reviewed, onClick: apply }, 'Apply preview')))), document.body)
    }

    function apply(ctx) {
      const listeners = new Map()
      function HeaderAction({ sessionId, useProjection }) {
        const [open, setOpen] = useState(false)
        const pressure = useProjection('contextPressure')
        const tokens = pressure?.projectedTokens ?? pressure?.pressureTokens
        const percent = pressure?.contextWindow && tokens !== undefined ? Math.round(tokens / pressure.contextWindow * 100) : null
        useEffect(() => {
          const openPanel = () => setOpen(true)
          const views = listeners.get(sessionId) ?? new Set()
          views.add(openPanel); listeners.set(sessionId, views)
          return () => { views.delete(openPanel); if (!views.size) listeners.delete(sessionId) }
        }, [sessionId])
        return h(React.Fragment, null, h('button', { className: 'dcm-open', onClick: () => setOpen(true), title: 'Inspect and manage conversation context' }, 'Context', percent !== null ? ` ${percent}%` : ''), open && h(ContextPanel, { key: sessionId, ctx, sessionId, close: () => setOpen(false), updateMeter: () => {} }))
      }
      function CommandCard({ node }) {
        if (node.outcome?.kind === 'error') return h('div', { className: 'dcm-error', role: 'alert' }, node.outcome.text)
        try {
          const result = JSON.parse(node.outcome?.text ?? '{}')
          if (result.contextManager === 1) return result.op === 'apply' ? h('div', { className: 'dcm-muted' }, `Context compacted: ~${format(result.before)} → ~${format(result.after)} tokens. Original chat history retained.`) : null
        } catch {}
        return h('span', null, node.outcome?.text ?? 'Context manager…')
      }
      ctx.effect(function* () {
        const style = document.createElement('style'); style.dataset.plugin = 'dsh-context-manager'; style.textContent = CSS; document.head.append(style)
        yield () => { style.remove(); listeners.clear() }
        yield ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({ name: 'conversation.session.header.actions', id: 'dsh-context-manager', order: 500 }, HeaderAction))
        yield ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({ name: 'conversation.chat.commandview', key: 'context-manager' }, CommandCard))
        yield ctx.commandUi.decorate({ name: 'context-manager', available: session => listeners.has(session.sessionId), ui: { kind: 'action', run: session => listeners.get(session.sessionId)?.values().next().value?.() } })
      }, 'context manager client')
    }
    return { name: 'dsh-context-manager', inject: ['slots', 'remote', 'remote.commands', 'commandUi'], apply }
  },
})
