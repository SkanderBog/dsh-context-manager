import { ContextManager } from './manager.mjs'
export { ContextManager, fingerprint } from './manager.mjs'

export const name = 'dsh-context-manager'
export const inject = ['commands', 'sessions', 'tokenMeter', 'llm']

/** Register the human-only command; the model never receives these control requests. */
export function apply(ctx) {
  const manager = new ContextManager(ctx)
  const lifecycle = new AbortController()
  const pending = new Set()
  ctx.effect(function* () {
    yield async () => { lifecycle.abort(); await Promise.allSettled(pending); manager.clear() }
    yield ctx.commands.register({
      definitionId: 'dsh-context-manager', name: 'context-manager',
      description: 'Inspect context and preview selective compaction',
      input: { hint: 'Open the Context button for selective compaction' }, recordInput: false,
      handler(invocation) {
        const operation = (async () => {
          try {
            const raw = invocation.rawInput.trim()
            if (!raw) return { kind: 'success', text: 'Use the Context button beside the conversation title to inspect, preview, and compact history.' }
            if (raw.length > 100_000) throw new Error('Context control request is too large.')
            const request = JSON.parse(raw)
            const signal = AbortSignal.any([invocation.signal, lifecycle.signal])
            let result
            switch (request.op) {
              case 'inspect': result = manager.inspect(invocation.agent); break
              case 'preview': result = await manager.preview(invocation.agent, request, signal); break
              case 'apply': result = await manager.apply(invocation.agent, request.id, signal, invocation.commandId); break
              case 'discard': result = manager.discard(invocation.agent, request.id); break
              default: throw new Error('Unknown context operation.')
            }
            return { kind: 'success', text: JSON.stringify({ contextManager: 1, op: request.op, ...result }) }
          } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : String(error) } }
        })()
        pending.add(operation)
        operation.then(() => pending.delete(operation), () => pending.delete(operation))
        return operation
      },
    })
  }, 'context manager lifecycle')
}
