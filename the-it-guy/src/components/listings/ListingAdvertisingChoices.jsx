import { LISTING_CHANNEL_LABELS } from '../../services/listings/listingFieldRequirements'

export default function ListingAdvertisingChoices({ selected = [], availability = {}, onToggle }) {
  return <fieldset className="rounded-xl border border-[#dbe6f2] p-4">
    <legend className="px-1 text-sm font-semibold">Where will you advertise?</legend>
    <p className="text-sm text-[#607387]">Choose now so we can show what each website needs. You can change this later.</p>
    <div className="mt-3 flex flex-wrap gap-4">
      {Object.entries(LISTING_CHANNEL_LABELS).map(([channel, label]) => <label key={channel} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={selected.includes(channel)} disabled={!availability[channel]?.available && !selected.includes(channel)} onChange={() => onToggle(channel)} />
        {availability[channel]?.label || label}{!availability[channel]?.available && !selected.includes(channel) ? ' (connection needed)' : ''}
      </label>)}
    </div>
    <p className="mt-3 text-xs text-[#607387]">{selected.includes('private_property') ? 'Private Property needs at least 3 photos, a description and complete address details.' : selected.some(channel => ['property24', 'agency_website'].includes(channel)) ? 'Add at least 1 photo. Property24 also needs a description.' : 'Nothing selected? You can keep the listing private and choose websites later.'}</p>
  </fieldset>
}
