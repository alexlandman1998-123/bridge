let chunkTrace = null

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function beginBuyerLeadWorkspaceChunkLoad() {
  if (!chunkTrace) {
    chunkTrace = {
      startedAt: now(),
      completedAt: null,
      durationMs: null,
    }
  }
  return chunkTrace
}

export function completeBuyerLeadWorkspaceChunkLoad() {
  const trace = beginBuyerLeadWorkspaceChunkLoad()
  if (!Number.isFinite(Number(trace.completedAt))) {
    trace.completedAt = now()
    trace.durationMs = Math.max(0, Math.round(trace.completedAt - trace.startedAt))
  }
  return { ...trace }
}

export function readBuyerLeadWorkspaceChunkTrace() {
  return chunkTrace ? { ...chunkTrace } : null
}

