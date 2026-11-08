// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import { getAppointmentTypeLabel } from "../../lib/appointmentTypeDefinitions"
import Button from "../../components/ui/Button"
import { appointmentWorkflowActions } from "../../core/appointments/appointmentWorkflow"
import { Pencil, CalendarDays, Clock3, Plus, X } from "lucide-react"
import AppointmentDetailCard from "../../components/appointments/AppointmentDetailCard"
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_PARTICIPANT_ROLES } from "../../lib/agencyPipelineService"
import AppointmentTimeChange from "../../components/appointments/AppointmentTimeChange"
import Field from "../../components/ui/Field"
import { AppointmentOrganisers, AppointmentClients } from "../../components/appointments/AppointmentPeopleFields"
import AddressInput from "../../components/location/AddressInput"
import { getAppointmentTypeTemplate } from "../../services/appointmentTemplateService"
import AppointmentCalendarActions from "../../components/appointments/AppointmentCalendarActions"
import AppointmentDeliveryStatus from "../../components/appointments/AppointmentDeliveryStatus"
import AppointmentWorkActions from "../../components/appointments/AppointmentWorkActions"

export default function LeadAppointmentDialog({ APPOINTMENT_DURATION_OPTIONS, agentOptions, appointmentCanSave, appointmentClientSaving, appointmentClients, appointmentDetailAgent, appointmentDetailCanEdit, appointmentDirectory, appointmentDurationMinutes, appointmentForm, appointmentIsEditing, appointmentManualParticipantOpen, appointmentModalOpen, appointmentNoteOpen, appointmentScheduleLocked, appointmentSchedulerAddressValue, appointmentSchedulerSubtitle, appointmentSchedulerTitle, appointmentSchedulerVerb, appointmentSchedulingInlineError, appointmentSchedulingIntegrity, appointmentSchedulingSubmitting, appointmentTimeWasChanged, appointmentTypeOptions, appointmentUsesTimeChange, appointmentVisibleParticipants, currentAgent, getInitials, handleAddParticipantToDraft, handleAppointmentDurationChange, handleAppointmentLocationChange, handleAppointmentStartTimeChange, handleAppointmentTypeChange, handleCopyAppointmentLink, handleCreateAppointmentClient, handleOpenAppointmentModal, handleRemoveParticipantFromDraft, handleResendAppointmentInvite, handleSaveAppointmentDetail, handleToggleSuggestedAppointmentParticipant, isPrincipal, organisationId, patchAppointmentRecord, resolveAppointmentListingLabel, scheduleRecordsReload, selectedAppointment, selectedAppointmentId, setAppointmentClientSaving, setAppointmentDirectoryRetry, setAppointmentEditMode, setAppointmentForm, setAppointmentManualParticipantOpen, setAppointmentModalOpen, setAppointmentNoteOpen, setAppointmentRefreshRevision, setAppointmentSchedulingError, setAppointmentSchedulingLoading, setAppointmentSchedulingSubmitting, setError, setMessage, setViewingPlanBookingContext }) {
  return (
<Modal
        open={appointmentModalOpen}
        onClose={appointmentClientSaving ? undefined : () => {
          setAppointmentModalOpen(false)
          setAppointmentSchedulingError('')
          setAppointmentSchedulingLoading(false)
          setAppointmentSchedulingSubmitting(false)
          setViewingPlanBookingContext({ leadId: '', propertyId: '' })
        }}
        title={selectedAppointment ? (appointmentIsEditing ? 'Edit appointment' : selectedAppointment.title || getAppointmentTypeLabel(selectedAppointment.appointmentType)) : appointmentSchedulerTitle}
        subtitle={selectedAppointment ? getAppointmentTypeLabel(selectedAppointment.appointmentType) : appointmentSchedulerSubtitle}
        className={`appointment-editor ${appointmentIsEditing ? '!max-w-[1000px]' : 'appointment-detail !max-w-[720px]'}`}
        footer={appointmentIsEditing ? (
          <div className="flex w-full justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={appointmentClientSaving}
                onClick={() => {
                  if (selectedAppointment) { handleOpenAppointmentModal(selectedAppointment); return }
                  setAppointmentModalOpen(false)
                  setAppointmentSchedulingError('')
                  setAppointmentSchedulingLoading(false)
                  setAppointmentSchedulingSubmitting(false)
                  setViewingPlanBookingContext({ leadId: '', propertyId: '' })
                }}
              >
                {selectedAppointment ? 'Cancel edits' : 'Cancel'}
              </Button>
              {!selectedAppointmentId || selectedAppointment?.status === 'draft' ? <Button type="button" variant="secondary" disabled={appointmentClientSaving || appointmentSchedulingSubmitting || Boolean(selectedAppointment?.archivedAt)} onClick={event => handleSaveAppointmentDetail(event, 'draft')}>Save draft</Button> : null}
              {selectedAppointment?.status === 'draft' && !selectedAppointment.archivedAt ? <Button type="button" disabled={appointmentClientSaving || !appointmentCanSave || appointmentSchedulingSubmitting} onClick={event => handleSaveAppointmentDetail(event, 'requested')}>Issue appointment request</Button> : null}
              <Button type="submit" form="appointment-modal-form" disabled={appointmentClientSaving || !appointmentCanSave || appointmentSchedulingSubmitting || Boolean(selectedAppointment && !appointmentWorkflowActions(selectedAppointment, { id: currentAgent.id, canManageCalendar: isPrincipal }).canEdit)}>
                {appointmentSchedulingSubmitting
                  ? (selectedAppointmentId ? 'Saving…' : 'Scheduling…')
                  : (selectedAppointmentId ? 'Save appointment' : `Schedule ${appointmentSchedulerVerb}`)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="ad-footer">
            <Button type="button" variant="secondary" onClick={() => setAppointmentModalOpen(false)}>Close</Button>
            {appointmentDetailCanEdit ? <Button type="button" onClick={() => setAppointmentEditMode(true)}><Pencil size={15} />Edit appointment</Button> : null}
          </div>
        )}
      >
        {!appointmentIsEditing && selectedAppointment ? <AppointmentDetailCard
          appointment={selectedAppointment}
          statusLabel={APPOINTMENT_STATUS_LABELS[selectedAppointment.status] || selectedAppointment.status || 'Requested'}
          agentName={selectedAppointment.assignedAgentName || selectedAppointment.assignedAgentEmail || appointmentDetailAgent?.name || 'Unassigned'}
          listingLabel={resolveAppointmentListingLabel(selectedAppointment.listingId)} canEdit={appointmentDetailCanEdit}
          onAddAttendee={() => { setAppointmentEditMode(true); setAppointmentManualParticipantOpen(true) }}
          onAddNote={() => { setAppointmentEditMode(true); setAppointmentNoteOpen(true) }}
        /> : null}
        {!appointmentIsEditing && selectedAppointment && appointmentUsesTimeChange ? <AppointmentTimeChange
          appointment={selectedAppointment} actor={{ id: currentAgent.id, email: currentAgent.email, name: currentAgent.fullName }}
          onChanged={state => {
            setAppointmentRefreshRevision(value => value + 1)
            if (!state.active && state.history[0]?.status === 'accepted') { setAppointmentModalOpen(false); setMessage('The new appointment time is confirmed.') }
          }}
        /> : null}
        {appointmentIsEditing ? <>

        <form id="appointment-modal-form" className="ae-form" onSubmit={handleSaveAppointmentDetail}>
          {(appointmentSchedulingIntegrity?.softConflicts || []).length ? <section aria-label="Scheduling advice" className="rounded-lg bg-amber-50 p-3 text-sm"><p>Allow time between appointments:</p><ul>{appointmentSchedulingIntegrity.softConflicts.map((warning,index) => <li key={`${warning.type}:${index}`}>{warning.message}</li>)}</ul><p>This advice does not prevent saving.</p></section> : null}
          {selectedAppointment && appointmentForm.expectedRevision !== selectedAppointment.calendarRevision ? <p role="alert">This appointment changed while you were editing. Close and reopen it before saving.</p> : null}
          <div className="ae-columns">
          <div className="ae-main">
          <section className="grid gap-1.5">
              <label className="text-xs font-semibold text-[#60758d]">Appointment type</label>
              <Field as="select" aria-label="Appointment type" value={appointmentForm.appointmentType} disabled={Boolean(selectedAppointment && !appointmentWorkflowActions(selectedAppointment, { id: currentAgent.id, canManageCalendar: isPrincipal }).canEdit)} onChange={(event) => handleAppointmentTypeChange(event.target.value)}>
                <option value="">Select appointment type</option>
                {appointmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
          </section>

          <section className="ae-organiser-section">
            <AppointmentOrganisers form={appointmentForm} agents={agentOptions.filter(agent => agent.status === 'active' || agent.id === appointmentForm.assignedAgentId || agent.id === currentAgent.id)} currentAgentId={currentAgent.id} canChangePrimary={isPrincipal}
              disabled={Boolean(selectedAppointment && !appointmentWorkflowActions(selectedAppointment, { id: currentAgent.id, canManageCalendar: isPrincipal }).canEdit)} onChange={setAppointmentForm} />
          </section>
          <section className="ae-full-row">
            <AppointmentClients form={appointmentForm} clients={appointmentClients} loading={appointmentDirectory.loading} loadError={appointmentDirectory.error} onRetry={() => setAppointmentDirectoryRetry(value => value + 1)} onChange={setAppointmentForm} onCreate={handleCreateAppointmentClient} onCreatingChange={setAppointmentClientSaving} />
          </section>
          <section className="grid gap-3">
            <p className="text-sm font-semibold text-[#102033]">When</p>
            {appointmentScheduleLocked ? <p className="ae-time-note">To move this booking, return to its details and choose Request a new time. Save other edits here.</p> : null}
            <fieldset disabled={appointmentScheduleLocked} className="m-0 min-w-0 border-0 p-0">
            <div className="ae-time-fields">
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Date
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f839c]" />
                  <Field
                    type="date"
                    className="pl-10"
                    value={appointmentForm.date}
                    onChange={(event) => setAppointmentForm((previous) => ({ ...previous, date: event.target.value }))}
                  />
                </div>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Start time
                <div className="relative">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f839c]" />
                  <Field
                    type="time"
                    className="pl-10"
                    value={appointmentForm.startTime}
                    disabled={appointmentForm.allDay}
                    onChange={(event) => handleAppointmentStartTimeChange(event.target.value)}
                  />
                </div>
              </label>
              <div className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
                Duration
                <div className="ae-duration-picker" style={{ gridTemplateColumns: `repeat(${new Set([...APPOINTMENT_DURATION_OPTIONS, appointmentDurationMinutes]).size}, minmax(0, 1fr))` }}>
                  {[...new Set([...APPOINTMENT_DURATION_OPTIONS, appointmentDurationMinutes])].sort((a, b) => a - b).map((duration) => {
                    const selected = appointmentDurationMinutes === duration
                    return (
                      <button
                        key={duration}
                        type="button"
                        aria-pressed={selected}
                        className="ae-duration-choice"
                        onClick={() => handleAppointmentDurationChange(duration)}

                      >
                        {duration} min
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            </fieldset>
            {appointmentTimeWasChanged && !appointmentScheduleLocked && selectedAppointment && (selectedAppointment.hasConfirmedReservation || selectedAppointment.status === 'confirmed') ? <p className="ae-time-note">Changing the time sends a reschedule proposal. The current time stays reserved until required attendees approve. Save other edits separately.</p> : null}
            {appointmentSchedulingInlineError ? (
              <p className="text-xs text-[#9f3028]">{appointmentSchedulingInlineError}</p>
            ) : null}
          </section>

          <section className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-[#60758d]">
              Address
              <AddressInput
                placeholder="Property address"
                value={appointmentSchedulerAddressValue}
                onChange={(event) => handleAppointmentLocationChange(event.target.value)}
              />
            </label>
          </section>

          </div>
          <aside className="ae-aside" aria-label="Attendees and notes">
          <details className="ae-extra-guests"><summary>Other guests</summary>
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#102033]">Attendees <span className="font-normal text-[#7a8da3]">(optional)</span></p>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f7b4e]"
                onClick={() => setAppointmentManualParticipantOpen((previous) => !previous)}
              >
                <Plus size={16} />
                Add attendee
              </button>
            </div>
            {appointmentVisibleParticipants.length ? (
              <div className="space-y-2">
                {appointmentVisibleParticipants.map((participant) => {
                  const label = participant.name || participant.email || 'Attendee'
                  const roleLabel = participant.participantRole || participant.role || 'Attendee'
                  const removeParticipant = participant.source === 'suggested'
                    ? () => handleToggleSuggestedAppointmentParticipant(participant)
                    : () => handleRemoveParticipantFromDraft(participant.sourceIndex)
                  return (
                    <button
                      key={participant.key}
                      type="button"
                      onClick={removeParticipant}
                      className="flex w-full items-center gap-3 rounded-[14px] border border-[#dce6f2] bg-white px-3 py-2.5 text-left transition hover:border-[#bfd0e2] hover:bg-[#fbfdff]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#edf5ef] text-xs font-bold text-[#1f5d37]">
                        {getInitials(label)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#102033]">{label}</span>
                        <span className="mt-0.5 inline-flex items-center gap-2 text-xs text-[#60758d]">
                          <span className="rounded-full bg-[#eef3f7] px-2 py-0.5 font-semibold text-[#50677d]">{roleLabel}</span>
                          {participant.source === 'suggested' ? <span>Suggested</span> : null}
                        </span>
                      </span>
                      <X size={14} className="shrink-0 text-[#7a8da3]" />
                    </button>
                  )
                })}
              </div>
            ) : null}
            {appointmentManualParticipantOpen ? (
              <div className="rounded-[16px] border border-[#dce6f2] bg-[#fbfdff] p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field placeholder="Name" value={appointmentForm.participantDraft?.name || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, name: event.target.value } }))} />
                  <Field placeholder="Email" value={appointmentForm.participantDraft?.email || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, email: event.target.value } }))} />
                  <Field placeholder="Phone" value={appointmentForm.participantDraft?.phone || ''} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, phone: event.target.value } }))} />
                  <Field as="select" value={appointmentForm.participantDraft?.participantRole || 'Buyer'} onChange={(event) => setAppointmentForm((previous) => ({ ...previous, participantDraft: { ...previous.participantDraft, participantRole: event.target.value } }))}>
                    {APPOINTMENT_PARTICIPANT_ROLES.map((roleOption) => (
                      <option key={roleOption} value={roleOption}>
                        {roleOption}
                      </option>
                    ))}
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setAppointmentManualParticipantOpen(false)}>
                    Done
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleAddParticipantToDraft}>
                    Add attendee
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          </details>
          {appointmentNoteOpen ? <section className="grid gap-3">
            <p className="text-sm font-semibold text-[#102033]">Notes <span className="font-normal text-[#7a8da3]">(optional)</span></p>
            <Field
              as="textarea"
              rows={3}
              placeholder="Add an optional note..."
              autoFocus={appointmentNoteOpen && !appointmentForm.notes}
              value={appointmentForm.notes}
              onChange={(event) => setAppointmentForm((previous) => ({ ...previous, notes: event.target.value.slice(0, 500) }))}
              className="min-h-[86px]"
            />
          </section> : <button type="button" className="ad-add" onClick={() => setAppointmentNoteOpen(true)}><Plus size={15} />Add note</button>}
          {(selectedAppointment?.clientFeedback || selectedAppointment?.agentNotes || selectedAppointment?.outcomeSummary) ? <section className="ae-comments"><h4>Comments</h4><p>{selectedAppointment.clientFeedback || selectedAppointment.agentNotes || selectedAppointment.outcomeSummary}</p></section> : null}
          </aside>
          </div>
        </form>
        </> : null}
          <details className="ae-options" key={`delivery:${selectedAppointmentId || 'new'}`}>
            <summary>More options</summary>
            <div className="ae-options-body">
          {appointmentIsEditing ? <>
          <section className="grid gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={appointmentForm.sendInviteEmails !== false} onChange={(event) => setAppointmentForm(previous => ({ ...previous, sendInviteEmails: event.target.checked }))} />
              Send appointment invitations and updates
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={appointmentForm.remindersEnabled !== false} onChange={(event) => setAppointmentForm(previous => ({ ...previous, remindersEnabled: event.target.checked }))} />
              Send reminders
            </label>
            <label className="grid gap-1 text-sm">
              Reminder schedule
              <Field as="select" disabled={appointmentForm.remindersEnabled === false}
                value={appointmentForm.reminderRules?.length === 1 && appointmentForm.reminderRules[0].offsetMinutes === 30 ? '30m' : 'defaults'}
                onChange={(event) => setAppointmentForm(previous => ({ ...previous, reminderRules: event.target.value === '30m'
                  ? [{ reminderType: 'custom_30m', offsetMinutes: 30 }] : getAppointmentTypeTemplate(previous.appointmentType).reminderRules }))}>
                <option value="defaults">Appointment type defaults</option>
                <option value="30m">30 minutes before only</option>
              </Field>
            </label>
          </section>

          </> : null}
            {selectedAppointment ? <div className="ae-sharing">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleCopyAppointmentLink}>Copy Link</Button>
                {appointmentWorkflowActions(selectedAppointment, { id: currentAgent.id, canManageCalendar: isPrincipal }).canEdit && selectedAppointment.reservationState !== 'needs_follow_up' && selectedAppointment.listingViewingRoundNumber == null && selectedAppointment.attorneyDeliveryEnabled == null ? <Button type="button" variant="secondary" size="sm" onClick={() => handleResendAppointmentInvite(false)}>Resend Invite</Button> : null}
              </div>
              <AppointmentCalendarActions appointment={selectedAppointment} compact preferServerGeneration onError={(calendarError) => setError(calendarError?.message || 'Calendar invite could not be generated.')} />
              <AppointmentDeliveryStatus appointment={selectedAppointment} viewerKey={`${organisationId}:${currentAgent.id}`} />
            </div> : null}
          {selectedAppointment ? <AppointmentWorkActions key={`${organisationId}:${currentAgent.id}:${selectedAppointment.appointmentId}`}
            timeChangesHandled={appointmentUsesTimeChange} appointment={selectedAppointment} organisationId={organisationId} actor={{ id: currentAgent.id, email: currentAgent.email, name: currentAgent.fullName, canManageCalendar: isPrincipal }}
            onSaved={saved => { patchAppointmentRecord(saved.appointmentId, saved); setMessage(saved.archivedAt ? 'Appointment archived. History is preserved.' : 'Appointment action saved.'); setAppointmentModalOpen(false); scheduleRecordsReload(organisationId, 250) }} /> : null}
            </div>
          </details>

	      </Modal>
  )
}
