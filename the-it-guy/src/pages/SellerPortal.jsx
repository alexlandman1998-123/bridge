import {
  CheckCircle2,
  Clock3,
  FileSignature,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Tag,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import '../App.css'
import { SellerOnboarding } from './SellerOnboarding'
import {
  activateListingDraft,
  LISTING_STATUS,
  readAgentListingDrafts,
  readAgentPrivateListings,
  readAgentSellerLeads,
  updateAgentSellerLead,
  updateListingDraft,
  writeAgentPrivateListings,
} from '../lib/agentListingStorage'
import { invokeEdgeFunction } from '../lib/supabaseClient'
import {
  normalizeOfferWorkflowStatus,
  OFFER_WORKFLOW_STATUS,
  sellerOfferDecision,
} from '../lib/listingOffersService'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'

const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'onboarding', label: 'Seller Onboarding', icon: FileText },
  { key: 'mandate', label: 'Mandate', icon: FileSignature },
  { key: 'documents', label: 'Seller Documents', icon: FileText },
  { key: 'offers', label: 'Offers Received', icon: Tag },
  { key: 'progress', label: 'Transaction Progress', icon: Clock3 },
]

function toCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function toDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('en-ZA')
}

function toDateTime(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function toLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return 'Not set'
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function buildSectionPath(token, sectionKey, basePath = '') {
  const normalizedBasePath = String(basePath || '').trim().replace(/\/+$/, '')
  if (normalizedBasePath) {
    if (!sectionKey || sectionKey === 'overview') return normalizedBasePath
    return `${normalizedBasePath}/${sectionKey}`
  }
  if (!sectionKey || sectionKey === 'overview') return `/seller/${token}`
  return `/seller/${token}/${sectionKey}`
}

function getActiveSection(pathname) {
  const segments = String(pathname || '').split('/').filter(Boolean)
  let section = segments[2] || 'overview'
  if (segments[0] === 'seller' && segments[1] === 'onboarding') {
    section = 'onboarding'
  }
  if (section === 'property') {
    section = 'onboarding'
  }
  return SECTIONS.some((item) => item.key === section) ? section : 'overview'
}

export function findSellerPortalBundle(token) {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) return { lead: null, draft: null, listing: null }

  const lead = readAgentSellerLeads().find((row) => String(row?.sellerOnboarding?.token || '').trim() === normalizedToken) || null
  const draft = readAgentListingDrafts().find((row) => String(row?.sellerOnboarding?.token || '').trim() === normalizedToken) || null
  const listing = readAgentPrivateListings().find((row) => String(row?.sellerOnboarding?.token || '').trim() === normalizedToken) || null
  return { lead, draft, listing }
}

function emitSellerPortalUpdates() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('itg:listings-updated'))
  window.dispatchEvent(new Event('itg:pipeline-updated'))
  window.dispatchEvent(new Event('itg:transaction-updated'))
}

function ensureMandateDocCompleted(requiredDocuments = [], signedAt, signerName) {
  const rows = Array.isArray(requiredDocuments) ? requiredDocuments : []
  if (!rows.length) return rows

  const signedFileName = `signed-mandate-${new Date(signedAt).toISOString().slice(0, 10)}.pdf`
  return rows.map((doc) => ({
    ...doc,
    status: 'completed',
    fileName: doc?.fileName || (doc?.key === 'mandate_to_sell' ? signedFileName : ''),
    uploadedAt: doc?.uploadedAt || signedAt,
    uploadedByRole: doc?.uploadedByRole || 'seller',
    uploaderName: doc?.uploaderName || signerName || 'Seller',
  }))
}

export function findSellerPortalBundleByIdentity({ email = '', phone = '' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedPhone = String(phone || '').replace(/\D/g, '')
  if (!normalizedEmail && !normalizedPhone) {
    return { lead: null, draft: null, listing: null }
  }

  const matchesIdentity = (record) => {
    const seller = record?.seller || {}
    const onboarding = record?.sellerOnboarding?.formData || {}
    const recordEmail = String(
      onboarding?.email ||
      record?.sellerEmail ||
      seller?.email ||
      '',
    ).trim().toLowerCase()
    const recordPhone = String(
      onboarding?.phone ||
      record?.sellerPhone ||
      seller?.phone ||
      '',
    ).replace(/\D/g, '')
    return (normalizedEmail && recordEmail === normalizedEmail) || (normalizedPhone && recordPhone === normalizedPhone)
  }

  const lead = readAgentSellerLeads().find(matchesIdentity) || null
  const draft = readAgentListingDrafts().find(matchesIdentity) || null
  const listing = readAgentPrivateListings().find(matchesIdentity) || null
  return { lead, draft, listing }
}

export function SellerWorkspace({
  tokenOverride = '',
  basePath = '',
  forcedSection = '',
  embedded = false,
}) {
  const params = useParams()
  const token = String(tokenOverride || params?.token || '').trim()
  const location = useLocation()
  const activeSection = forcedSection || getActiveSection(location.pathname)

  const [bundle, setBundle] = useState(() => findSellerPortalBundle(token))
  const [signName, setSignName] = useState('')
  const [signConfirmed, setSignConfirmed] = useState(false)
  const [changeRequest, setChangeRequest] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setBundle(findSellerPortalBundle(token))
  }, [token])

  const lead = bundle.lead
  const draft = bundle.draft
  const listing = bundle.listing
  const record = listing || draft || lead
  const onboarding = record?.sellerOnboarding || {}
  const formData = onboarding?.formData || {}
  const mandate = record?.mandate || {}
  const offers = Array.isArray(record?.offers) ? record.offers : []
  const requiredDocuments = Array.isArray(record?.requiredDocuments) ? record.requiredDocuments : []
  const sellerFullName = [lead?.sellerName || formData?.sellerFirstName, lead?.sellerSurname || formData?.sellerSurname].filter(Boolean).join(' ').trim() || 'Seller'
  const propertyTitle = formData?.propertyAddress || lead?.propertyAddress || draft?.propertyAddress || listing?.listingTitle || 'Property'
  const agentName = draft?.assignedAgentName || lead?.assignedAgentName || 'Agent'
  const agentEmail = draft?.assignedAgentEmail || lead?.assignedAgentEmail || ''
  const mandateSigned = Boolean(mandate?.signedAt || mandate?.signed)
  const listingActive =
    Boolean(listing) ||
    [LISTING_STATUS.LISTING_ACTIVE, 'active'].includes(String(record?.status || record?.listingStatus || '').trim().toLowerCase())
  const onboardingComplete = ['completed', 'submitted', 'under_review'].includes(String(onboarding?.status || '').trim().toLowerCase())
  const nextAction = !onboardingComplete
    ? {
        title: 'Complete seller onboarding',
        body: 'Finish your seller and property information so your agent can prepare the mandate.',
        to: 'onboarding',
      }
    : !mandate?.sentAt
      ? {
          title: 'Awaiting mandate',
          body: 'Your agent is still preparing mandate terms for review.',
          to: 'progress',
        }
      : !mandateSigned
        ? {
            title: 'Review and sign mandate',
            body: 'Your listing cannot activate until the mandate is signed.',
            to: 'mandate',
          }
        : !listingActive
          ? {
              title: 'Listing activation in progress',
              body: 'Your agent has been notified and is activating your listing now.',
              to: 'progress',
            }
          : {
              title: 'Review offer activity',
              body: 'Your listing is active. Check incoming offers and sale progress here.',
              to: 'offers',
            }

  const progressRows = useMemo(() => {
    const acceptedOffer = offers.find((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status || '')
      return status === OFFER_WORKFLOW_STATUS.ACCEPTED || status === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION
    })
    return [
      {
        label: 'Seller onboarding complete',
        done: ['completed', 'submitted', 'under_review'].includes(String(onboarding?.status || '').trim().toLowerCase()),
        note: onboarding?.completedAt ? `Completed ${toDate(onboarding.completedAt)}` : 'Awaiting completion',
      },
      {
        label: 'Mandate sent',
        done: Boolean(mandate?.sentAt),
        note: mandate?.sentAt ? `Sent ${toDate(mandate.sentAt)}` : 'Awaiting send',
      },
      {
        label: 'Mandate signed',
        done: mandateSigned,
        note: mandate?.signedAt ? `Signed ${toDate(mandate.signedAt)}` : 'Awaiting seller signature',
      },
      {
        label: 'Listing active',
        done: listingActive,
        note: listingActive ? 'Listing is now active and visible to agents' : 'Will activate once mandate is signed',
      },
      {
        label: 'Deal in progress',
        done: Boolean(acceptedOffer),
        note: acceptedOffer ? `Accepted offer from ${acceptedOffer.buyerName || 'buyer'}` : 'No accepted offer yet',
      },
    ]
  }, [listingActive, mandate?.sentAt, mandate?.signedAt, mandateSigned, offers, onboarding?.completedAt, onboarding?.status])

  if (!token) {
    return <main className="portal-shell"><p className="status-message error">Missing seller portal token.</p></main>
  }

  if (!record) {
    return <main className="portal-shell"><p className="status-message error">Seller portal link is invalid or inactive.</p></main>
  }

  async function notifyAgentMandateSigned(signedAt, signedDocumentName) {
    if (!agentEmail) return
    try {
      await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_mandate_signed',
          to: agentEmail,
          agentName,
          sellerName: sellerFullName,
          propertyTitle,
          signedAt,
          signedDocumentName,
        },
      })
    } catch (error) {
      console.error('[Seller Portal] mandate signed notification failed', error)
    }
  }

  async function handleSignMandate() {
    if (!draft) {
      setErrorMessage('Mandate signing is only available while listing is in draft workflow.')
      return
    }
    if (!signConfirmed) {
      setErrorMessage('Please confirm the mandate acknowledgement checkbox.')
      return
    }
    if (!String(signName || '').trim()) {
      setErrorMessage('Please provide your full name to sign the mandate.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      const signedAt = new Date().toISOString()
      const signerName = String(signName || '').trim()
      const signedDocumentName = `signed-mandate-${new Date(signedAt).toISOString().slice(0, 10)}.pdf`

      const updatedDraft = updateListingDraft(draft.id, (row) => {
        const nextRequiredDocuments = ensureMandateDocCompleted(row?.requiredDocuments, signedAt, signerName)
        return {
          ...row,
          stage: LISTING_STATUS.MANDATE_SIGNED,
          mandateStatus: 'signed',
          requiredDocuments: nextRequiredDocuments,
          mandate: {
            ...(row?.mandate || {}),
            signed: true,
            status: 'signed',
            signedAt,
            signedBy: signerName,
            signedDocumentName,
            sellerSignature: signerName,
            signatureType: 'typed',
          },
        }
      })

      if (!updatedDraft) {
        setErrorMessage('Unable to sign mandate right now. Please try again.')
        return
      }

      const activatedListing = activateListingDraft(updatedDraft.id)
      updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
        ...row,
        listingStatus: activatedListing ? LISTING_STATUS.LISTING_ACTIVE : LISTING_STATUS.MANDATE_SIGNED,
        mandateStatus: 'signed',
        mandate: {
          ...(row?.mandate || {}),
          signed: true,
          signedAt,
          signedBy: signerName,
          signedDocumentName,
        },
      }))

      await notifyAgentMandateSigned(signedAt, signedDocumentName)
      emitSellerPortalUpdates()
      setBundle(findSellerPortalBundle(token))
      setStatusMessage(activatedListing
        ? 'Mandate signed successfully. Listing is now active and your agent has been notified.'
        : 'Mandate signed successfully. Your agent has been notified.')
      setSignConfirmed(false)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to sign mandate right now.')
    } finally {
      setSubmitting(false)
    }
  }

  function appendMandateFeedback(type = 'change_request') {
    if (!String(changeRequest || '').trim()) {
      setErrorMessage('Please provide a comment before sending.')
      return
    }

    setErrorMessage('')
    const entry = {
      id: `feedback_${Date.now()}`,
      type,
      message: String(changeRequest || '').trim(),
      createdAt: new Date().toISOString(),
      from: sellerFullName,
    }

    if (draft) {
      updateListingDraft(draft.id, (row) => ({
        ...row,
        mandateStatus: 'changes_requested',
        mandate: {
          ...(row?.mandate || {}),
          status: 'changes_requested',
          sellerFeedback: [...(Array.isArray(row?.mandate?.sellerFeedback) ? row.mandate.sellerFeedback : []), entry],
        },
      }))
    } else if (listing) {
      const rows = readAgentPrivateListings()
      const nextRows = rows.map((row) => {
        if (String(row?.id || '') !== String(listing.id || '')) return row
        return {
          ...row,
          mandateStatus: 'changes_requested',
          mandate: {
            ...(row?.mandate || {}),
            status: 'changes_requested',
            sellerFeedback: [...(Array.isArray(row?.mandate?.sellerFeedback) ? row.mandate.sellerFeedback : []), entry],
          },
        }
      })
      writeAgentPrivateListings(nextRows)
    }

    updateAgentSellerLead(lead?.sellerLeadId || lead?.id || '', (row) => ({
      ...row,
      mandateStatus: 'changes_requested',
      mandate: {
        ...(row?.mandate || {}),
        status: 'changes_requested',
        sellerFeedback: [...(Array.isArray(row?.mandate?.sellerFeedback) ? row.mandate.sellerFeedback : []), entry],
      },
    }))

    setBundle(findSellerPortalBundle(token))
    emitSellerPortalUpdates()
    setStatusMessage(type === 'counter_request' ? 'Counter request sent to agent.' : 'Mandate change request sent to agent.')
    setChangeRequest('')
  }

  async function handleOfferDecision(offerId, nextStatus) {
    if (!listing) return
    setErrorMessage('')
    setStatusMessage('')
    try {
      const decision =
        normalizeOfferWorkflowStatus(nextStatus) === OFFER_WORKFLOW_STATUS.ACCEPTED
          ? 'accept'
          : 'reject'
      const result = sellerOfferDecision({
        offerId,
        decision,
        comment: `Seller decision captured by ${sellerFullName}`,
      })
      setBundle(findSellerPortalBundle(token))
      emitSellerPortalUpdates()
      if (result?.createdTransaction?.onboardingUrl) {
        const buyerEmail = String(result?.offer?.buyer?.email || '').trim()
        const buyerPhone = formatSouthAfricanWhatsAppNumber(result?.offer?.buyer?.phone || '')
        const buyerName = String(result?.offer?.buyer?.fullName || result?.offer?.buyerName || 'Buyer').trim()

        if (buyerEmail) {
          try {
            await invokeEdgeFunction('send-email', {
              body: {
                type: 'buyer_onboarding',
                to: buyerEmail,
                buyerName,
                onboardingLink: result.createdTransaction.onboardingUrl,
                propertyTitle,
                agentName,
              },
            })
          } catch (error) {
            console.error('[Seller Portal] buyer onboarding email failed', error)
          }
        }
        if (buyerPhone) {
          try {
            await sendWhatsAppNotification({
              to: buyerPhone,
              role: 'buyer',
              message: `Hi ${buyerName},\n\nYour offer on ${propertyTitle} was accepted.\n\nComplete your buyer onboarding here:\n${result.createdTransaction.onboardingUrl}\n\n- Bridge`,
            })
          } catch (error) {
            console.error('[Seller Portal] buyer onboarding WhatsApp failed', error)
          }
        }

        if (agentEmail) {
          try {
            await invokeEdgeFunction('send-email', {
              body: {
                type: 'offer_accepted_transaction_created',
                to: agentEmail,
                sellerName: sellerFullName,
                buyerName,
                propertyTitle,
                onboardingLink: result.createdTransaction.onboardingUrl,
              },
            })
          } catch (error) {
            console.error('[Seller Portal] agent acceptance email failed', error)
          }
        }

        setStatusMessage(`Offer accepted. Transaction created and buyer onboarding link generated: ${result.createdTransaction.onboardingUrl}`)
      } else {
        setStatusMessage(decision === 'accept' ? 'Offer accepted.' : 'Offer rejected.')
      }
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to process offer decision right now.')
    }
  }

  function handleOfferCounter(offerId) {
    if (!listing) return
    setErrorMessage('')
    setStatusMessage('')
    try {
      sellerOfferDecision({
        offerId,
        decision: 'counter',
        comment: `Counter requested by ${sellerFullName}`,
      })
      setBundle(findSellerPortalBundle(token))
      emitSellerPortalUpdates()
      setStatusMessage('Counter offer sent to buyer for review.')
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to send counter right now.')
    }
  }

  const content = (
    <>
      <section className="client-portal-hero">
        <div className="client-portal-brand">bridge.</div>
        <h1>Seller Workspace</h1>
        <p className="client-portal-subtitle">
          Review your mandate, manage seller documents, respond to offers, and track progress in one secure portal.
        </p>
        <div className="client-portal-meta">
          <span>{sellerFullName}</span>
          <span>{propertyTitle}</span>
          <span>Agent: {agentName}</span>
        </div>
      </section>

      <nav className="client-portal-nav" aria-label="Seller portal navigation">
        {SECTIONS.map((item) => {
          const Icon = item.icon
          const active = activeSection === item.key
          return (
            <Link key={item.key} className={active ? 'active' : ''} to={buildSectionPath(token, item.key, basePath)}>
              <Icon size={14} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {statusMessage ? (
        <section className="client-portal-message success">{statusMessage}</section>
      ) : null}
      {errorMessage ? (
        <section className="client-portal-message error">{errorMessage}</section>
      ) : null}

      {activeSection === 'overview' ? (
        <section className="space-y-4">
          <section className="client-portal-card space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2>Overview</h2>
                <p>Track your sale readiness, next action, and listing progress from one place.</p>
              </div>
              <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">
                {toLabel(record?.listingStatus || record?.status || 'draft')}
              </span>
            </header>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Assigned agent', agentName],
                ['Current stage', toLabel(record?.listingStatus || record?.status || 'draft')],
                ['Offers received', String(offers.length || 0)],
                ['Mandate status', toLabel(mandate?.status || record?.mandateStatus || 'not_generated')],
              ].map(([label, value]) => (
                <article key={label} className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</p>
                  <p className="mt-1 font-semibold text-[#142132]">{value}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="client-portal-card space-y-4">
              <header>
                <h2>Next required action</h2>
                <p>The most important step to keep your listing moving forward.</p>
              </header>
              <article className="rounded-[16px] border border-[#dbe6f2] bg-[#f7fbff] p-4">
                <p className="text-base font-semibold text-[#142132]">{nextAction.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#607387]">{nextAction.body}</p>
                <div className="mt-4">
                  <Link
                    to={buildSectionPath(token, nextAction.to, basePath)}
                    className="inline-flex items-center rounded-[12px] bg-[#35546c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d]"
                  >
                    Open section
                  </Link>
                </div>
              </article>
            </section>

            <section className="client-portal-card space-y-3">
              <header>
                <h2>Recent updates</h2>
                <p>Mandate, offer, and workflow events linked to your property sale.</p>
              </header>
              {[...progressRows.slice(0, 3)].map((item) => (
                <article key={item.label} className="rounded-[14px] border border-[#dce6f2] bg-white px-3 py-3">
                  <p className="font-semibold text-[#142132]">{item.label}</p>
                  <p className="mt-1 text-sm text-[#607387]">{item.note}</p>
                </article>
              ))}
            </section>
          </div>
        </section>
      ) : null}

      {activeSection === 'onboarding' ? (
        <SellerOnboarding
          embedded
          tokenOverride={token}
          onSubmitted={() => {
            setBundle(findSellerPortalBundle(token))
            emitSellerPortalUpdates()
          }}
        />
      ) : null}

      {activeSection === 'mandate' ? (
        <section className="client-portal-card space-y-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2>Mandate</h2>
              <p>Review your mandate terms. You can sign or request changes.</p>
            </div>
            <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">
              {toLabel(mandate?.status || (mandateSigned ? 'signed' : draft ? 'sent' : 'active'))}
            </span>
          </header>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate type</p>
              <p className="mt-1 font-semibold text-[#142132]">{toLabel(mandate?.type || record?.mandateType || 'sole')}</p>
            </article>
            <article className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">Asking price</p>
              <p className="mt-1 font-semibold text-[#142132]">{toCurrency(mandate?.askingPrice || record?.askingPrice)}</p>
            </article>
            <article className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
              <p className="text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">Mandate period</p>
              <p className="mt-1 font-semibold text-[#142132]">{toDate(mandate?.startDate || record?.mandateStartDate)} → {toDate(mandate?.endDate || record?.mandateEndDate)}</p>
            </article>
          </div>

          <article className="rounded-[16px] border border-[#dce6f2] bg-white p-3">
            <p className="text-xs uppercase tracking-[0.08em] text-[#7b8ca2]">Special conditions</p>
            <p className="mt-1 text-sm text-[#22374d]">{String(mandate?.specialConditions || '').trim() || 'No special conditions captured.'}</p>
          </article>

          {!mandateSigned && draft ? (
            <article className="space-y-3 rounded-[16px] border border-[#dce6f2] bg-white p-4">
              <h3 className="text-base font-semibold text-[#142132]">Sign mandate</h3>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Full name</span>
                <Field value={signName} onChange={(event) => setSignName(event.target.value)} placeholder="Type your full name" />
              </label>
              <label className="flex items-start gap-2 text-sm text-[#35546c]">
                <input type="checkbox" checked={signConfirmed} onChange={(event) => setSignConfirmed(event.target.checked)} className="mt-0.5" />
                <span>I confirm I have reviewed the mandate and agree to these terms.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSignMandate} disabled={submitting}>{submitting ? 'Signing...' : 'Sign mandate'}</Button>
              </div>
            </article>
          ) : (
            <article className="rounded-[16px] border border-[#d8eddf] bg-[#ecfaf1] p-4 text-sm text-[#1f7d44]">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5" />
                <p>
                  Mandate signed on {toDateTime(mandate?.signedAt)}{mandate?.signedBy ? ` by ${mandate.signedBy}` : ''}.
                </p>
              </div>
            </article>
          )}

          <article className="space-y-3 rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <h3 className="text-base font-semibold text-[#142132]">Request changes / leave comment</h3>
            <Field as="textarea" rows={3} value={changeRequest} onChange={(event) => setChangeRequest(event.target.value)} placeholder="Tell your agent what should change in the mandate." />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => appendMandateFeedback('change_request')}>Request changes</Button>
              <Button variant="ghost" onClick={() => appendMandateFeedback('counter_request')}>Counter proposal</Button>
            </div>
          </article>
        </section>
      ) : null}

      {activeSection === 'documents' ? (
        <section className="client-portal-card space-y-4">
          <header>
            <h2>Seller Documents</h2>
            <p>Mandate and compliance documents linked to this listing.</p>
          </header>
          <div className="space-y-2">
            {requiredDocuments.length ? requiredDocuments.map((document) => (
              <article key={document.key || document.label} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5">
                <div>
                  <p className="font-semibold text-[#142132]">{document.label || toLabel(document.key)}</p>
                  <p className="text-sm text-[#607387]">{document.fileName || 'No file name recorded yet'}</p>
                </div>
                <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-xs font-semibold text-[#35546c]">{toLabel(document.status || 'requested')}</span>
              </article>
            )) : (
              <article className="rounded-[14px] border border-dashed border-[#d9e3ef] bg-[#fbfdff] px-4 py-8 text-sm text-[#607387]">
                No seller documents recorded yet.
              </article>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === 'offers' ? (
        <section className="client-portal-card space-y-4">
          <header>
            <h2>Offers Received</h2>
            <p>Review buyer offers and decide whether to accept, reject, or request a counter.</p>
          </header>
          {!listing ? (
            <article className="rounded-[14px] border border-dashed border-[#d9e3ef] bg-[#fbfdff] px-4 py-8 text-sm text-[#607387]">
              Offers become available once your listing is active.
            </article>
          ) : offers.length ? (
            <div className="space-y-3">
              {offers
                .slice()
                .sort((left, right) => new Date(right?.offerDate || 0) - new Date(left?.offerDate || 0))
                .map((offer) => (
                  <article key={offer.id} className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#142132]">{offer.buyerName || 'Buyer'}</p>
                        <p className="mt-1 text-sm text-[#607387]">{toCurrency(offer.offerPrice)} • {offer.conditions || 'Conditions pending'}</p>
                        <p className="mt-1 text-xs text-[#7b8ca2]">Submitted {toDate(offer.offerDate)}</p>
                      </div>
                      <span className="rounded-full border border-[#dbe6f2] bg-[#f7fbff] px-2.5 py-1 text-xs font-semibold text-[#35546c]">
                        {toLabel(normalizeOfferWorkflowStatus(offer.status || OFFER_WORKFLOW_STATUS.SUBMITTED))}
                      </span>
                    </div>
                    {[
                      OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
                      OFFER_WORKFLOW_STATUS.SUBMITTED,
                      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
                    ].includes(normalizeOfferWorkflowStatus(offer.status)) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => handleOfferDecision(offer.id, OFFER_WORKFLOW_STATUS.ACCEPTED)}>Accept</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleOfferDecision(offer.id, OFFER_WORKFLOW_STATUS.REJECTED)}>Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleOfferCounter(offer.id)}>Counter</Button>
                      </div>
                    ) : null}
                  </article>
                ))}
            </div>
          ) : (
            <article className="rounded-[14px] border border-dashed border-[#d9e3ef] bg-[#fbfdff] px-4 py-8 text-sm text-[#607387]">
              No offers received yet.
            </article>
          )}
        </section>
      ) : null}

      {activeSection === 'progress' ? (
        <section className="client-portal-card space-y-4">
          <header>
            <h2>Transaction Progress</h2>
            <p>Track where your listing sits from onboarding to active deal flow.</p>
          </header>
          <div className="space-y-2.5">
            {progressRows.map((item) => (
              <article key={item.label} className={`rounded-[14px] border px-3 py-3 ${item.done ? 'border-[#d8eddf] bg-[#ecfaf1]' : 'border-[#dce6f2] bg-white'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-semibold ${item.done ? 'text-[#1f7d44]' : 'text-[#142132]'}`}>{item.label}</p>
                    <p className="mt-1 text-sm text-[#607387]">{item.note}</p>
                  </div>
                  {item.done ? <CheckCircle2 size={16} className="mt-0.5 text-[#1f7d44]" /> : <Clock3 size={16} className="mt-0.5 text-[#7b8ca2]" />}
                </div>
              </article>
            ))}
          </div>
          <article className="rounded-[14px] border border-[#dbe6f2] bg-[#f7fbff] px-3 py-3 text-sm text-[#35546c]">
            <div className="flex items-start gap-2">
              <Sparkles size={16} className="mt-0.5" />
              <p>Your agent will continue updating progress here once a deal starts from an accepted offer.</p>
            </div>
          </article>
        </section>
      ) : null}

      <footer className="client-portal-footer">
        <div>
          <MessageSquare size={14} />
          Need help? Contact your agent at {agentEmail || 'the details provided in your listing brief'}.
        </div>
      </footer>
    </>
  )

  if (embedded) {
    return <div className="space-y-5">{content}</div>
  }

  return (
    <main className="portal-shell client-portal-shell client-portal-simple">
      {content}
    </main>
  )
}

function SellerPortal() {
  return <SellerWorkspace />
}

export default SellerPortal
