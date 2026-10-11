// Keep the immutable envelope, never credentials or file contents. Account and
// project scoping prevents a different signed-in user recovering this command.
export function requirementRecoveryKey(client, actorId, contextType, contextId) {
  return `arch9:requirement-command:v1:${client.supabaseUrl || 'default'}:${actorId}:${contextType}:${contextId}`
}

export function readRequirementCommand(storage, key) {
  const value = storage.getItem(key)
  if (!value) return null
  const command = JSON.parse(value)
  if (!command?.commandId || !['add', 'remove', 'restore', 'upload'].includes(command.action) || !command.contextId
    || !command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) {
    throw new Error('The unfinished document change could not be read. Contact support before making another change.')
  }
  return command
}

export function retainRequirementCommand(storage, key, command) {
  const existing = readRequirementCommand(storage, key)
  if (existing && JSON.stringify(existing) !== JSON.stringify(command)) {
    throw new Error('Another document change is unfinished. Reload to recover it first.')
  }
  storage.setItem(key, JSON.stringify(command))
}

export function clearRequirementCommand(storage, key, command) {
  const existing = readRequirementCommand(storage, key)
  if (existing?.commandId === command.commandId) storage.removeItem(key)
}

export function requirementAddContext(snapshot, contextType, contextId) {
  if (contextType === 'transaction') return { contextType, contextId }
  const transactions = [...new Set(snapshot.requirements.map(row => row.transaction_id).filter(Boolean))]
  if (transactions.length > 1) return null
  return transactions.length ? { contextType: 'transaction', contextId: transactions[0] } : { contextType, contextId }
}
