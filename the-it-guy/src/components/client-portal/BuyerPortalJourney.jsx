import TransactionJourneyTracker from '../transaction/TransactionJourneyTracker'
import { createBuyerPortalTheme } from './buyerPortalTheme'

export default function BuyerPortalJourney({
  model,
  theme: themeInput,
  title = 'Your progress',
  subtitle = 'Reservation, offer, finance, transfer, registration, keys.',
  action = null,
  variant = 'summary',
}) {
  return (
    <div data-buyer-journey="shared">
      <TransactionJourneyTracker
        model={model}
        theme={themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)}
        title={title}
        subtitle={subtitle}
        action={action}
        variant={variant}
        audience="buyer"
      />
    </div>
  )
}
