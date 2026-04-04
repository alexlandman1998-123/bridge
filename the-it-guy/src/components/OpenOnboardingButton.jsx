import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { openTransactionOnboardingLink } from '../lib/onboardingLinks'
import Button from './ui/Button'

function OpenOnboardingButton({
  transactionId,
  purchaserType = 'individual',
  label = 'Open Onboarding',
  variant = 'secondary',
  className = '',
}) {
  const [opening, setOpening] = useState(false)

  async function handleClick(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!transactionId || opening) {
      return
    }

    try {
      setOpening(true)
      await openTransactionOnboardingLink({
        transactionId,
        purchaserType,
      })
    } catch (error) {
      window.alert(error.message || 'Unable to open onboarding link.')
    } finally {
      setOpening(false)
    }
  }

  return (
    <Button type="button" variant={variant} className={className} onClick={handleClick} disabled={!transactionId || opening}>
      <ExternalLink size={14} />
      {opening ? 'Opening…' : label}
    </Button>
  )
}

export default OpenOnboardingButton
