import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AgentCalendarBoard from './AgentCalendarBoard'
import useCalendarRead from '../../hooks/useCalendarRead'
import { sastDateKey } from '../../core/appointments/attorneyCalendarModel'
import { loadWorkspaceMarketingCalendar } from '../../services/workspaceCalendarService'
import { marketingCalendarRows, workspaceMarketingDestination } from './agentCalendarDisplay'

const tabs = [['all', 'All'], ['appointments', 'Appointments'], ['marketing', 'Marketing']]

export default function WorkspaceCalendar({ organisationId, viewerKey, appointmentLoad, ...board }) {
  const [category, setCategory] = useState('all')
  const id = useId(), navigate = useNavigate()
  const from = board.days.length ? sastDateKey(board.days[0]) : ''
  const to = board.days.length ? sastDateKey(board.days[board.days.length - 1]) : ''
  const marketing = useCalendarRead({
    scopeKey: JSON.stringify(['workspace-marketing', organisationId, viewerKey, from, to]),
    enabled: Boolean(organisationId && viewerKey && from && to) && category !== 'appointments',
    reconcile: false, timeoutMs: 25000,
    read: signal => loadWorkspaceMarketingCalendar(organisationId, { from, to, signal }),
  })
  const includeAppointments = category !== 'marketing', includeMarketing = category !== 'appointments'
  const warnings = marketing.data?.warnings || []
  const marketingRows = includeMarketing ? marketingCalendarRows(marketing.data?.items || [], board.days) : []
  const appointments = [...(includeAppointments ? board.appointments : []), ...marketingRows]
  const verified = (!includeAppointments || board.hasSnapshot) && (!includeMarketing || (marketing.hasSnapshot && !warnings.length && !marketing.error))
  const changeTab = value => setCategory(value)
  function keyDown(event, index) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
    if (next === null) return
    event.preventDefault(); changeTab(tabs[next][0]); document.getElementById(`${id}-${tabs[next][0]}`)?.focus()
  }
  return <div className="workspace-calendar">
    <div className="ac-category-tabs" role="tablist" aria-label="Calendar categories">
      {tabs.map(([key, label], index) => <button type="button" role="tab" key={key} id={`${id}-${key}`} aria-selected={category === key} tabIndex={category === key ? 0 : -1} aria-controls={`${id}-panel`} onKeyDown={event => keyDown(event, index)} onClick={() => changeTab(key)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${category}`}>
      {includeAppointments && appointmentLoad.status === 'loading' ? <p role="status">{appointmentLoad.hasSnapshot ? 'Refreshing appointments…' : 'Loading appointments…'}</p> : null}
      {includeAppointments && appointmentLoad.error ? <div role="alert">{appointmentLoad.error} {appointmentLoad.hasSnapshot ? 'Showing the last verified schedule.' : 'Appointment counts are unavailable.'} <button type="button" className="ac-button" onClick={appointmentLoad.reload}>Retry appointments</button></div> : null}
      {includeMarketing ? <div className="ac-marketing-read">
        {marketing.status === 'loading' ? <span role="status">Loading marketing…</span> : null}
        {marketing.error || warnings.length ? <p role="alert">{marketing.error || warnings.join(' ')} Showing available events; totals are incomplete.</p> : null}
        <button type="button" className="ac-button" disabled={marketing.status === 'loading'} onClick={marketing.reload}>Refresh marketing</button>
        <button type="button" className="ac-button" onClick={() => navigate('/marketing?section=campaigns&page=calendar')}>Open marketing calendar</button>
      </div> : null}
      {category === 'all' ? <p className="ac-filter-help">Agent and record filters apply to appointments. Marketing shows items you can access in this workspace.</p> : null}
      <AgentCalendarBoard {...board} key={category} onCreateMarketing={() => navigate('/marketing?section=campaigns&view=create')} appointments={appointments} category={category} hasSnapshot={verified}
        isPrincipal={includeAppointments && board.isPrincipal} agentFilter={includeAppointments ? board.agentFilter : 'all'}
        onOpen={row => row.calendarSource === 'marketing' ? navigate(workspaceMarketingDestination(row.marketingItem)) : board.onOpen(row)} />
    </div>
  </div>
}
