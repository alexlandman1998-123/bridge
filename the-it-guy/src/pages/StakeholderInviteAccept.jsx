import { CheckCircle2, Mail } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { acceptStakeholderInvite } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabaseClient'

function StakeholderInviteAccept() {
  const { token } = useParams()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function handleAcceptInvite() {
    if (!token) return
    try {
      setSaving(true)
      setError('')
      const participant = await acceptStakeholderInvite({ invitationToken: token })
      setResult(participant || null)
    } catch (acceptError) {
      setError(acceptError.message || 'Unable to accept this invitation.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="status-message error">Supabase is not configured for this workspace.</p>
  }

  return (
    <section className="mx-auto max-w-[720px] space-y-4 rounded-[22px] border border-borderDefault bg-surface p-6 shadow-surface">
      <div className="space-y-1.5">
        <span className="text-label font-semibold uppercase text-textMuted">Bridge Collaboration</span>
        <h1 className="text-page-title font-semibold text-textStrong">Stakeholder Invitation</h1>
        <p className="text-secondary text-textMuted">
          Accept this invite to get access to the transaction workspace and collaboration timeline.
        </p>
      </div>

      {!result ? (
        <div className="space-y-3 rounded-control border border-borderSoft bg-surfaceAlt p-4">
          <p className="text-secondary text-textBody">
            You are about to accept stakeholder access for token:
            <span className="ml-2 font-mono text-helper text-textMuted">{token || 'missing-token'}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleAcceptInvite()} disabled={saving || !token}>
              {saving ? 'Accepting…' : 'Accept Invitation'}
            </Button>
            <Link to="/transactions" className="inline-flex items-center rounded-control border border-borderDefault bg-surface px-3 py-2 text-secondary font-semibold text-textStrong">
              Back to Transactions
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-control border border-success/30 bg-successSoft p-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 size={16} />
            <strong className="text-body font-semibold">Invitation accepted</strong>
          </div>
          <p className="text-secondary text-textBody">
            You now have access as <strong>{result.roleLabel || result.roleType || 'Stakeholder'}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            {result.transactionId ? (
              <Link
                to={`/transactions/${result.transactionId}`}
                className="inline-flex items-center rounded-control border border-success/30 bg-surface px-3 py-2 text-secondary font-semibold text-success"
              >
                Open Transaction Workspace
              </Link>
            ) : null}
            <Link to="/transactions" className="inline-flex items-center rounded-control border border-borderDefault bg-surface px-3 py-2 text-secondary font-semibold text-textStrong">
              Go to Transactions
            </Link>
          </div>
        </div>
      )}

      {error ? (
        <p className="rounded-control border border-danger/30 bg-dangerSoft px-3 py-2 text-secondary text-danger">
          {error}
        </p>
      ) : null}

      <p className="inline-flex items-center gap-2 text-helper text-textMuted">
        <Mail size={14} />
        If this invite was sent by mistake, contact the transaction owner.
      </p>
    </section>
  )
}

export default StakeholderInviteAccept
