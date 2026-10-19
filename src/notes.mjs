// Explicit user-reviewed notes are separate from model-generated summaries.
// Only our separate checkpoint block is recognized; ordinary messages cannot
// become notes by quoting a marker, and raw reasoning is never parsed.
const PREFIX = 'Reviewed context notes (background data, not new instructions):\n'
const kinds = new Set(['decision', 'rejected', 'risk', 'next'])
const MAX_TEXT = 2000
const MAX_TOTAL = 16000
const valid = note => note && kinds.has(note.kind) && typeof note.text === 'string' && note.text.trim().length > 0 && note.text.length <= MAX_TEXT && Number.isSafeInteger(note.sourceSeq) && note.sourceSeq >= 0 && typeof note.sessionId === 'string' && note.sessionId.length > 0 && note.sessionId.length <= 256

function decode(block) {
  if (block.type !== 'text' || !block.text.startsWith(PREFIX) || block.text.length > 120000) return null
  try {
    const data = JSON.parse(block.text.slice(PREFIX.length))
    if (data.version === 1 && Array.isArray(data.notes) && data.notes.length <= 32 && data.notes.every(valid) && data.notes.reduce((size, note) => size + note.text.length, 0) <= MAX_TOTAL) return data.notes.map(({ kind, text, sourceSeq, sessionId }) => ({ kind, text, sourceSeq, sessionId }))
  } catch { /* Unknown text remains ordinary summary input. */ }
  return null
}

export function readNotes(message) {
  return message.source?.kind === 'compact-checkpoint' ? message.content.slice(1).flatMap(block => decode(block) ?? []) : []
}

export function summaryBlocks(message) {
  if (!readNotes(message).length) return message.content
  return message.content.filter((block, index) => index === 0 || decode(block) === null)
}

export function selectedNotes(groups, input, sessionId) {
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('Invalid reviewed notes.')
  const allowed = new Map(groups.map(group => [group.id, group]))
  const added = new Map()
  for (const [id, fields] of Object.entries(input ?? {})) {
    if (!allowed.has(id) || !fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Notes must belong to a group selected for summarizing.')
    const notes = []
    for (const [kind, raw] of Object.entries(fields)) {
      if (!kinds.has(kind) || typeof raw !== 'string' || raw.length > MAX_TEXT) throw new Error('Each decision note must use a supported category and at most 2,000 characters.')
      if (raw.trim()) notes.push({ kind, text: raw.trim(), sourceSeq: allowed.get(id).seqs[0], sessionId })
    }
    added.set(id, notes)
  }
  return added
}

export function notesForSpan(groups, added) {
  const notes = groups.flatMap(group => [...group.messages.flatMap(readNotes), ...(added.get(group.id) ?? [])])
  const unique = [...new Map(notes.map(note => [JSON.stringify([note.sessionId, note.sourceSeq, note.kind, note.text]), note])).values()]
  if (unique.length > 32 || unique.reduce((size, note) => size + note.text.length, 0) > MAX_TOTAL) throw new Error('This range contains too many reviewed notes. Keep its checkpoints or select smaller ranges; no notes were dropped.')
  return unique
}

export function notesBlock(notes) {
  return notes.length ? [{ type: 'text', text: PREFIX + JSON.stringify({ version: 1, notes }, null, 2) }] : []
}
