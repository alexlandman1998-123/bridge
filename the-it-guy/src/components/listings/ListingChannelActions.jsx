import Button from '../ui/Button'

export default function ListingChannelActions({ status, isSale, busy, onWithdraw, onUnderOffer, onSold }) {
  return <div role="group" aria-label="Listing channel actions" className="flex flex-wrap gap-2 border-t border-[#edf2f7] p-5">
    <Button type="button" variant="secondary" onClick={onWithdraw} disabled={busy || ['withdrawn', 'deleted'].includes(status)}>Withdraw Listings</Button>
    <Button type="button" variant="secondary" onClick={onUnderOffer} disabled={busy || !isSale || status !== 'active'}>Mark as under offer</Button>
    <Button type="button" variant="secondary" onClick={onSold} disabled={busy || !isSale || !['active', 'under_offer'].includes(status)}>Mark as sold</Button>
  </div>
}
