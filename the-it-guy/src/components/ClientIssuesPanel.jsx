import { useState } from 'react'
import { CLIENT_ISSUE_STATUSES, signOffClientIssue, updateClientIssueStatus } from '../lib/api'

function formatDate(timestamp) {
  if (!timestamp) {
    return 'Recently'
  }

  return new Date(timestamp).toLocaleDateString('en-ZA')
}

function ClientIssuesPanel({
  issues = [],
  onUpdated,
  saving,
  embedded = false,
  showHeader = true,
  onSignOff = null,
}) {
  const [error, setError] = useState('')
  const [signingIssueIds, setSigningIssueIds] = useState([])
  const Wrapper = embedded ? 'div' : 'section'

  async function handleStatusChange(issueId, status) {
    try {
      setError('')
      await updateClientIssueStatus(issueId, status)
      if (onUpdated) {
        await onUpdated()
      }
    } catch (statusError) {
      setError(statusError.message)
    }
  }

  async function handleSignOff(issueId) {
    if (!onSignOff) {
      return
    }

    try {
      setError('')
      setSigningIssueIds((previous) => [...previous, issueId])
      await onSignOff(issueId)
      if (onUpdated) {
        await onUpdated()
      }
    } catch (signError) {
      setError(signError?.message || 'Unable to record sign off.')
    } finally {
      setSigningIssueIds((previous) => previous.filter((id) => id !== issueId))
    }
  }

  return (
    <Wrapper className={embedded ? 'request-panel-embedded' : 'panel-section'}>
      {showHeader ? (
        <div className="section-header">
          <div className="section-header-copy">
            <h3>Client Unit Issues</h3>
            <p>Snags submitted through the client portal stay visible here until addressed and signed off.</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="status-message error">{error}</p> : null}

      <ul className="request-list">
        {issues.map((issue) => (
          <li key={issue.id} className="request-row">
            <div className="request-main space-y-2">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-base">{issue.category}</strong>
                <span className="text-[0.72rem] uppercase tracking-[0.08em] text-[#94a7bd]">{issue.status}</span>
              </div>
              <p className="text-sm text-[#4f647a]">{issue.description}</p>
              <div className="text-xs uppercase tracking-[0.08em] text-[#7c8ea4]">
                {issue.location || 'Location not set'} • {issue.priority || 'Priority not set'} • Reported {formatDate(issue.created_at)}
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-[#35546c]">
                {issue.photo_url ? (
                  <a href={issue.photo_url} target="_blank" rel="noreferrer" className="inline-link">
                    View photo
                  </a>
                ) : null}
                {issue.signed_off_at ? (
                  <span className="inline-flex items-center rounded-full border border-[#d7ebdf] bg-[#ecfbf1] px-3 py-1 text-xs text-[#1c7d45]">
                    Signed off by {issue.signed_off_by || 'team'} on {formatDate(issue.signed_off_at)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <label className="request-status">
                Status
                <select
                  value={issue.status}
                  onChange={(event) => void handleStatusChange(issue.id, event.target.value)}
                  disabled={saving}
                >
                  {CLIENT_ISSUE_STATUSES.map((status) => (
                    <option value={status} key={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              {onSignOff && !issue.signed_off_at ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-[14px] border border-[#dde4ee] bg-white px-3 py-1 text-xs font-semibold text-[#35546c] shadow-[0_8px_22px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
                  onClick={() => void handleSignOff(issue.id)}
                  disabled={saving || signingIssueIds.includes(issue.id)}
                >
                  {signingIssueIds.includes(issue.id) ? 'Signing off…' : 'Sign off'}
                </button>
              ) : null}
            </div>
          </li>
        ))}

        {!issues.length ? <li className="empty-text">No client issues submitted yet.</li> : null}
      </ul>
    </Wrapper>
  )
}

export default ClientIssuesPanel
