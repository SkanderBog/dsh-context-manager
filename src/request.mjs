import { MAX_NOTE_TEXT, NOTE_KINDS } from './notes.mjs'

const OPERATIONS = new Set(['inspect', 'history', 'originals', 'acp-status', 'preview', 'apply', 'discard'])
const ACTIONS = new Set(['summarize', 'keep', 'omit'])
const NOTE_KIND_SET = new Set(NOTE_KINDS)
const MAX_REQUEST = 100_000
const MAX_ID = 256
const MAX_CHOICES = 1000

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function fail(message) {
  throw new Error(message)
}

function parsePreview(request) {
  const { fingerprint, choices, outputs, notes } = request
  if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > MAX_ID)
    fail('Preview requires a valid conversation fingerprint.')
  if (!object(choices))
    fail('Choose history groups first.')
  const entries = Object.entries(choices)
  if (entries.length > MAX_CHOICES)
    fail('Too many history groups selected.')
  for (const [id, action] of entries) {
    if (id.length === 0 || id.length > MAX_ID || !ACTIONS.has(action))
      fail('Invalid history selection. Refresh and try again.')
  }
  if (!ACTIONS.has(outputs))
    fail('Choose how to handle tool / file outputs.')
  if (notes !== undefined) {
    if (!object(notes))
      fail('Invalid reviewed notes.')
    for (const [id, fields] of Object.entries(notes)) {
      if (id.length === 0 || id.length > MAX_ID || !object(fields))
        fail('Notes must belong to a group selected for summarizing.')
      for (const [kind, text] of Object.entries(fields)) {
        if (!NOTE_KIND_SET.has(kind) || typeof text !== 'string' || text.length > MAX_NOTE_TEXT)
          fail('Each decision note must use a supported category and at most 2,000 characters.')
      }
    }
  }
  return { fingerprint, choices, outputs, ...(notes === undefined ? {} : { notes }) }
}

export function parseRequest(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_REQUEST)
    fail('Context control request is too large.')
  let request
  try {
    request = JSON.parse(raw)
  } catch {
    fail('Context control request is not valid JSON.')
  }
  if (!object(request))
    fail('Context control request must be a JSON object.')
  const op = request.op
  if (typeof op !== 'string' || !OPERATIONS.has(op))
    fail('Unknown context operation.')
  switch (op) {
    case 'inspect':
    case 'acp-status':
      return { op }
    case 'history':
      if (request.cursor !== undefined && !count(request.cursor))
        fail('Invalid compression history cursor.')
      return { op, ...(request.cursor === undefined ? {} : { cursor: request.cursor }) }
    case 'originals':
      if (!count(request.recordSeq) || (request.offset !== undefined && !count(request.offset)))
        fail('Invalid original-history request.')
      return { op, recordSeq: request.recordSeq, offset: request.offset ?? 0 }
    case 'preview':
      return { op, ...parsePreview(request) }
    default:
      if (typeof request.id !== 'string' || request.id.length === 0 || request.id.length > MAX_ID)
        fail('Invalid preview id.')
      return { op, id: request.id }
  }
}
