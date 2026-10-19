import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ExternalLink, Inbox, Megaphone, MessageCircle, RefreshCw } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { launchWhatsAppSignup, metaIntegrationRequest, prepareFacebookSdk } from '../../services/metaIntegrationService'
import { settingsPageClass } from './settingsUi'

export default function SettingsWhatsAppPage() {
  const workspace = useMetaWorkspace()
  const { organisationId, senders, loading, refresh, canManage } = workspace
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('')
  const [connection, setConnection] = useState(null), [coexistence, setCoexistence] = useState(false)
  const [registration, setRegistration] = useState(null), [pin, setPin] = useState('')
  const controller = useRef(null), generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort() }, [])
  useEffect(() => {
    invalidate()
    setConnection(null); setRegistration(null); setPin(''); setError(''); setNotice(''); setBusy('')
    return invalidate
  }, [organisationId, invalidate])
  async function prepare() {
    const current = generation.current
    setError(''); setConnection({ loading: true }); setCoexistence(false)
    try {
      const intent = await metaIntegrationRequest(organisationId, 'begin_whatsapp')
      const sdk = await prepareFacebookSdk(intent.appId, intent.graphVersion)
      if (current === generation.current) setConnection({ intent, sdk, loading: false })
    } catch (failure) { if (current === generation.current) { setConnection(null); setError(failure.message) } }
  }
  async function connect() {
    const current = generation.current
    controller.current = new AbortController()
    setBusy('connect'); setError('')
    try {
      const data = await launchWhatsAppSignup({ ...connection, organisationId, coexistence, signal: controller.current.signal })
      if (current !== generation.current) return
      setConnection(null)
      setNotice(data.sender.connection_status === 'connected' ? 'WhatsApp connected. This sender is available to the inbox and campaigns.' : 'Account linked. Activate the number below to complete its WhatsApp registration.')
      await refresh()
    } catch (failure) { if (current === generation.current) { setConnection(null); setError(failure.message) } }
    finally { if (current === generation.current) setBusy('') }
  }
  async function manage(sender, action) {
    const current = generation.current
    setBusy(sender.id); setError(''); setNotice('')
    try { await metaIntegrationRequest(organisationId, action, { senderId: sender.id }); if (current === generation.current) await refresh() }
    catch (failure) { if (current === generation.current) setError(failure.message) }
    finally { if (current === generation.current) setBusy('') }
  }
  function closeConnection() { controller.current?.abort(); setConnection(null); setBusy('') }
  async function register() {
    const current = generation.current
    setBusy('register'); setError('')
    try {
      const data = await metaIntegrationRequest(organisationId, 'register_sender', { senderId: registration.id, pin })
      if (current !== generation.current) return
      setRegistration(null); setPin('')
      setNotice(data.sender.connection_status === 'connected' ? 'Number activated. The inbox and campaigns can use this sender.' : 'Registration submitted. Check the connection after Meta completes activation.')
      await refresh()
    } catch (failure) { if (current === generation.current) { setError(failure.message); setPin('') } }
    finally { if (current === generation.current) setBusy('') }
  }
  return <section className={settingsPageClass}>
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-[#162334]">WhatsApp Business</h1><p className="mt-1 text-sm leading-6 text-[#6b7d93]">Connect your business number to manage messages and campaigns.</p></div>
      <Button variant="secondary" disabled={loading || Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
    </header>
    {(error || workspace.error) ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || workspace.error}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">{notice}</p> : null}
    <section className="overflow-hidden rounded-2xl border border-[#e1e8ef] bg-white shadow-sm" aria-labelledby="whatsapp-numbers-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eef5] px-5 py-4">
        <div><h2 id="whatsapp-numbers-heading" className="text-base font-semibold text-[#162334]">Business numbers</h2><p className="mt-1 text-sm text-[#6b7d93]">WhatsApp accounts connected to this organisation.</p></div>
        {!loading ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${senders.some(sender => sender.connection_status === 'connected') ? 'bg-[#edf7f3] text-[#17634d]' : 'bg-[#f1f4f7] text-[#62778e]'}`}>{senders.some(sender => sender.connection_status === 'connected') ? 'Connected' : 'Not connected'}</span> : null}
      </div>
      {loading ? <p role="status" className="px-5 py-10 text-center text-sm text-[#6b7d93]">Loading WhatsApp connections…</p> : senders.length ? <div className="divide-y divide-[#e8eef5]">{senders.map(sender => <article key={sender.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf7f3] text-[#17634d]"><MessageCircle size={20} /></span><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[#162334]">{sender.business_display_name || 'WhatsApp Business'}</h3><p className="mt-1 text-sm text-[#6b7d93]">{sender.display_phone_number || 'Number not available'}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${sender.connection_status === 'connected' ? 'bg-[#edf7f3] text-[#17634d]' : 'bg-[#f1f4f7] text-[#62778e]'}`}>{({ connected: 'Connected', pending: 'Activation needed', disconnected: 'Disconnected' })[sender.connection_status] || String(sender.connection_status || 'Unknown').replace(/_/g, ' ')}</span>{sender.last_error_message ? <p className="mt-2 text-sm text-red-700">{sender.last_error_message}</p> : null}</div></div>
        {canManage ? <div className="flex flex-wrap gap-2">{sender.connection_status === 'pending' ? <Button size="sm" disabled={Boolean(busy)} onClick={() => { setRegistration(sender); setPin(''); setError('') }}>Activate number</Button> : null}<Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void manage(sender, 'health_sender')}>Check connection</Button><Button variant="ghost" size="sm" disabled={Boolean(busy) || sender.connection_status === 'disconnected'} onClick={() => void manage(sender, 'disconnect_sender')}>Disconnect</Button></div> : null}
      </article>)}</div> : <div className="flex flex-col items-center px-5 py-8 text-center">
        <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7f3] text-[#17634d]"><MessageCircle size={27} /></span>
        <h3 className="text-base font-semibold text-[#162334]">Connect your business number</h3><p className="mt-2 max-w-md text-sm leading-6 text-[#6b7d93]">Link your WhatsApp Business account through Meta to receive messages and send campaigns from Arch9.</p>
        {canManage ? <Button className="mt-5" disabled={Boolean(busy)} onClick={() => void prepare()}><MessageCircle size={16} />Connect WhatsApp</Button> : null}
      </div>}
      {!loading && senders.length > 0 && canManage ? <div className="border-t border-[#e8eef5] px-5 py-4"><Button variant="secondary" disabled={Boolean(busy)} onClick={() => void prepare()}><MessageCircle size={16} />Connect WhatsApp</Button></div> : null}
      {!canManage && !loading ? <p className="border-t border-[#e8eef5] px-5 py-4 text-sm text-[#6b7d93]">An organisation administrator can connect or change a number.</p> : null}
    </section>
    <div className="grid gap-4 md:grid-cols-3">
      <Link to="/marketing?section=whatsapp&view=inbox" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><Inbox size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">Open inbox</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Read and reply to customer messages.</p></div><ArrowUpRight size={16} className="shrink-0 text-[#8293a5]" /></Link>
      <Link to="/marketing?section=whatsapp" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><Megaphone size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">Bulk campaigns</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Create and manage template campaigns.</p></div><ArrowUpRight size={16} className="shrink-0 text-[#8293a5]" /></Link>
      <a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-[#e1e8ef] bg-white p-5 transition-colors hover:border-[#6ba78f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#248568]"><MessageCircle size={20} className="mt-0.5 shrink-0 text-[#17634d]" /><div className="min-w-0 flex-1"><span className="text-sm font-semibold text-[#162334]">WhatsApp Manager</span><p className="mt-1 text-xs leading-5 text-[#6b7d93]">Manage your account and numbers in Meta.</p></div><ExternalLink size={16} className="shrink-0 text-[#8293a5]" /></a>
    </div>
    <section className="rounded-2xl border border-[#e1e8ef] bg-white p-5" aria-labelledby="whatsapp-guidance-heading">
      <h2 id="whatsapp-guidance-heading" className="text-base font-semibold text-[#162334]">Using WhatsApp in Arch9</h2>
      <div className="mt-4 grid gap-5 md:grid-cols-2"><div><h3 className="text-sm font-semibold text-[#425e79]">Customer replies</h3><p className="mt-1 text-sm leading-6 text-[#6b7d93]">Reply from the inbox within 24 hours of a customer’s message.</p></div><div><h3 className="text-sm font-semibold text-[#425e79]">Campaigns</h3><p className="mt-1 text-sm leading-6 text-[#6b7d93]">Send approved templates to contacts with recorded WhatsApp consent.</p></div></div>
      <p className="mt-5 border-t border-[#e8eef5] pt-4 text-sm leading-6 text-[#6b7d93]">Already using the WhatsApp Business phone app? Select that option during connection and follow Meta’s setup steps for your number.</p>
    </section>
    <Modal open={Boolean(connection)} title="Connect WhatsApp" onClose={closeConnection} footer={<Button disabled={connection?.loading || busy === 'connect'} onClick={() => void connect()}>{busy === 'connect' ? 'Waiting for Meta…' : 'Continue with Meta'}</Button>}>
      <p className="text-sm leading-6">Meta will ask you to select a business account and phone number, and confirm the access Arch9 needs for the inbox and campaigns.</p>
      <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#e1e8ef] bg-[#f8fafb] p-4 text-sm leading-6 text-[#425e79]"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#17634d]" checked={coexistence} disabled={busy === 'connect'} onChange={event => setCoexistence(event.target.checked)} />I already use this number in the WhatsApp Business phone app.</label>
      {connection?.loading ? <p role="status" className="mt-4 text-sm">Preparing secure Meta login…</p> : null}
    </Modal>
    <Modal open={Boolean(registration)} title="Activate WhatsApp number" subtitle={registration?.display_phone_number} onClose={busy === 'register' ? undefined : () => { setRegistration(null); setPin('') }} footer={<Button disabled={Boolean(busy) || !/^\d{6}$/.test(pin)} onClick={() => void register()}>{busy === 'register' ? 'Activating…' : 'Activate number'}</Button>}>
      <p className="text-sm leading-6">Enter the six-digit two-step verification PIN for this business number. For a new number, choose a PIN and keep it securely. Arch9 sends it to Meta for registration without saving it.</p>
      <label className="mt-4 grid gap-2 text-sm font-semibold">Registration PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} disabled={Boolean(busy)} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} className="rounded-lg border border-[#dce6ed] p-3 outline-none focus:border-[#6ba78f] focus:ring-2 focus:ring-[#edf7f3]" /></label>
      {error ? <p role="alert" className="mt-3 text-sm text-red-800">{error}</p> : null}
    </Modal>
  </section>
}
