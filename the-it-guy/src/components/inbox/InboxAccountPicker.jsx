import ChannelLogo from './InboxChannelIcon'
import { useEffect, useRef } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import './InboxAccountPicker.css'

function channelType(account) {
  const value = `${account?.channel || ''} ${account?.providerKey || ''}`.toLowerCase()
  if (value.includes('whatsapp')) return 'whatsapp'
  if (value.includes('instagram')) return 'instagram'
  if (value.includes('facebook') || value.includes('messenger')) return 'facebook'
  return 'email'
}

export default function InboxAccountPicker({ accounts, value, onChange, onAdd }) {
  const root = useRef(null)
  const selected = accounts.find(account => account.id === value)
  const options = [{ id: 'all', displayName: 'All inboxes', address: 'Every connected account', channel: 'all' }, ...accounts]
  function close() { if (root.current) root.current.open = false }
  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  function keyboard(event) {
    if (event.key === 'Escape') { close(); root.current.querySelector('summary').focus(); event.preventDefault(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); root.current.open = true
    const items = [...root.current.querySelectorAll('[role="option"]')], index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowUp' ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length
    items[next]?.focus()
  }
  const statusCopy = account => account.connectionStatus === 'draft' ? 'Not connected' : account.connectionStatus === 'authorizing' ? 'Finish sign-in' : account.connectionStatus === 'sample' ? 'Sample account' : ['paused', 'disconnected', 'expired', 'error'].includes(account.connectionStatus) ? account.connectionStatus.replaceAll('_', ' ') : ''
  const selectedChannel = selected ? channelType(selected) : 'all'
  return <details ref={root} className="inbox-account-picker" onKeyDown={keyboard} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close() }}>
    <summary aria-label="Select inbox" aria-haspopup="listbox"><span className={`inbox-channel-logo channel-${selectedChannel}`}><ChannelLogo channel={selectedChannel} /></span><span className="inbox-account-trigger-label">{selected?.displayName || selected?.address || 'All inboxes'}{selected?.address && <small>{selected.address}</small>}</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="inbox-account-menu"><div className="inbox-account-menu-heading">Your inboxes<span>{accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span></div><div role="listbox" aria-label="Inbox accounts">{options.map(account => {
      const channel = account.id === 'all' ? 'all' : channelType(account), active = account.id === value
      return <button type="button" role="option" aria-selected={active} tabIndex={active ? 0 : -1} key={account.id} onClick={() => { onChange(account.id); close(); root.current.querySelector('summary').focus() }}><span className={`inbox-channel-logo channel-${channel}`}><ChannelLogo channel={channel} /></span><span className="inbox-account-copy"><strong>{account.displayName || account.address}</strong><small>{account.address}</small>{statusCopy(account) ? <small>{statusCopy(account)}</small> : null}</span>{active && <Check size={16} className="inbox-account-check" aria-hidden="true" />}</button>
    })}</div><button type="button" className="inbox-account-add" onClick={() => { close(); onAdd?.() }}><span><Plus size={17} aria-hidden="true" /></span>Add inbox account</button></div>
  </details>
}
