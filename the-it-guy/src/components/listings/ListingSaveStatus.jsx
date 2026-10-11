export default function ListingSaveStatus({ cloud = {}, recovery = 'idle', dirty = false, saveLabel = 'Save draft' }) {
  const time = cloud.savedAt && new Date(cloud.savedAt)
  const savedTime = time && Number.isFinite(time.getTime()) ? time.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''
  const cloudMessage = cloud.status === 'saving' ? cloud.message || 'Saving to Listings…'
    : cloud.status === 'error' ? `Could not confirm saving to Listings. Keep this tab open and retry ${saveLabel}.`
      : cloud.status === 'saved' && !dirty ? `Saved to Listings${savedTime ? ` at ${savedTime}` : ''}. You can continue on another device.` : ''
  const recoveryMessage = recovery === 'error' ? 'Recovery could not finish. Keep this tab open until the listing is saved.'
    : recovery === 'photos' ? 'Your text is kept on this device. Photos are still saving for recovery.'
      : recovery === 'files' ? 'Your text is kept on this device. Selected documents still need to be saved.'
        : dirty && cloud.status !== 'saving' && recovery === 'device' ? `Changes kept on this device. Use ${saveLabel} to continue on another device.` : ''
  if (!cloudMessage && !recoveryMessage) return null
  return <div role="status" aria-live="polite" className="rounded-lg border border-[#dbe6f2] bg-[#f5f9fd] px-4 py-3 text-sm text-[#35546c]">
    {cloudMessage ? <p>{cloudMessage}</p> : null}
    {recoveryMessage ? <p>{recoveryMessage}</p> : null}
  </div>
}
