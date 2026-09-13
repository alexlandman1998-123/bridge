function text(value = '') { return String(value ?? '').trim() }

export function buildRevoRoutingRule({ organisationId, name, priority = 100, match = {}, action = {} } = {}) {
  if (!text(organisationId) || !text(name)) throw new Error('A Revo workspace and rule name are required.')
  if (!action || typeof action !== 'object' || !text(action.assignUserId || action.assignTeamId || action.status)) throw new Error('A routing rule needs an assignment or status action.')
  return { organisation_id: text(organisationId), name: text(name), priority: Math.max(0, Number(priority) || 0), match_json: match && typeof match === 'object' ? match : {}, action_json: action, enabled: true }
}

export function isConversationOverdue(conversation = {}, policy = {}, currentTime = Date.now()) {
  if (!conversation.lastInboundAt || conversation.lastOutboundAt) return false
  const minutes = (currentTime - new Date(conversation.lastInboundAt).getTime()) / 60000
  return Number.isFinite(minutes) && minutes >= Number(policy.escalationMinutes || policy.escalation_minutes || 0)
}

export function selectApplicableRoutingRule(rules = [], conversation = {}) {
  return [...(rules || [])]
    .filter((rule) => rule.enabled !== false)
    .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0))
    .find((rule) => !text(rule.match_json?.sourceChannel) || text(rule.match_json.sourceChannel) === text(conversation.sourceChannel || conversation.channel)) || null
}
