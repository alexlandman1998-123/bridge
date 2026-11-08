// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { X } from "lucide-react"
import Field from "../../components/ui/Field"
import { ACTIVITY_TYPES, TASK_PRIORITIES } from "../../lib/agencyPipelineService"

export default function LeadActivityDialog({ LEAD_ACTIVITY_COMPOSER_MODES, LEAD_ACTIVITY_SUGGESTION_CHIPS, activityComposerMode, activityComposerOpen, activityForm, activityOutcomeOptions, agentOptions, closeActivityComposer, editingActivityId, editingTaskId, handleActivityComposerModeChange, handleAppendActivitySuggestion, handleUnifiedActivitySubmit, isActivitySaving, setActivityForm, setTaskForm, taskForm }) {
  return (
<Modal
        open={activityComposerOpen}
        onClose={closeActivityComposer}
        title={editingActivityId ? 'Edit Activity' : editingTaskId ? 'Edit Task' : 'Log Activity'}
        subtitle="Capture interactions, notes, tasks, and follow-ups without leaving the lead workspace."
        className="max-w-3xl"
      >
        <form className="grid gap-4" onSubmit={handleUnifiedActivitySubmit}>
          {editingActivityId || editingTaskId ? (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-xs" onClick={closeActivityComposer}>
                <X className="h-4 w-4" />
                Cancel edit
              </Button>
            </div>
          ) : null}

          <div className="flex gap-1 overflow-x-auto rounded-full bg-[#f3f7fb] p-1">
            {LEAD_ACTIVITY_COMPOSER_MODES.map((mode) => {
              const active = activityComposerMode === mode.key
              return (
                <button
                  key={mode.key}
                  type="button"
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-white text-[#123955] shadow-[0_6px_16px_rgba(31,54,78,0.08)]' : 'text-[#60758b] hover:text-[#123955]'}`}
                  onClick={() => handleActivityComposerModeChange(mode.key)}
                >
                  {mode.label}
                </button>
              )
            })}
          </div>

          {activityComposerMode === 'activity' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field as="select" value={activityForm.activityType} onChange={(event) => setActivityForm((previous) => ({ ...previous, activityType: event.target.value }))}>
                {ACTIVITY_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field as="select" value={activityForm.outcome} onChange={(event) => setActivityForm((previous) => ({ ...previous, outcome: event.target.value }))}>
                {activityOutcomeOptions.map((option) => (
                  <option key={option || 'empty-outcome'} value={option}>
                    {option || 'Outcome'}
                  </option>
                ))}
              </Field>
            </div>
          ) : null}

          {activityComposerMode === 'follow_up' || activityComposerMode === 'task' ? (
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                placeholder={activityComposerMode === 'follow_up' ? 'Follow-up title' : 'Task title'}
                value={taskForm.title}
                onChange={(event) => setTaskForm((previous) => ({ ...previous, title: event.target.value }))}
              />
              <Field type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((previous) => ({ ...previous, dueDate: event.target.value }))} />
              {activityComposerMode === 'task' && agentOptions.length ? (
                <Field as="select" value={taskForm.assignedAgentId} onChange={(event) => setTaskForm((previous) => ({ ...previous, assignedAgentId: event.target.value }))}>
                  <option value="">Assigned agent</option>
                  {agentOptions.map((agent) => (
                    <option key={`${agent.id}:${agent.email}:task`} value={agent.id || agent.email}>
                      {agent.name}
                    </option>
                  ))}
                </Field>
              ) : null}
              <Field as="select" value={taskForm.priority} onChange={(event) => setTaskForm((previous) => ({ ...previous, priority: event.target.value }))}>
                {TASK_PRIORITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
            </div>
          ) : null}

          {activityComposerMode === 'note' ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#60758b]">
              <span className="rounded-full bg-[#eef5fb] px-3 py-1">Internal</span>
              <span className="rounded-full bg-[#f3f7fb] px-3 py-1 text-[#8aa0b7]">Shared visibility coming later</span>
            </div>
          ) : null}

          {activityComposerMode === 'activity' || activityComposerMode === 'note' ? (
            <div className="overflow-hidden rounded-[22px] bg-[#f8fbfd] ring-1 ring-[#e6edf5] transition focus-within:bg-white focus-within:ring-[#b9d5eb]">
              <Field
                as="textarea"
                rows={5}
                className="min-h-[150px] border-0 bg-transparent px-4 py-4 text-[15px] leading-6 shadow-none outline-none ring-0 focus:ring-0"
                placeholder={activityComposerMode === 'note' ? 'Write an internal note...' : 'What happened with this lead?'}
                value={activityForm.activityNote}
                onChange={(event) => setActivityForm((previous) => ({ ...previous, activityNote: event.target.value }))}
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-[22px] bg-[#f8fbfd] ring-1 ring-[#e6edf5] transition focus-within:bg-white focus-within:ring-[#b9d5eb]">
              <Field
                as="textarea"
                rows={4}
                className="min-h-[120px] border-0 bg-transparent px-4 py-4 text-[15px] leading-6 shadow-none outline-none ring-0 focus:ring-0"
                placeholder={activityComposerMode === 'follow_up' ? 'Add context for this follow-up...' : 'Add task notes...'}
                value={taskForm.description}
                onChange={(event) => setTaskForm((previous) => ({ ...previous, description: event.target.value }))}
              />
            </div>
          )}

          {activityComposerMode === 'activity' || activityComposerMode === 'note' ? (
            <div className="flex flex-wrap gap-2">
              {LEAD_ACTIVITY_SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full bg-[#f2f6fa] px-3 py-1.5 text-xs font-semibold text-[#557089] transition hover:bg-[#e7f0f8] hover:text-[#244f70]"
                  onClick={() => handleAppendActivitySuggestion(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-[#edf3f8] pt-4">
            <Button type="button" variant="secondary" onClick={closeActivityComposer}>
              Cancel
            </Button>
            <Button type="submit" disabled={isActivitySaving}>
              {isActivitySaving ? 'Saving...' : editingActivityId ? 'Save Activity' : editingTaskId ? 'Save Task' : activityComposerMode === 'follow_up' ? 'Create Follow-up' : activityComposerMode === 'task' ? 'Create Task' : activityComposerMode === 'note' ? 'Add Note' : 'Log Activity'}
            </Button>
          </div>
        </form>
      </Modal>
  )
}
