export function createGuidedBondApplicationSaveController(saveFn) {
  let sequence = 0
  let latestResolvedSequence = 0
  let latestSavedState = null

  async function save(state, options = {}) {
    const requestSequence = sequence + 1
    sequence = requestSequence
    const result = await saveFn(state, { ...options, sequence: requestSequence })
    if (requestSequence >= latestResolvedSequence) {
      latestResolvedSequence = requestSequence
      latestSavedState = state
      return { stale: false, sequence: requestSequence, result, latestSavedState }
    }
    return { stale: true, sequence: requestSequence, result, latestSavedState }
  }

  return {
    save,
    getLatestSavedState: () => latestSavedState,
    getLatestSequence: () => sequence,
  }
}
