import { CalendarClock, Eye, Users } from 'lucide-react'
import CommercialPlaceholderPage from './CommercialPlaceholderPage'

function CommercialViewingsPage() {
  return (
    <CommercialPlaceholderPage
      title="Viewings"
      description="Coordinate commercial property inspections, site visits, broker attendance, buyer tours, and tenant viewing feedback."
      cards={[
        { title: 'Upcoming Viewings', description: 'Track scheduled site visits by client, broker, property, and vacancy.', icon: CalendarClock },
        { title: 'Viewing Feedback', description: 'Capture tenant or buyer feedback, objections, shortlists, and next actions.', icon: Eye },
        { title: 'Broker Attendance', description: 'Prepare viewing ownership, handover notes, and post-viewing follow-up.', icon: Users },
      ]}
    />
  )
}

export default CommercialViewingsPage
