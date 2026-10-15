const label = value => String(value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
const listingLabel = value => value === 'seller_lead' ? 'Draft' : label(value)

export default function RentalLandlordListingProgress({ units = [], listings = [], vacancies = [] }) {
  return <section aria-label="Saved rental listing progress" className="rounded-2xl border border-[#e3eaf2] bg-white p-5">
    <h2 className="text-lg font-semibold">Listing and vacancy progress</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {units.map(unit => {
        const listing = listings.find(item => item.rental_unit_id === unit.id && item.listing_visibility !== 'archived')
        const vacancy = listing?.rental_vacancy_id ? vacancies.find(item => item.id === listing.rental_vacancy_id && item.unit_id === unit.id) : vacancies.find(item => item.unit_id === unit.id && !['let', 'withdrawn'].includes(item.status))
        return <article key={unit.id} className="rounded-xl border border-[#e3eaf2] p-4">
          <h3 className="font-semibold">{unit.unit_label || 'Rental unit'}</h3>
          <p className="mt-2 text-sm">Rental listing: {listing ? listingLabel(listing.listing_status) : 'Not linked'}</p>
          <p className="mt-2 text-sm">Vacancy: {vacancy ? label(vacancy.status) : 'Not linked'}</p>
          {vacancy?.available_from ? <p className="mt-2 text-sm">Available from: {vacancy.available_from}</p> : null}
        </article>
      })}
      {!units.length ? <p className="text-sm text-[#667085]">No managed units are linked to this property yet.</p> : null}
    </div>
  </section>
}
