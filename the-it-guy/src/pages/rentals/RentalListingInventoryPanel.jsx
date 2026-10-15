import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { ensureRentalListingVacancy, getRentalListingInventory } from '../../services/rentals/rentalListingInventoryRepository.js'

export default function RentalListingInventoryPanel({ listingId, organisationId, onConnected }) {
  const [inventory, setInventory] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(0)
  useEffect(() => {
    let active = true
    request.current += 1
    setBusy(false)
    setInventory(null)
    setError('')
    getRentalListingInventory(listingId, organisationId)
      .then(value => { if (active) setInventory(value) })
      .catch(cause => { if (active) setError(cause.message) })
    return () => { active = false; request.current += 1 }
  }, [listingId, organisationId])
  async function connect() {
    if (busy) return
    setBusy(true)
    setError('')
    const generation = request.current
    try {
      const value = await ensureRentalListingVacancy(listingId, organisationId)
      if (generation !== request.current) return
      setInventory(value)
      await onConnected?.()
    } catch (cause) { if (generation === request.current) setError(cause.message || 'Unable to connect this vacancy.') }
    finally { if (generation === request.current) setBusy(false) }
  }
  return <section className="rental-overview-panel" aria-label="Rental property and vacancy">
    <h2 className="text-lg font-semibold">Property and vacancy</h2>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {inventory?.propertyId ? <Link className="mt-3 block text-sm font-semibold underline" to={`/agent/rentals/portfolio/properties/${encodeURIComponent(inventory.propertyId)}`}>Open managed property and units</Link> : null}
    {inventory?.vacancyId ? <Link className="mt-3 block text-sm font-semibold underline" to={`/agent/rentals/vacancies/${encodeURIComponent(inventory.vacancyId)}`}>Open rental vacancy</Link>
      : inventory?.applicable === false ? <p className="mt-3 text-sm">A monthly rental vacancy does not apply to this listing’s pricing.</p>
        : <><p className="mt-3 text-sm">Connect the saved property and unit to a vacancy before taking applications.</p><Button className="mt-3" type="button" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Connect rental vacancy'}</Button></>}
  </section>
}
