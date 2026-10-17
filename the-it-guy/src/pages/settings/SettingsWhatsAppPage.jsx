import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, RefreshCw } from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { useMetaWorkspace } from '../../hooks/useMetaWorkspace'
import { launchWhatsAppSignup, metaIntegrationRequest, prepareFacebookSdk } from '../../services/metaIntegrationService'
import { SettingsPageHeader, SettingsSectionCard, settingsPageClass } from './settingsUi'

export default function SettingsWhatsAppPage() {
  const workspace = useMetaWorkspace()
  const { organisationId, senders, loading, refresh, canManage } = workspace
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('')
  const [connection, setConnection] = useState(null), [coexistence, setCoexistence] = useState(false)
  const controller = useRef(null), generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort() }, [])
  useEffect(() => {
    invalidate()
    setConnection(null); setError(''); setNotice(''); setBusy('')
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
      setNotice(data.sender.connection_status === 'connected' ? 'WhatsApp connected. This sender is available to the inbox and campaigns.' : 'Account linked. Complete phone-number registration in WhatsApp Manager, then check the connection.')
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
  return <section className={settingsPageClass}>
    <SettingsPageHeader title="WhatsApp" description="Connect your organisation’s business number for the shared inbox and template campaigns." actions={<Button variant="secondary" disabled={loading || Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} />Refresh</Button>} />
    {(error || workspace.error) ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || workspace.error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-900">{notice}</p> : null}
    <SettingsSectionCard title="Business senders" description="One number belongs to one organisation workspace. Connection credentials are kept on the server.">
      {loading ? <p>Loading WhatsApp connections…</p> : senders.length ? <div className="space-y-3">{senders.map(sender => <article key={sender.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
        <div><h3 className="font-semibold">{sender.business_display_name || 'WhatsApp Business'}</h3><p className="text-sm">{sender.display_phone_number} · {sender.connection_status}</p>{sender.last_error_message ? <p className="mt-1 text-sm text-red-700">{sender.last_error_message}</p> : null}</div>
        {canManage ? <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={Boolean(busy)} onClick={() => void manage(sender, 'health_sender')}>Check connection</Button><Button variant="ghost" size="sm" disabled={Boolean(busy) || sender.connection_status === 'disconnected'} onClick={() => void manage(sender, 'disconnect_sender')}>Disconnect</Button></div> : null}
      </article>)}</div> : <p className="text-sm text-slate-600">Connect a WhatsApp Business account to receive messages and choose a campaign sender. You can use Meta’s test number while preparing your real business number.</p>}
      {canManage ? <Button className="mt-4" disabled={Boolean(busy) || loading} onClick={() => void prepare()}><MessageCircle size={16} />Connect WhatsApp</Button> : !loading ? <p className="mt-4 text-sm text-slate-600">An organisation administrator can connect or change a sender.</p> : null}
      <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold text-blue-800"><Link to="/marketing?section=whatsapp&view=inbox">Open inbox</Link><Link to="/marketing?section=whatsapp">Bulk campaigns</Link><a href="https://business.facebook.com/wa/manage/" target="_blank" rel="noreferrer">WhatsApp Manager</a></div>
    </SettingsSectionCard>
    <SettingsSectionCard title="Replies and campaigns" description="The inbox supports replies during the 24 hours after a customer message. Approved templates and recorded WhatsApp consent are used for bulk campaigns.">
      <p className="text-sm text-slate-600">If you already use the WhatsApp Business phone app, choose that option when connecting so Meta can offer the supported onboarding flow. Confirm the number in Meta before completing setup.</p>
    </SettingsSectionCard>
    <Modal open={Boolean(connection)} title="Connect WhatsApp" onClose={closeConnection} footer={<Button disabled={connection?.loading || busy === 'connect'} onClick={() => void connect()}>{busy === 'connect' ? 'Waiting for Meta…' : 'Continue with Meta'}</Button>}>
      <p className="text-sm leading-6">Meta will ask you to select a business account and phone number, and confirm the access Arch9 needs for the inbox and campaigns.</p>
      <label className="mt-5 flex gap-3 text-sm"><input type="checkbox" checked={coexistence} disabled={busy === 'connect'} onChange={event => setCoexistence(event.target.checked)} />I already use this number in the WhatsApp Business phone app.</label>
      {connection?.loading ? <p role="status" className="mt-4 text-sm">Preparing secure Meta login…</p> : null}
    </Modal>
  </section>
}
