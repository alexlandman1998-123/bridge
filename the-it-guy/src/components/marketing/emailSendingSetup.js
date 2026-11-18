export function sendingSetupReadiness({ mode, domain, identities, platformSender, policy, loaded }) {
  if (!loaded) return { ready: false, title: 'Checking sending availability', detail: 'Your saved details are kept while we check account and domain status.' }
  if (policy?.paused_at || policy?.manual_paused_at || policy?.self_service_blocked) return { ready: false, title: 'Campaign sending is paused', detail: policy?.pause_reason || 'Ask your principal or Arch9 support to resolve the sending pause.' }
  if (policy?.account_ready !== true) {
    const title = policy?.account_blocker === 'activation' ? 'Campaign sending needs account activation' : policy?.account_blocker === 'safety_stop' ? 'Campaign sending is temporarily blocked' : 'Campaign sending capacity is unavailable'
    return { ready: false, title, detail: 'Your domain setup can continue. Sending tests and campaigns will become available when Arch9 confirms activation and available sending capacity.' }
  }
  if (mode === 'custom' && domain?.verification_status !== 'verified') return { ready: false, title: domain ? 'Verify your DNS records to continue' : 'Add your sending domain', detail: 'You need access to the DNS settings for a domain your organisation owns.' }
  if (mode === 'arch9' && !platformSender?.ready) return { ready: false, title: 'The Arch9 sender is awaiting activation', detail: 'You can save your sender details now. Arch9 will confirm when this sending method is available.' }
  const active = identities.some(identity => identity.verification_status === 'verified' && !identity.sending_paused_at && identity.sender_mode === mode && (mode === 'arch9' || identity.email_sending_domain_id === domain?.id))
  if (!active) return { ready: false, title: 'Save your sender details', detail: 'Choose the name and address recipients see, and an existing inbox for replies.' }
  if (!policy?.approved_at) return { ready: false, title: 'Sender activation is being confirmed', detail: 'Refresh status shortly. No email will be sent until activation is confirmed.' }
  return { ready: true, title: 'This sending method is ready for a test', detail: 'Send a test to your signed-in email address, check your inbox and spam folder, then reply to confirm your reply-to inbox works.' }
}

export function normaliseSendingDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '')
}
