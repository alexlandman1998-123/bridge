export const ARCH9_CAMPAIGN_EMAIL = 'noreply@updates.arch9.co.za'
export const ARCH9_CAMPAIGN_DOMAIN = 'updates.arch9.co.za'
export const isArch9Domain = value => {
  const domain = String(value || '').trim().toLowerCase().replace(/\.+$/, '')
  return domain === 'arch9.co.za' || domain.endsWith('.arch9.co.za')
}

export function campaignSenderDetails(identity) {
  const mode = identity.sender_mode || 'custom'
  if (!['custom', 'arch9'].includes(mode)) throw new Error('Unknown campaign sender type.')
  if (mode === 'arch9' && (identity.from_email !== ARCH9_CAMPAIGN_EMAIL || identity.email_sending_domain_id)) {
    throw new Error('The Arch9 campaign sender is platform controlled.')
  }
  if (mode === 'custom' && isArch9Domain(String(identity.from_email || '').split('@')[1])) {
    throw new Error('Choose the platform-controlled Arch9 sender for this address.')
  }
  const address = mode === 'arch9' ? ARCH9_CAMPAIGN_EMAIL : identity.from_email
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(identity.reply_to_email || '')) throw new Error('Choose a valid inbox for campaign replies.')
  const displayName = mode === 'arch9' ? `${identity.display_name} via Arch9` : identity.display_name
  return { address, displayName, from: `${displayName} <${address}>`, replyTo: identity.reply_to_email }
}
