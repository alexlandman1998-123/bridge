// Preserve a command ID while retrying an unchanged message in the same scope.
export function matterMessageRequest(previous, { scope, body, audience }) {
  const normalized = String(body || '').trim()
  return previous?.scope === scope && previous.body === normalized && previous.audience === audience
    ? previous : { scope, body: normalized, audience, commandId: crypto.randomUUID() }
}
