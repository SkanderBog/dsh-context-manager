// Read-only projections. Never expose rawOutput or reasoning in control responses.
export function publicText(blocks, limit = 8000) {
  let text = '', truncated = false
  const add = value => {
    const valueText = String(value ?? '')
    const remaining = Math.max(0, limit - text.length)
    text += valueText.slice(0, remaining)
    if (valueText.length > remaining) truncated = true
  }
  const visit = (items, depth = 0) => {
    for (const block of items ?? []) {
      if (block.type === 'reasoning') continue
      if (text.length >= limit) { truncated = true; break }
      if (block.type === 'text') add(block.text)
      else if (block.type === 'tool-call') add(`[Tool call ${block.name}] ${typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.input ?? block.arguments ?? {})}`)
      else if (block.type === 'tool-result' && depth < 4) visit(block.content, depth + 1)
      else if (block.type === 'image' || block.type === 'file') add(`[${block.type} attachment; open the original chat to inspect it]`)
      else add(`[${block.type}]`)
      add('\n')
    }
  }
  visit(blocks)
  return { text: text.trim(), truncated }
}

const count = value => Number.isSafeInteger(value) && value >= 0
export function reportedUsage(usage) {
  if (!usage || !count(usage.inputTokens) || !count(usage.outputTokens)) return null
  for (const key of ['cacheReadTokens', 'cacheWriteTokens']) if (usage[key] !== undefined && !count(usage[key])) return null
  // Harness reports disjoint input buckets; reasoning is already part of output.
  const inputTokens = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  if (!count(inputTokens)) return null
  return { inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens ?? 0, cacheWriteTokens: usage.cacheWriteTokens ?? 0 }
}

export function compressionUsage(calls) {
  const samples = calls.map(call => reportedUsage(call.usage)).filter(Boolean)
  return {
    calls: calls.length, reportedCalls: samples.length,
    inputTokens: calls.length && !samples.length ? null : samples.reduce((total, sample) => total + sample.inputTokens, 0),
    outputTokens: calls.length && !samples.length ? null : samples.reduce((total, sample) => total + sample.outputTokens, 0),
  }
}

export function lastReportedRequest(session) {
  const floor = Math.max(0, session.seq - 10000)
  for (let seq = session.seq - 1; seq >= floor; seq--) {
    const event = session.eventAt(seq)
    if (event?.type !== 'assistant/message') continue
    const sample = event.data.usage ?? event.data.stream?.findLast(item => item.type === 'chunk' && item.chunk?.type === 'usage')?.chunk.usage
    const usage = reportedUsage(sample)
    if (!usage) continue
    const source = event.data.message?.source
    return { ...usage, seq, provider: source?.provider ?? null, model: source?.model ?? null }
  }
  return null
}

export function compressionHistory(session, cursor) {
  if (cursor !== undefined && (!count(cursor) || cursor >= session.seq)) throw new Error('Invalid compression history cursor.')
  const start = cursor ?? session.seq - 1
  const floor = Math.max(0, start - 999)
  const active = new Set(session.deriveMessages().filter(message => message.source?.kind === 'compact-checkpoint').map(message => message.source.compactionId))
  const records = []
  let seq = start
  for (; seq >= floor && records.length < 10; seq--) {
    const event = session.eventAt(seq)
    if (event?.type !== 'compaction/summary') continue
    const data = event.data
    // The next event is the standard correlated replacement, including after reload.
    const replacement = session.eventAt(seq + 1)
    const applied = replacement?.type === 'user/message' && replacement.data.source?.compactionId === data.compactionId
    const sourceCommandId = data.sourceCommandId
    let command = null
    if (sourceCommandId) {
      for (let index = seq - 1; index >= Math.max(0, seq - 1000); index--) {
        const prior = session.eventAt(index)
        if (prior?.type === 'command/run' && prior.data.commandId === sourceCommandId) { command = prior.data.name; break }
      }
    }
    records.push({ seq, compactionId: data.compactionId, provider: data.provider, model: data.model,
      origin: command === 'context-manager' || data.provider === 'dsh-context-manager' ? 'Context Manager' : command ? `/${command}` : 'Harness checkpoint (engine not recorded)',
      state: !applied ? 'unapplied' : active.has(data.compactionId) ? 'active' : 'superseded',
      originalCount: data.shadowedSeqs?.length ?? 0, shadowedTokens: data.shadowedTokenCount,
      usage: reportedUsage(data.usage), ...publicText(data.summary),
    })
  }
  return { records, nextCursor: seq >= 0 ? seq : null }
}

export function originalMessages(session, recordSeq, offset = 0) {
  if (!count(recordSeq) || !count(offset)) throw new Error('Invalid original-history request.')
  const record = session.eventAt(recordSeq)
  if (record?.type !== 'compaction/summary' || !Array.isArray(record.data.shadowedSeqs)) throw new Error('This compression record is unavailable in this session.')
  const seqs = record.data.shadowedSeqs
  if (offset > seqs.length) throw new Error('Invalid original-history offset.')
  const messages = seqs.slice(offset, offset + 5).map(seq => {
    const event = count(seq) && seq < recordSeq ? session.eventAt(seq) : null
    const message = event && session.deriveEventMessage(event)
    return message ? { seq, role: message.role, ...publicText(message.content) } : { seq, role: 'unavailable', text: 'Original message is unavailable in this log.', truncated: false }
  })
  return { recordSeq, messages, total: seqs.length, nextOffset: offset + messages.length < seqs.length ? offset + messages.length : null }
}
