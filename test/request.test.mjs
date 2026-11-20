import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRequest } from '../src/request.mjs'

test('accepts each client operation and ignores unrelated fields', () => {
  assert.deepEqual(parseRequest('{"op":"inspect"}'), { op: 'inspect' })
  assert.deepEqual(parseRequest('{"op":"acp-status","extra":true}'), { op: 'acp-status' })
  assert.deepEqual(parseRequest('{"op":"history"}'), { op: 'history' })
  assert.deepEqual(parseRequest('{"op":"history","cursor":42}'), { op: 'history', cursor: 42 })
  assert.deepEqual(parseRequest('{"op":"originals","recordSeq":3,"offset":0}'), { op: 'originals', recordSeq: 3, offset: 0 })
  assert.deepEqual(parseRequest('{"op":"originals","recordSeq":3}'), { op: 'originals', recordSeq: 3, offset: 0 })
  assert.deepEqual(parseRequest('{"op":"apply","id":"p1"}'), { op: 'apply', id: 'p1' })
  assert.deepEqual(parseRequest('{"op":"discard","id":"p1"}'), { op: 'discard', id: 'p1' })
})

test('accepts a fully populated preview request', () => {
  const request = {
    op: 'preview',
    fingerprint: 'abc',
    choices: { g1: 'summarize', g2: 'keep', g3: 'omit' },
    outputs: 'omit',
    notes: { g1: { decision: 'keep the reviewed decision', risk: '' } },
  }
  assert.deepEqual(parseRequest(JSON.stringify(request)), request)
})

test('rejects malformed envelopes', () => {
  assert.throws(() => parseRequest('not json'), /not valid JSON/)
  assert.throws(() => parseRequest('[]'), /must be a JSON object/)
  assert.throws(() => parseRequest('null'), /must be a JSON object/)
  assert.throws(() => parseRequest('{"op":"unknown"}'), /Unknown context operation/)
  assert.throws(() => parseRequest(JSON.stringify({ op: 'inspect', pad: 'x'.repeat(100001) })), /too large/)
})

test('rejects invalid history and original-history positions', () => {
  assert.throws(() => parseRequest('{"op":"history","cursor":-1}'), /history cursor/)
  assert.throws(() => parseRequest('{"op":"history","cursor":1.5}'), /history cursor/)
  assert.throws(() => parseRequest('{"op":"originals","offset":0}'), /original-history/)
  assert.throws(() => parseRequest('{"op":"originals","recordSeq":3,"offset":-1}'), /original-history/)
})

test('rejects invalid preview ids', () => {
  assert.throws(() => parseRequest('{"op":"apply"}'), /preview id/)
  assert.throws(() => parseRequest('{"op":"discard","id":""}'), /preview id/)
  assert.throws(() => parseRequest(JSON.stringify({ op: 'apply', id: 'x'.repeat(257) })), /preview id/)
})

test('rejects malformed preview selections', () => {
  assert.throws(() => parseRequest('{"op":"preview"}'), /valid conversation fingerprint/)
  assert.throws(() => parseRequest('{"op":"preview","fingerprint":"a","choices":[]}'), /Choose history groups/)
  assert.throws(() => parseRequest('{"op":"preview","fingerprint":"a","choices":{},"outputs":"delete"}'), /tool \/ file outputs/)
  assert.throws(() => parseRequest('{"op":"preview","fingerprint":"a","choices":{"": "keep"},"outputs":"keep"}'), /Invalid history selection/)
  assert.throws(() => parseRequest('{"op":"preview","fingerprint":"a","choices":{"g1":"drop"},"outputs":"keep"}'), /Invalid history selection/)
})

test('rejects malformed reviewed notes before any summary request', () => {
  const base = { op: 'preview', fingerprint: 'a', choices: { g1: 'summarize' }, outputs: 'summarize' }
  assert.throws(() => parseRequest(JSON.stringify({ ...base, notes: [] })), /Invalid reviewed notes/)
  assert.throws(() => parseRequest(JSON.stringify({ ...base, notes: { g1: { unknown: 'x' } } })), /supported category/)
  assert.throws(() => parseRequest(JSON.stringify({ ...base, notes: { g1: { decision: 'x'.repeat(2001) } } })), /2,000 characters/)
  assert.throws(() => parseRequest(JSON.stringify({ ...base, notes: { g1: 'x' } })), /Notes must belong/)
})
