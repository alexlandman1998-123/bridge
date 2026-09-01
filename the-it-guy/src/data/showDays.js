export const showDaysStats = [
  { id: 'show-days', label: 'Show Days', value: '8', detail: 'This month' },
  { id: 'registrations', label: 'Registrations', value: '124', detail: 'This month' },
  { id: 'attendees', label: 'Attendees', value: '356', detail: 'This month' },
  { id: 'attendance', label: 'Attendance Rate', value: '62%', detail: 'This month' },
]

export const showDaysTabs = ['All Show Days', 'Upcoming', 'Completed', 'Cancelled']

export const showDays = [
  {
    id: 'constantia-park',
    title: '3 Bedroom Home in Constantia Park',
    address: '123 Acacia Street, Constantia Park, Pretoria',
    date: '3 May 2026',
    dayDate: '3 May 2026 (Sunday)',
    time: '10:00 – 14:00',
    registrations: '28',
    attendees: '18',
    confirmed: '15',
    interestedLeads: '6',
    attendanceRate: '62%',
    status: 'Upcoming',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=520&q=84',
    imageAlt: 'Modern family home in Constantia Park',
  },
  {
    id: 'silver-lakes',
    title: 'Modern Family Home in Silver Lakes',
    address: '45 Lake View Drive, Silver Lakes, Pretoria',
    date: '27 Apr 2026',
    time: '10:00 – 14:00',
    registrations: '32',
    attendees: '22',
    confirmed: '19',
    interestedLeads: '8',
    attendanceRate: '69%',
    status: 'Completed',
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=520&q=84',
    imageAlt: 'Bright modern family home interior in Silver Lakes',
  },
  {
    id: 'waterkloof',
    title: 'Luxury Villa in Waterkloof',
    address: '8 Ridge Road, Waterkloof, Pretoria',
    date: '10 May 2026',
    time: '10:00 – 14:00',
    registrations: '0',
    attendees: '0',
    confirmed: '0',
    interestedLeads: '0',
    attendanceRate: '0%',
    status: 'Draft',
    image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=520&q=84',
    imageAlt: 'Luxury villa in Waterkloof',
  },
]

export const showDayDetail = {
  ...showDays[0],
  hostAgent: 'Alex van der Merwe',
  hostInitials: 'AM',
  contactNumber: '082 123 4567',
  email: 'alex@homeseekers.co.za',
  description: 'Beautiful family home with open-plan living, modern finishes and a spacious garden. Come view and experience the lifestyle.',
}

export const showDayDetailTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'registrations', label: 'Registrations', count: 28 },
  { id: 'attendees', label: 'Attendees', count: 18 },
  { id: 'leads', label: 'Leads', count: 6 },
  { id: 'activity', label: 'Activity' },
  { id: 'promote', label: 'Promote' },
]

export const showDayChecklist = [
  { label: 'Property prepared', status: 'Completed' },
  { label: 'Marketing published', status: 'Completed' },
  { label: 'Signs & banners', status: 'Pending' },
  { label: 'Reminders sent', status: 'Scheduled' },
  { label: 'Follow-up', status: 'Pending' },
]

export const showDayPlaceholderTabs = {
  registrations: { title: 'Registrations', description: 'A future registration workspace for every visitor and RSVP.', fields: ['Visitor name', 'Mobile number', 'Email', 'Registration date', 'RSVP status'] },
  attendees: { title: 'Attendees', description: 'A future on-site attendance and check-in workspace.', fields: ['Checked in', 'Check-in time', 'Accompanied by', 'Interest level'] },
  leads: { title: 'Leads', description: 'A future bridge from show-day engagement into the CRM.', fields: ['Generated leads', 'Qualification', 'Assigned agent', 'CRM lead status', 'Property interest'] },
  activity: { title: 'Activity', description: 'A future operational timeline for this show day.', fields: ['Event created', 'Reminders sent', 'Registrations', 'Check-ins', 'Follow-ups', 'Agent actions'] },
  promote: { title: 'Promote', description: 'A future launchpad for campaign and public registration tools.', fields: ['WhatsApp campaign', 'Email campaign', 'Public registration link', 'QR code', 'Social sharing'] },
}
