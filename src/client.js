/* Harness browser entry: platform modules are supplied by the host module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-context-manager',
  factory: require => {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useState, useEffect, useRef } = React
    const numberFormat = new Intl.NumberFormat()
    const format = value => numberFormat.format(Math.round(value))
    const labels = { instructions: 'System / developer instructions', harnessContext: 'Harness instructions / runtime context', user: 'User messages', answers: 'Assistant answers', thinking: 'Stored reasoning', toolOutputs: 'Tool / file outputs', toolCalls: 'Tool calls', attachments: 'Attachment references', toolDefinitions: 'Tool definitions', other: 'Other content' }
    const noteLabels = { decision: 'Decision', rejected: 'Rejected approach and reason', risk: 'Risk or uncertainty', next: 'Next step' }
    const CSS = `
      .dcm-open{font:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--border,#7775);border-radius:8px;background:transparent;color:inherit;cursor:pointer;white-space:nowrap}
      .dcm{color:var(--foreground,#e6e8ec);background:var(--background,#1c1d21);border:1px solid #8885;border-radius:16px;padding:0;width:min(1040px,94vw);max-height:90vh;box-shadow:0 20px 90px #0008;font:14px/1.5 system-ui,sans-serif;color-scheme:light dark}
      .dcm[open]{display:flex;flex-direction:column;overflow:hidden}.dcm header,.dcm footer{flex-shrink:0}.dcm-body{min-height:0;flex:1 1 auto}.dcm-check input{flex-shrink:0}
      .dcm summary{cursor:pointer;overflow-wrap:anywhere}.dcm-group>div{min-width:0}.dcm-notes{grid-column:1/-1}.dcm-notes label{display:block;margin:8px 0}.dcm textarea{display:block;width:100%;min-height:60px;resize:vertical;font:inherit;color:inherit;background:transparent;border:1px solid #8886;border-radius:7px;padding:8px}.dcm textarea:focus-visible{outline:2px solid #7da2ff;outline-offset:2px}.dcm-controls{overflow-wrap:anywhere}
      .dcm::backdrop{background:#0008}.dcm *{box-sizing:border-box}.dcm header,.dcm footer{padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #8883}.dcm footer{border-top:1px solid #8883;border-bottom:0;flex-wrap:wrap}.dcm h2{font-size:20px;margin:0}.dcm h3{font-size:15px;margin:0 0 8px}.dcm p{margin:7px 0}.dcm-body{overflow:auto;max-height:65vh;padding:18px 22px}.dcm-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.dcm-muted{opacity:.75;font-size:12px}.dcm button,.dcm select{font:inherit;color:inherit;background:transparent;border:1px solid #8886;border-radius:7px;padding:7px 11px;cursor:pointer}.dcm select{background:var(--background,#1c1d21)}.dcm button:disabled,.dcm select:disabled{opacity:.45;cursor:default}.dcm button:focus-visible,.dcm select:focus-visible{outline:2px solid #7da2ff;outline-offset:2px}.dcm button.dcm-primary{background:#345cda;color:white;border-color:#345cda}.dcm-error{border:1px solid #df7272;background:#cc44441c;padding:10px;border-radius:8px;margin-bottom:12px}.dcm-success{border:1px solid #55a87d;padding:10px;border-radius:8px;margin-bottom:12px}.dcm-meter{height:7px;background:#8883;border-radius:9px;overflow:hidden;margin:9px 0 16px}.dcm-meter span{display:block;background:#6b95ff;height:100%}.dcm-breakdown{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 20px}.dcm-stat{border:1px solid #8883;border-radius:8px;padding:8px 10px}.dcm-stat strong{display:block;font-size:17px;font-variant-numeric:tabular-nums}.dcm-controls{padding:12px;border:1px solid #8883;border-radius:9px;margin:12px 0}.dcm-groups{display:flex;flex-direction:column;gap:8px}.dcm-group{display:grid;grid-template-columns:1fr auto;gap:12px;border:1px solid #8883;border-radius:9px;padding:11px}.dcm-group p{white-space:pre-wrap;overflow-wrap:anywhere;max-height:90px;overflow:auto;font-size:12px;margin-bottom:0}.dcm-tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:5px;background:#8882;margin-left:7px}.dcm-summary{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 ui-monospace,monospace;max-height:260px;overflow:auto;border:1px solid #8884;border-radius:8px;padding:12px}.dcm-preview{margin-bottom:16px}.dcm-check{display:flex;gap:8px;align-items:center}.dcm-check input{width:17px;height:17px}.dcm-page{margin:12px 0}.dcm .dcm-danger{color:#e68787}@media(max-width:650px){.dcm-breakdown{grid-template-columns:repeat(2,1fr)}.dcm header,.dcm footer,.dcm-body{padding:12px}.dcm-group{grid-template-columns:1fr}.dcm-body{max-height:60vh}}
    `

    function ContextPanel({ ctx, sessionId, close, updateMeter }) {
      const dialog = useRef(null)
      const abort = useRef(null)
      const mounted = useRef(true)
      const currentPlan = useRef(null)
      const reviewInput = useRef(null)
      const [snapshot, setSnapshot] = useState(null)
      const [choices, setChoices] = useState({})
      const [notes, setNotes] = useState({})
      const [outputs, setOutputs] = useState('summarize')
      const [plan, setPlan] = useState(null)
      const [reviewed, setReviewed] = useState(false)
      const [busy, setBusy] = useState('Loading context…')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [page, setPage] = useState(0)
      const [history, setHistory] = useState(null)
      const [originals, setOriginals] = useState(null)
      const [acp, setAcp] = useState(null)
      const request = async (payload, signal) => {
        const response = await ctx.remote.commands.execute(sessionId, `/context-manager ${JSON.stringify(payload)}`, [], signal)
        // Preview owns its late-response cleanup so its server-side plan is discarded.
        if (payload.op !== 'preview') signal?.throwIfAborted()
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
        invalidate(); setSnapshot(value); setChoices({}); setNotes({}); setPage(0); setHistory(null); setOriginals(null); setAcp(null); updateMeter(value.percent)
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
      useEffect(() => {
        if (!plan || busy) return
        reviewInput.current?.focus()
        reviewInput.current?.scrollIntoView?.({ block: 'nearest' })
      }, [plan, busy])
      useEffect(() => {
        if (!plan) return
        const timer = setTimeout(() => {
          if (currentPlan.current !== plan) return
          invalidate()
          setNotice('Preview expired. Generate a new preview before applying; context is unchanged.')
        }, Math.max(0, plan.expires - Date.now()))
        return () => clearTimeout(timer)
      }, [plan])
      const choose = (id, action) => { invalidate(); setChoices(values => ({ ...values, [id]: action })); setNotice('') }
      const selectOlder = () => {
        invalidate(); setNotice('')
        const eligible = snapshot.groups.filter(g => !g.locked)
        setChoices(Object.fromEntries(eligible.map(g => [g.id, 'summarize'])))
      }
      const preview = () => run('Preparing summary preview…', async signal => {
        if (currentPlan.current) return
        invalidate(); setNotice('')
        const selectedNotes = Object.fromEntries(Object.entries(notes).filter(([id]) => choices[id] === 'summarize'))
        const value = await request({ op: 'preview', fingerprint: snapshot.fingerprint, choices, outputs, notes: selectedNotes }, signal)
        if (!mounted.current || signal.aborted) {
          void request({ op: 'discard', id: value.id }).catch(() => {})
          signal.throwIfAborted()
          return
        }
        currentPlan.current = value; setPlan(value); setReviewed(false)
      })
      const apply = () => run('Applying and saving context…', async signal => {
        const id = currentPlan.current?.id
        if (!id) throw new Error('Generate a new preview first.')
        // Consume the local preview even when a transport error leaves the outcome uncertain.
        currentPlan.current = null; setPlan(null); setReviewed(false)
        const value = await request({ op: 'apply', id }, signal)
        if (mounted.current) { setNotice(value.message); await refresh(signal) }
      })
      const selectedGroups = snapshot?.groups.filter(g => !g.locked && choices[g.id] && choices[g.id] !== 'keep') ?? []
      const selected = selectedGroups.length
      const selectedTokens = selectedGroups.reduce((total, group) => total + group.tokens, 0)
      const usesModel = selectedGroups.some(group => choices[group.id] === 'summarize')
      const rows = snapshot?.groups.slice(page * 30, (page + 1) * 30) ?? []
      const loadHistory = cursor => run('Reading compression history…', async signal => {
        const value = await request({ op: 'history', ...(cursor === undefined ? {} : { cursor }) }, signal)
        if (mounted.current) { setHistory(value); setOriginals(null) }
      })
      const loadOriginals = (recordSeq, offset = 0) => run('Reading original messages…', async signal => {
        const value = await request({ op: 'originals', recordSeq, offset }, signal)
        if (mounted.current) setOriginals({ ...value, offset })
      })
      const usageLabel = usage => !usage ? 'Usage not reported' : usage.inputTokens === null ? 'Token usage not reported by the provider' : `${format(usage.inputTokens)} input + ${format(usage.outputTokens)} output tokens`
      return createPortal(h('dialog', { ref: dialog, className: 'dcm', 'aria-labelledby': 'dcm-title', onCancel: event => { event.preventDefault(); if (!busy.startsWith('Applying')) close() } },
        h('header', null, h('div', null, h('h2', { id: 'dcm-title' }, 'Context manager'), h('div', { className: 'dcm-muted' }, 'Choose what the model carries into its next reply.')), h('button', { onClick: close, disabled: busy.startsWith('Applying'), 'aria-label': 'Close context manager' }, 'Close')),
        h('div', { className: 'dcm-body', 'aria-busy': !!busy },
          error && h('div', { className: 'dcm-error', role: 'alert' }, error),
          notice && h('div', { className: 'dcm-success', role: 'status' }, notice),
          busy && h('p', { role: 'status' }, busy),
          snapshot && h(React.Fragment, null,
            h('div', { className: 'dcm-row' }, h('strong', null, `Local context: ~${format(snapshot.totalTokens)} tokens`), h('span', null, snapshot.contextWindow ? `of ${format(snapshot.contextWindow)} · ${snapshot.percent}% estimated` : 'Context limit not reported by this model'), h('button', { disabled: !!busy, onClick: () => run('Refreshing context…', refresh) }, 'Refresh')),
            h('div', { className: 'dcm-meter', 'aria-hidden': true }, h('span', { style: { width: `${Math.min(100, snapshot.percent ?? 0)}%` } })),
            h('p', { className: 'dcm-muted' }, 'Local context is Harness’s estimate of the retained conversation. External compression can make the actual model input smaller. Categories are text estimates; images and message overhead can differ. Stored reasoning may not be sent by every model.'),
            h('div', { className: 'dcm-controls', 'aria-label': 'Reported context usage' },
              h('h3', null, 'What reached the model'),
              h('p', null, snapshot.accounting?.lastRequest ? `Last reported request: ${usageLabel(snapshot.accounting.lastRequest)} · ${snapshot.accounting.lastRequest.provider ?? 'unknown provider'} / ${snapshot.accounting.lastRequest.model ?? 'unknown model'}` : 'No recent provider usage has been reported.'),
              h('p', { className: 'dcm-muted' }, 'Input includes cached tokens. This is a previous request, not a measurement of the next reply. Compression preview costs are shown separately below.'),
              snapshot.acpAvailable ? h('button', { disabled: !!busy, onClick: () => run('Reading context engine status…', async signal => { const value = await request({ op: 'acp-status' }, signal); if (mounted.current) setAcp(value) }) }, 'Read ACP status') : h('p', { className: 'dcm-muted' }, 'Effective compressed size is unavailable here. An installed ACP engine can report it through its acp_status tool.'),
              acp && h(React.Fragment, null, h('p', { className: 'dcm-muted' }, 'Status from this conversation’s acp_status tool. Refresh it after more work; its figures are separate from the local estimate.'), h('pre', { className: 'dcm-summary' }, acp.text), acp.truncated && h('p', null, 'Status display truncated. Use the engine’s own interface for the full report.'))),
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
              group.hasReasoning && h('span', { className: 'dcm-tag' }, 'Has stored reasoning'),
              h('p', null, group.excerpt || 'No text excerpt')),
              h('select', { 'aria-label': `Action for history ${group.id}`, disabled: group.locked || !!busy, value: choices[group.id] ?? 'keep', onChange: e => choose(group.id, e.target.value) }, h('option', { value: 'keep' }, 'Keep'), h('option', { value: 'summarize' }, 'Summarize'), h('option', { value: 'omit' }, 'Omit')),
              (group.notes?.length > 0 || !group.locked && choices[group.id] === 'summarize') && h('div', { className: 'dcm-notes' },
                group.notes?.length > 0 && h('details', null, h('summary', null, `${group.notes.length} reviewed note(s)`), group.notes.map((note, index) => h('p', { key: index }, `${noteLabels[note.kind]}: ${note.text} (source history #${note.sourceSeq})`)), h('p', { className: 'dcm-muted' }, 'Kept verbatim by this plugin’s summaries. Omit drops them; other compaction engines may handle them differently.')),
                !group.locked && choices[group.id] === 'summarize' && h('details', null,
                  h('summary', null, 'Add notes to preserve'),
                  h('p', { className: 'dcm-muted' }, 'Optional: record decisions, rejected approaches, uncertainties, or the next step. Notes are included verbatim in the preview and carried through later Context Manager summaries with their source history number.'),
                  group.hasReasoning && h('p', { className: 'dcm-muted' }, 'Stored reasoning, including IoT notes, is excluded from summaries. Use these fields for decisions you want to preserve.'),
                  Object.entries(noteLabels).map(([kind, label]) => h('label', { key: kind }, label, h('textarea', { 'aria-label': `${label} for history ${group.id}`, maxLength: 2000, disabled: !!busy, value: notes[group.id]?.[kind] ?? '', onInput: e => { const text = e.target.value; invalidate(); setNotes(previous => ({ ...previous, [group.id]: { ...previous[group.id], [kind]: text } })); setNotice('') } })))))))),
            snapshot.groups.length > 30 && h('div', { className: 'dcm-row dcm-page' }, h('button', { disabled: page === 0, onClick: () => setPage(page - 1) }, 'Previous'), h('span', null, `Page ${page + 1} of ${Math.ceil(snapshot.groups.length / 30)}`), h('button', { disabled: (page + 1) * 30 >= snapshot.groups.length, onClick: () => setPage(page + 1) }, 'Next')),
            h('section', { className: 'dcm-controls', 'aria-label': 'Compression history' },
              h('h3', null, 'Compression history and originals'),
              h('p', { className: 'dcm-muted' }, 'Read-only records from this session log. Viewing originals does not restore them to model context. Reasoning and image pixels are excluded. Proxy-only compression and IoT’s separate archives are not recorded here.'),
              h('button', { disabled: !!busy, onClick: () => loadHistory() }, history ? 'Refresh compression history' : 'Load compression history'),
              history && !history.records.length && h('p', null, 'No compression records in this page of the log.'),
              history?.records.map(record => h('details', { key: record.seq, className: 'dcm-controls' },
                h('summary', null, `${record.origin} · ${record.state} · ${record.originalCount} original messages`),
                h('p', { className: 'dcm-muted' }, `Summary route: ${record.provider} / ${record.model}. ${usageLabel(record.usage)}. Record #${record.seq}.`),
                h('pre', { className: 'dcm-summary' }, record.text),
                record.truncated && h('p', null, 'Checkpoint display truncated.'),
                h('button', { disabled: !!busy, onClick: () => loadOriginals(record.seq) }, `View originals for record ${record.seq}`))),
              history?.nextCursor != null && h('button', { disabled: !!busy, onClick: () => loadHistory(history.nextCursor) }, 'Older compression records'),
              originals && h('section', { 'aria-label': 'Original messages' },
                h('h3', null, `Originals for record #${originals.recordSeq}`),
                originals.messages.map(message => h('div', { key: message.seq }, h('strong', null, `#${message.seq} · ${message.role}`), h('pre', { className: 'dcm-summary' }, message.text || 'No visible text; reasoning is excluded.'), message.truncated && h('p', null, 'Message display truncated; open the original chat for the complete text.'))),
                h('div', { className: 'dcm-row' }, h('button', { disabled: !!busy || originals.offset === 0, onClick: () => loadOriginals(originals.recordSeq, Math.max(0, originals.offset - 5)) }, 'Previous originals'), h('span', null, `${originals.offset + (originals.messages.length ? 1 : 0)}–${originals.offset + originals.messages.length} of ${originals.total}`), h('button', { disabled: !!busy || originals.nextOffset === null, onClick: () => loadOriginals(originals.recordSeq, originals.nextOffset) }, 'Next originals')))),
            plan && h('section', { 'aria-label': 'Compaction preview' },
              h('h3', null, `Local context preview: ~${format(plan.before)} → ~${format(plan.after)} tokens`),
              plan.usage && h('p', { className: 'dcm-muted' }, `Preview generation: ${plan.usage.calls} model call(s). ${usageLabel(plan.usage)}${plan.usage.reportedCalls < plan.usage.calls ? ` (${plan.usage.reportedCalls}/${plan.usage.calls} calls reported usage; totals may be incomplete)` : ''}. These are generation costs, separate from retained context.`),
              h('p', { className: 'dcm-muted' }, 'Nothing has changed yet. Review each replacement before applying. Preview expires in 10 minutes or when the conversation changes.'),
              plan.replacements.map((r, i) => h('div', { className: 'dcm-preview', key: i }, h('strong', null, `${r.action === 'omit' ? 'Omit' : 'Summarize'} ${r.seqs.length} history items · ~${format(r.before)} → ~${format(r.after)}`), h('pre', { className: 'dcm-summary' }, r.summary))),
              h('label', { className: 'dcm-check' }, h('input', { ref: reviewInput, type: 'checkbox', checked: reviewed, disabled: !!busy, onChange: e => setReviewed(e.target.checked) }), 'I reviewed the replacement text.')))),
        h('footer', null,
          h('span', { className: 'dcm-muted', role: 'status' }, `${selected} group(s) selected${selected ? ` · ~${format(selectedTokens)} tokens before replacement` : ''}. ${usesModel ? 'Summary previews use your model and may incur normal usage.' : selected ? 'Omission-only previews do not call the model.' : 'Select older history to summarize or omit.'}`),
          h('div', { className: 'dcm-row' }, busy && !busy.startsWith('Applying') && h('button', { onClick: () => abort.current?.abort() }, 'Cancel operation'), plan && h('button', { disabled: !!busy, onClick: () => { invalidate(); setNotice('Preview discarded. Context is unchanged.') } }, 'Discard preview'), h('button', { disabled: !!busy || !selected || !!plan, onClick: preview }, 'Generate preview'), h('button', { className: 'dcm-primary', disabled: !!busy || !plan || !reviewed, onClick: apply }, 'Apply preview')))), document.body)
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
        return h(React.Fragment, null, h('button', { className: 'dcm-open', onClick: () => setOpen(true), title: 'Inspect local context estimates and reported model usage' }, 'Context', percent !== null ? ` ~${percent}%` : ''), open && h(ContextPanel, { key: sessionId, ctx, sessionId, close: () => setOpen(false), updateMeter: () => {} }))
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
