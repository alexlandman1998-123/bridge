import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import ListingChannelManageMenu from '../../components/listings/ListingChannelManageMenu'
import ListingChannelManageDialog from '../../components/listings/ListingChannelManageDialog'

export default function RentalWebsiteChannelManagement({ channelName, listing, publicationState, publication, statusLabel, publicUrl, busy, error, issues = [], infrastructureBlocked, historyError, activity = [], onEdit, onRefresh, onPublish, onUpdate, onWithdraw }) {
  const [open, setOpen] = useState(false)
  const published = publication?.status === 'published'
  const listingStatus = listing.listingStatus || listing.listing_status || 'draft'
  const inactive = ['withdrawn', 'expired', 'archived', 'deleted'].includes(listingStatus)
  const close = () => setOpen(false)
  const edit = () => { close(); onEdit() }
  return <>
    <ListingChannelManageMenu channelName={channelName}>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-10 w-full items-center gap-2 rounded-[12px] px-3 text-left text-sm font-semibold text-[#243d56] hover:bg-[#f7fbff]"><SlidersHorizontal size={15} />Manage listing</button>
    </ListingChannelManageMenu>
    {open ? <ListingChannelManageDialog
      channelName={channelName}
      listingStatus={listingStatus}
      listing={listing}
      portal={{ reference: listing.reference, publicUrl, statusLabel: statusLabel || (published ? 'Live on website' : 'Not on website'), checkedAt: publication?.lastCheckedAt, publicationState, issues: [...new Set([...issues, error].filter(Boolean))], activity, activityUnavailable: Boolean(historyError) }}
      isSale={false}
      confirmWithdrawal
      externalBusy={busy}
      canUpdate={published && !inactive && !infrastructureBlocked}
      canPublish={!published && !inactive && !infrastructureBlocked}
      canWithdraw={published || publication?.mediaCleanupPending > 0}
      onClose={close}
      onFix={edit}
      onRefresh={onRefresh}
      onUpdate={published ? onUpdate : undefined}
      onPublish={!published ? onPublish : undefined}
      onWithdraw={onWithdraw}
    /> : null}
  </>
}
