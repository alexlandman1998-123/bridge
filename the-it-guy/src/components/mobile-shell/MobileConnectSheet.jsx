import { useEffect, useState } from 'react'
import { Copy, QrCode, Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { buildAgencyAgentCardUrls, loadAgencyAgentCardLink } from '../../services/agencyPublicIntakeLinkService.js'
import { createAgentDigitalCardQrDataUrl } from '../../services/agentDigitalCardShareService.js'
import Modal from '../ui/Modal.jsx'
import './mobile-connect-sheet.css'

const text = value => String(value || '').trim()

export default function MobileConnectSheet({ workspace, onClose }) {
  const context = useOptionalOrganisation()
  const navigate = useNavigate()
  const profile = workspace.profile || {}
  const membership = workspace.currentMembership || {}
  const organisationId = text(context?.organisation?.id || context?.organisation?.organisationId || workspace.currentWorkspace?.organisationId || workspace.currentWorkspace?.organisation_id || workspace.currentWorkspace?.id || workspace.workspace?.id)
  const identities = [...new Set([profile.id, profile.userId, profile.user_id, membership.userId, membership.user_id, membership.id, workspace.user?.id].map(text).filter(Boolean))].join('|')
  const scope = `${organisationId}:${identities}`
  const [state, setState] = useState({ scope: '', loading: true })
  const [attempt, setAttempt] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const [failedPhoto, setFailedPhoto] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        if (!organisationId || !identities) throw new Error('Select your agency workspace to open your contact card.')
        let result
        for (const agentUserId of identities.split('|')) {
          result = await loadAgencyAgentCardLink({ organisationId, agentUserId })
          if (result?.link || result?.missingSchema) break
        }
        const link = result?.link
        const ready = link?.isAgentDigitalCard && link.organisationId === organisationId && identities.split('|').includes(link.defaultAssignedAgentId) && link.status === 'active' && !link.disabledAt
        const url = ready ? buildAgencyAgentCardUrls({ slug: link.slug }).cardUrl : ''
        const qr = url && link.agentDigitalCard?.features?.qr !== false
          ? await createAgentDigitalCardQrDataUrl(url, { width: 720, margin: 4, darkColor: '#142820' }) : ''
        if (active) setState({ scope, loading: false, link: ready && url ? link : null, url, qr })
      } catch {
        if (active) setState({ scope, loading: false, error: 'We couldn’t load your contact card. Please try again.' })
      }
    }
    void load()
    return () => { active = false }
  }, [organisationId, identities, scope, attempt])

  const current = state.scope === scope ? state : { loading: true }
  const card = current.link?.agentDigitalCard || {}
  const agent = card.agent || {}
  const name = text(agent.name) || text(profile.fullName) || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Your contact card'
  const agency = text(context?.branding?.organisationLabel || context?.organisation?.name || workspace.workspace?.name || workspace.currentWorkspace?.name)
  const photo = /^https?:\/\//i.test(agent.avatarUrl || '') ? agent.avatarUrl : ''
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const retry = () => { setState({ scope, loading: true }); setAttempt(value => value + 1) }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(current.url)
      setManualCopy(false)
      setFeedback('Card link copied')
    } catch {
      setManualCopy(true)
      setFeedback('Select and copy the link below.')
    }
  }
  async function shareCard() {
    if (!navigator.share) { await copyLink(); return }
    try {
      await navigator.share({ title: `${name}${agency ? ` · ${agency}` : ''}`, text: 'Save my contact details.', url: current.url })
      setFeedback('Card shared')
    } catch (error) {
      if (error.name !== 'AbortError') setFeedback('Sharing couldn’t open. Use Copy link instead.')
    }
  }

  return <Modal open onClose={onClose} title="Connect with me" className="mobile-connect-sheet">
    {current.loading ? <div className="mobile-connect-state" role="status"><QrCode size={32} aria-hidden="true" /><p>Preparing your contact card…</p></div>
      : current.error ? <div className="mobile-connect-state" role="alert"><p>{current.error}</p><button type="button" onClick={retry}>Try again</button></div>
        : !current.link ? <div className="mobile-connect-state"><QrCode size={36} aria-hidden="true" /><h2>Your card isn’t ready yet</h2><p>Activate your digital card from your desktop dashboard, then share it here.</p><button type="button" onClick={() => { onClose(); navigate('/dashboard') }}>Open dashboard</button><button type="button" className="mobile-connect-refresh" onClick={retry}>Check again</button></div>
          : <>
            <div className="mobile-connect-identity">
              {agency && <p className="mobile-connect-agency">{agency}</p>}
              <div className="mobile-connect-person">
                <div className="mobile-connect-avatar">{photo && failedPhoto !== photo ? <img src={photo} alt="" onError={() => setFailedPhoto(photo)} /> : <span aria-hidden="true">{initials}</span>}</div>
                <div><h2>{name}</h2>{agent.jobTitle && <p>{agent.jobTitle}</p>}</div>
              </div>
            </div>
            <div className="mobile-connect-content">
              {current.qr ? <><div className="mobile-connect-qr"><img src={current.qr} alt={`Scan to open ${name}’s digital contact card`} width="240" height="240" /></div><h3>{card.features?.vcf === false ? 'Scan to view my card' : 'Scan to save my contact'}</h3><p>Open your camera and point it at the code.{card.features?.vcf !== false && <> Then tap <strong>Save Contact</strong>.</>}</p></> : <div className="mobile-connect-qr-disabled"><QrCode size={32} aria-hidden="true" /><p>QR sharing is turned off for this card.</p></div>}
              {card.features?.share !== false && <div className="mobile-connect-actions"><button type="button" onClick={() => void shareCard()}><Share2 size={17} aria-hidden="true" />Share card</button><button type="button" onClick={() => void copyLink()}><Copy size={17} aria-hidden="true" />Copy link</button></div>}
              <p className="mobile-connect-feedback" role="status" aria-live="polite">{feedback}</p>
              {manualCopy && <input className="mobile-connect-link" aria-label="Card link" readOnly value={current.url} onFocus={event => event.target.select()} />}
            </div>
          </>}
  </Modal>
}
