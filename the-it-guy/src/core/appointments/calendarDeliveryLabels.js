const timeChangeLabels = {
  requested: 'New time requested', proposed: 'New time proposed', confirmed: 'New time confirmed',
  declined: 'Current time kept', withdrawn: 'Time request withdrawn', expired: 'Time request expired',
  accepted: 'Proposed time accepted', declined_proposal: 'Proposed time declined', counter_requested: 'Another time requested',
}
export const calendarTimeChangeLabel = action => timeChangeLabels[action] || 'Time change updated'
export function calendarDeliveryLabel(kind = '') {
  if (kind.startsWith('time_change:')) return calendarTimeChangeLabel(kind.split(':')[1])
  return kind.startsWith('reminder:') ? 'Reminder' : 'Appointment update'
}
