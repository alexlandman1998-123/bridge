import Button from '../ui/Button'

export default function ListingDeletionBlockedNotice({ block, onManageWithdrawal, disabled = false }) {
  if (!block) return null
  return <div role="alert" className="mt-4 grid gap-3 rounded-[14px] border border-[#d7e5f1] bg-[#f8fbff] p-4 text-sm leading-6 text-[#43566d]">
    <p>{block.message}</p>
    <p>Withdraw takes adverts off the market and keeps the listing history. Deleting is a separate permanent action.</p>
    <Button type="button" variant="secondary" disabled={disabled} onClick={onManageWithdrawal}>Open withdrawal controls</Button>
  </div>
}
