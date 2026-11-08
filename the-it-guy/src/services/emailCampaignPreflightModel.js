const messages = {
  sender: 'Choose a verified sender. In Email settings, finish domain verification or ask the administrator to activate the Arch9 sender.',
  subscription: 'Choose an active send-permission category for this campaign.',
  policy: 'Campaign sending is not approved or is paused. Ask your organisation administrator to review Email settings.',
  audience: 'No eligible recipients match this audience. Check imported contacts, tags, consent, subscriptions and suppressions.',
  quota: 'The sending allowance is unavailable or exhausted. Ask the administrator to review sending limits.',
  account: 'The sending account is disabled or has no allowance. Ask the administrator to activate sending before delivery.',
  permission: 'Your account cannot launch bulk email. Ask the organisation administrator to assign the appropriate sending role.',
}

export function emailCampaignPreflightFailure(report = {}) {
  const details = (report.contentCheck?.errors || []).filter(value => typeof value === 'string' && value.trim())
  for (const check of report.checks || []) {
    if (check.ok !== false) continue
    const message = typeof check.message === 'string' && check.message.trim() ? check.message.trim() : messages[check.key]
    if (message) details.push(message)
  }
  return [...new Set(details)].join(' ') || 'Sending checks could not confirm this campaign is ready. Refresh and run the checks again before sending.'
}
