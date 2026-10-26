import Button from '../ui/Button'

export default function ListingChannelActions({ status, isSale, busy, onWithdraw, onUnderOffer, onSold, mobile = false }) {
  return <div role="group" aria-label="Listing channel actions" className={mobile ? 'grid grid-cols-3 gap-2 border-t border-[#edf2f7] p-4' : 'flex flex-wrap gap-2 border-t border-[#edf2f7] p-5'}>
    <Button type="button" variant="secondary" className={mobile ? 'min-w-0 px-1 text-xs shadow-none' : undefined} onClick={onWithdraw} disabled={busy || ['withdrawn', 'deleted'].includes(status)}>{mobile ? 'Withdraw' : 'Withdraw Listings'}</Button>
    <Button type="button" variant="secondary" className={mobile ? 'min-w-0 px-1 text-xs shadow-none' : undefined} onClick={onUnderOffer} disabled={busy || !isSale || status !== 'active'}>{mobile ? 'Under offer' : 'Mark as under offer'}</Button>
    <Button type="button" variant="secondary" className={mobile ? 'min-w-0 px-1 text-xs shadow-none' : undefined} onClick={onSold} disabled={busy || !isSale || !['active', 'under_offer'].includes(status)}>{mobile ? 'Sold' : 'Mark as sold'}</Button>
  </div>
}
