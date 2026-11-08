import { Facebook, Inbox, Instagram, Mail } from 'lucide-react'

export default function InboxChannelIcon({ channel = 'email' }) {
  const value = String(channel).toLowerCase()
  channel = value.includes('whatsapp') ? 'whatsapp' : value.includes('instagram') ? 'instagram' : value.includes('facebook') || value.includes('messenger') || value === 'meta' ? 'facebook' : value === 'all' ? 'all' : 'email'
  if (channel === 'whatsapp') return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.84 11.84 0 0 0 12.08 0C5.5 0 .14 5.35.14 11.94c0 2.1.55 4.15 1.6 5.96L.04 24l6.25-1.64a11.9 11.9 0 0 0 5.79 1.48h.01C18.67 23.84 24 18.5 24 11.92c0-3.18-1.23-6.17-3.48-8.44ZM12.09 21.8a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.71.97.99-3.62-.24-.37a9.87 9.87 0 0 1-1.52-5.25c0-5.46 4.44-9.9 9.91-9.9a9.83 9.83 0 0 1 7 2.9 9.84 9.84 0 0 1 2.89 7c0 5.45-4.45 9.86-9.93 9.86Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.3 1.27.49 1.7.63.71.23 1.35.2 1.86.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z" /></svg>
  const Icon = channel === 'facebook' ? Facebook : channel === 'instagram' ? Instagram : channel === 'all' ? Inbox : Mail
  return <Icon size={18} aria-hidden="true" />
}
