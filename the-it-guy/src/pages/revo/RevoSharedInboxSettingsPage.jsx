import { lazy, Suspense, useState } from 'react'
import { ArrowLeft, Mail, MessageCircle, PenLine, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useOrganisation } from '../../context/OrganisationContext'
import EmailMailboxSettings from '../../components/inbox/EmailMailboxSettings.jsx'
import './RevoSharedInboxSettingsPage.css'

const WhatsAppSettings=lazy(()=>import('../settings/SettingsWhatsAppPage'))
export default function RevoSharedInboxSettingsPage() {
  const { organisation } = useOrganisation()
  const { user } = useAuthSession()
  const [tab, setTab] = useState('mailboxes')
  const [emailTab, setEmailTab] = useState('mailboxes')
  const activateTab = value => { setTab(value); if (value !== 'whatsapp') setEmailTab(value) }
  const tabs = [['mailboxes', 'Email accounts', <Mail size={17} aria-hidden="true" />], ['signatures', 'Signatures', <PenLine size={17} aria-hidden="true" />], ['whatsapp', 'WhatsApp', <MessageCircle size={17} aria-hidden="true" />]]
  const selectTab = (event, index) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault()
    activateTab(tabs[next][0])
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus()
  }
  return <main className="revo-channel-settings">
    <Link className="inbox-settings-back" to="/inbox"><ArrowLeft size={15} aria-hidden="true" /> Back to inbox</Link>
    <header className="ui-workspace-header inbox-settings-page-heading"><div><h1>Inbox settings</h1></div><span className="inbox-settings-page-icon"><Settings2 size={23} aria-hidden="true" /></span></header>
    <div className="inbox-page-tabs" role="tablist" aria-label="Inbox settings sections">{tabs.map(([value, label, icon], index) => <button key={value} id={`inbox-tab-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls={`inbox-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => activateTab(value)} onKeyDown={event => selectTab(event, index)}>{icon}{label}</button>)}</div>
    <section id={`inbox-panel-${emailTab}`} role="tabpanel" aria-labelledby={`inbox-tab-${emailTab}`} hidden={tab === 'whatsapp'}>
      <EmailMailboxSettings organisationId={organisation?.id} userId={user?.id} tab={emailTab} showTabs={false} />
    </section>
    {tab === 'whatsapp' && <section id="inbox-panel-whatsapp" role="tabpanel" aria-labelledby="inbox-tab-whatsapp"><Suspense fallback={<p role="status">Loading WhatsApp settings…</p>}><WhatsAppSettings/></Suspense></section>}
  </main>
}
