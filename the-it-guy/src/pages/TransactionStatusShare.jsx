import { AlertCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProgressTimeline from '../components/ProgressTimeline'
import TransactionProgressPanel from '../components/TransactionProgressPanel'
import { fetchTransactionStatusByToken } from '../lib/api'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS } from '../lib/stages'

function formatDateTime(value) {
  if (!value) {
    return 'Recently updated'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatOwnerSummary(summary, fallback) {
  if (!summary) {
    return fallback
  }

  if (summary.waitingStep?.comment) {
    return summary.waitingStep.comment
  }

  if (summary.waitingStep?.step_label) {
    return `Waiting for ${String(summary.waitingStep.step_label).toLowerCase()}`
  }

  return summary.summaryText || fallback
}

function TransactionStatusShare() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusData, setStatusData] = useState(null)

  useEffect(() => {
    let mounted = true

    async function loadStatus() {
      try {
        setLoading(true)
        setError('')
        const data = await fetchTransactionStatusByToken(token)
        if (!mounted) {
          return
        }
        setStatusData(data)
      } catch (loadError) {
        if (!mounted) {
          return
        }
        setError(loadError.message || 'Unable to load status page.')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadStatus()

    return () => {
      mounted = false
    }
  }, [token])

  if (loading) {
    return (
      <main className="status-share-page">
        <section className="status-share-card">
          <p className="status-message">Loading transaction status...</p>
        </section>
      </main>
    )
  }

  if (error || !statusData) {
    return (
      <main className="status-share-page">
        <section className="status-share-card">
          <div className="status-share-error">
            <AlertCircle size={16} />
            <p>{error || 'Status link is unavailable.'}</p>
          </div>
        </section>
      </main>
    )
  }

  const {
    unit,
    buyer,
    stage,
    mainStage,
    latestStatusComment,
    nextStep,
    financeSummary,
    attorneySummary,
    updatedAt,
  } = statusData

  const externalProgressItems = [
    latestStatusComment
      ? {
          id: 'latest-status',
          title: 'Latest shared update',
          body: latestStatusComment,
          createdAt: updatedAt,
        }
      : null,
    nextStep
      ? {
          id: 'next-step',
          title: 'What happens next',
          body: nextStep,
          createdAt: updatedAt,
        }
      : null,
  ].filter(Boolean)

  return (
    <main className="status-share-page">
      <section className="status-share-card">
        <header className="status-share-header">
          <p>bridge.</p>
          <h1>Transaction Status</h1>
          <span>Last updated {formatDateTime(updatedAt)}</span>
        </header>

        <section className="status-share-unit">
          <h2>
            {unit?.development?.name || 'Development'} • Unit {unit?.unit_number || '-'}
          </h2>
          <p>Buyer: {buyer?.name || 'Client record pending'} </p>
          <strong>Current stage: {stageExplainer.clientLabel || MAIN_STAGE_LABELS[mainStage] || mainStage}</strong>
        </section>

        <section className="status-share-timeline">
          <ProgressTimeline currentStage={mainStage} stages={MAIN_PROCESS_STAGES} stageLabelMap={MAIN_STAGE_LABELS} />
        </section>

        <TransactionProgressPanel
          variant="external"
          title="Transaction Progress"
          subtitle="A client-friendly explanation of where the matter is and what comes next."
          mainStage={mainStage}
          subprocesses={[
            financeSummary ? { process_type: 'finance', summary: financeSummary, steps: [] } : null,
            attorneySummary ? { process_type: 'attorney', summary: attorneySummary, steps: [] } : null,
          ].filter(Boolean)}
          comments={externalProgressItems.map((item) => ({
            id: item.id,
            authorName: 'Bridge Workspace',
            commentBody: item.body,
            createdAt: item.createdAt,
            discussionType: 'status',
          }))}
        />

        <section className="status-share-grid">
          <article>
            <span>Latest status comment</span>
            <p>{latestStatusComment || 'No status comment recorded.'}</p>
          </article>
          <article>
            <span>Next step</span>
            <p>{nextStep || 'Next step will be shared soon.'}</p>
          </article>
          <article>
            <span>Finance workflow</span>
            <p>{formatOwnerSummary(financeSummary, 'Finance workflow in progress')}</p>
          </article>
          <article>
            <span>Attorney workflow</span>
            <p>{formatOwnerSummary(attorneySummary, 'Attorney workflow in progress')}</p>
          </article>
        </section>
      </section>
    </main>
  )
}

export default TransactionStatusShare
