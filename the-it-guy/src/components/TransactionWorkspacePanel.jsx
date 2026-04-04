import { Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { TRANSACTION_ROLE_LABELS, TRANSACTION_ROLE_TYPES } from '../lib/api'

const INVITE_ROLE_OPTIONS = [
  { value: 'attorney', label: 'Attorney / Conveyancer' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'client', label: 'Client / Buyer' },
]

const DISCUSSION_TYPES = [
  { value: 'operational', label: 'Operational' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'document', label: 'Document' },
  { value: 'decision', label: 'Decision' },
  { value: 'client', label: 'Client' },
]

function formatDateTime(value) {
  if (!value) {
    return 'Now'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Now'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function parseDiscussionText(rawText) {
  const text = String(rawText || '').trim()
  const match = text.match(/^\[([a-z_ ]+)\]\s*(.+)$/i)

  if (!match) {
    return { type: 'operational', body: text }
  }

  const normalizedType = match[1].trim().toLowerCase().replaceAll(' ', '_')
  const known = DISCUSSION_TYPES.find((item) => item.value === normalizedType)
  return {
    type: known?.value || 'operational',
    body: match[2].trim(),
  }
}

function TransactionWorkspacePanel({
  participants = [],
  activeRole = 'developer',
  onRoleChange,
  statusLink = null,
  onCopyStatusLink,
  onOpenStatusLink,
  discussion = [],
  activityEvents = [],
  discussionBody = '',
  discussionType = 'operational',
  onDiscussionTypeChange,
  onDiscussionBodyChange,
  onSubmitDiscussion,
  onInviteParticipant,
  shareIntent = null,
  canInvite = true,
  canComment = true,
  saving = false,
}) {
  const [workspaceView, setWorkspaceView] = useState('discussion')
  const [discussionFilter, setDiscussionFilter] = useState('all')
  const [inviteForm, setInviteForm] = useState({
    role: 'attorney',
    email: '',
    expiresDays: '14',
  })
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteResult, setInviteResult] = useState(null)
  const [shareOpen, setShareOpen] = useState(false)
  const participantCount = participants.length
  const discussionCount = discussion.length
  const activityCount = activityEvents.length
  const activeRoleLabel = TRANSACTION_ROLE_LABELS[activeRole] || activeRole

  const tabs = useMemo(
    () => [
      { id: 'discussion', label: 'Shared Discussion', count: discussionCount },
      { id: 'participants', label: 'Participants', count: participantCount },
      { id: 'activity', label: 'Activity Log', count: activityCount },
    ],
    [activityCount, discussionCount, participantCount],
  )

  const filteredDiscussion = useMemo(() => {
    if (discussionFilter === 'all') {
      return discussion
    }

    return discussion.filter((item) => {
      const normalizedType = item.discussionType || parseDiscussionText(item.commentText).type
      return normalizedType === discussionFilter
    })
  }, [discussion, discussionFilter])

  useEffect(() => {
    if (!shareIntent?.nonce) {
      return
    }

    setShareOpen(true)
    if (shareIntent.presetRole) {
      setInviteForm((previous) => ({
        ...previous,
        role: shareIntent.presetRole,
      }))
    }
  }, [shareIntent])

  async function handleInviteSubmit(event) {
    event.preventDefault()
    if (!onInviteParticipant || !canInvite || !inviteForm.email.trim()) {
      return
    }

    try {
      setInviteSaving(true)
      setInviteError('')
      const response = await onInviteParticipant({
        role: inviteForm.role,
        email: inviteForm.email.trim(),
        expiresDays: Number(inviteForm.expiresDays) || 14,
      })

      if (response?.url) {
        await navigator.clipboard.writeText(response.url)
      }

      setInviteResult(response || null)
      setInviteForm((previous) => ({ ...previous, email: '' }))
    } catch (error) {
      setInviteError(error?.message || 'Unable to create invite link right now.')
    } finally {
      setInviteSaving(false)
    }
  }

  return (
    <section className="panel-section transaction-workspace-panel">
      <div className="section-header">
        <div className="section-header-copy">
          <h3>Shared Transaction Workspace</h3>
          <p>Participants share one source of truth while each role updates only its own process lane.</p>
        </div>
        <span className="workspace-security-pill">
          <ShieldCheck size={14} />
          Role controlled
        </span>
      </div>

      <div className="workspace-controls-bar no-print">
        <div className="workspace-controls-primary">
          <label className="workspace-role-switch">
            <span>Acting role</span>
            <select value={activeRole} onChange={(event) => onRoleChange?.(event.target.value)}>
              {TRANSACTION_ROLE_TYPES.filter((role) => role !== 'internal_admin').map((role) => (
                <option value={role} key={role}>
                  {TRANSACTION_ROLE_LABELS[role] || role}
                </option>
              ))}
            </select>
          </label>
          <span className="workspace-role-context">
            Focus lane: <strong>{activeRoleLabel}</strong>
          </span>
        </div>

        <div className="workspace-controls-actions">
          <button type="button" className="ghost-button" onClick={() => setShareOpen((previous) => !previous)} disabled={!canInvite}>
            {shareOpen ? 'Close Share' : 'Share Workspace'}
          </button>
          <button type="button" className="ghost-button" onClick={onCopyStatusLink} disabled={!statusLink?.token}>
            <Copy size={14} />
            Copy Link
          </button>
          <button type="button" className="ghost-button" onClick={onOpenStatusLink} disabled={!statusLink?.token}>
            <ExternalLink size={14} />
            Open Status
          </button>
        </div>
      </div>

      {shareOpen ? (
        <section className="workspace-share-panel no-print">
          <div className="workspace-share-head">
            <h4>Share Workspace</h4>
            <p>Invite the next stakeholder with one secure access link.</p>
          </div>

          <div className="workspace-share-presets" role="tablist" aria-label="Invite role presets">
            {INVITE_ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={inviteForm.role === option.value}
                className={inviteForm.role === option.value ? 'active' : ''}
                onClick={() =>
                  setInviteForm((previous) => ({
                    ...previous,
                    role: option.value,
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleInviteSubmit} className="workspace-share-form">
            <label>
              {inviteForm.role === 'client' ? 'Client Email (optional)' : 'Email'}
              <input
                type="email"
                value={inviteForm.email}
                onChange={(event) =>
                  setInviteForm((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
                placeholder="person@example.com"
              />
            </label>
            <label>
              Expires (days)
              <input
                type="number"
                min="1"
                max="90"
                value={inviteForm.expiresDays}
                onChange={(event) =>
                  setInviteForm((previous) => ({
                    ...previous,
                    expiresDays: event.target.value,
                  }))
                }
              />
            </label>
            <button
              type="submit"
              disabled={!canInvite || inviteSaving || (inviteForm.role !== 'client' && !inviteForm.email.trim()) || saving}
            >
              {inviteSaving ? 'Creating...' : 'Create & Copy Link'}
            </button>
          </form>

          {!canInvite ? <p className="empty-text">Client role can view updates but cannot invite additional participants.</p> : null}
          {inviteError ? <p className="status-message error">{inviteError}</p> : null}
          {inviteResult?.url ? (
            <div className="workspace-share-result">
              <span>{inviteResult.message || 'Link generated and copied.'}</span>
              <a href={inviteResult.url} target="_blank" rel="noreferrer">
                Open Link
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="workspace-view-switcher">
        <div className="workspace-view-tabs" role="tablist" aria-label="Workspace view">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={workspaceView === tab.id}
              className={workspaceView === tab.id ? 'active' : ''}
              onClick={() => setWorkspaceView(tab.id)}
            >
              <span>{tab.label}</span>
              <em>{tab.count}</em>
            </button>
          ))}
        </div>
      </div>

      {workspaceView === 'participants' ? (
        <>
          <div className="workspace-participants-grid">
            {participants.map((participant) => (
              <article key={`${participant.transactionId}-${participant.roleType}`} className="workspace-participant-card">
                <span>{participant.roleLabel}</span>
                <strong>{participant.participantName || 'Unassigned'}</strong>
                <em>{participant.participantEmail || 'No email linked'}</em>
              </article>
            ))}
            {participants.length === 0 ? <p className="empty-text">No participants configured yet.</p> : null}
          </div>
        </>
      ) : null}

      {workspaceView === 'discussion' ? (
        <>
          <div className="workspace-discussion-toolbar no-print">
            <label>
              Filter
              <select value={discussionFilter} onChange={(event) => setDiscussionFilter(event.target.value)}>
                <option value="all">All updates</option>
                {DISCUSSION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="workspace-discussion-list">
            {filteredDiscussion.map((comment) => {
              const parsed = parseDiscussionText(comment.commentText)
              const discussionType = comment.discussionType || parsed.type
              const commentBody = comment.commentBody || parsed.body || comment.commentText
              const typeLabel = DISCUSSION_TYPES.find((item) => item.value === discussionType)?.label || 'Operational'

              return (
                <article key={comment.id} className="workspace-discussion-item">
                  <span className="workspace-discussion-node" aria-hidden="true" />
                  <div className="workspace-discussion-body">
                    <header>
                      <div className="workspace-discussion-author">
                        <strong>{comment.authorName}</strong>
                        <span>{comment.authorRoleLabel}</span>
                      </div>
                      <small className={`workspace-discussion-type ${discussionType}`}>{typeLabel}</small>
                      <em>{formatDateTime(comment.createdAt)}</em>
                    </header>
                    <p>{commentBody}</p>
                  </div>
                </article>
              )
            })}
            {filteredDiscussion.length === 0 ? <p className="empty-text">No discussion comments for this filter.</p> : null}
          </div>

          <form onSubmit={onSubmitDiscussion} className="stack-form compact-note-form workspace-compose-form no-print">
            <div className="workspace-compose-head">
              <label>
                Update Type
                <select value={discussionType} onChange={(event) => onDiscussionTypeChange?.(event.target.value)}>
                  {DISCUSSION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={saving || !discussionBody.trim() || !canComment}>
                Post Update
              </button>
            </div>
            <textarea
              rows={3}
              value={discussionBody}
              onChange={(event) => onDiscussionBodyChange?.(event.target.value)}
              placeholder="Add concise shared update. Keep it operational and specific..."
            />
            {!canComment ? <p className="empty-text">Your current role can view updates but cannot post comments.</p> : null}
          </form>
        </>
      ) : null}

      {workspaceView === 'activity' ? (
        <div className="workspace-activity-list">
          {activityEvents.map((event) => (
            <article key={event.id} className="workspace-activity-item">
              <div>
                <small className="workspace-activity-type">
                  {event.type === 'document' ? 'Document' : event.type === 'workflow' ? 'Workflow' : 'Update'}
                </small>
                <strong>{event.title}</strong>
                <p>{event.body || 'No detail provided.'}</p>
              </div>
              <span>{formatDateTime(event.createdAt)}</span>
            </article>
          ))}
          {activityEvents.length === 0 ? <p className="empty-text">No activity has been logged yet.</p> : null}
        </div>
      ) : null}
    </section>
  )
}

export default TransactionWorkspacePanel
