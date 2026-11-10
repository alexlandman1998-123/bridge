import { useRef, useState } from 'react'
import './listing-marketing-gallery.css'
import { ArrowLeft, ArrowRight, BadgeCheck, Home, Loader2, Pencil, Trash2 } from 'lucide-react'

const actionClass = 'inline-flex h-8 min-w-0 w-full items-center justify-center rounded-lg border border-[#dbe6f2] bg-white text-[#42617f] shadow-sm transition hover:border-[#b7c8db] hover:bg-[#f7fbff] disabled:opacity-40'
const editClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#dbe6f2] bg-white px-3 text-sm font-semibold text-[#35546c] shadow-sm transition hover:border-[#b7c8db] hover:bg-[#f7fbff]'

export default function ListingMarketingGallery({ images, coverImageId, title, saving, loading, loadError, onRetry, onEdit, onUpload, onCover, onMove, onRemove, floorPlanCount, hasVideo, hasVirtualTour }) {
  const uploadInput = useRef(null)
  const [failedImages, setFailedImages] = useState([])
  const [retrying, setRetrying] = useState(false)
  const coverId = images.find(image => String(image.id) === String(coverImageId))?.id ?? images[0]?.id
  const indexedImages = images.map((image, index) => ({ image, index }))
  // Preview the cover first while retaining each photo's saved position for actions.
  const displayImages = [
    ...indexedImages.filter(({ image }) => String(image.id) === String(coverId)),
    ...indexedImages.filter(({ image }) => String(image.id) !== String(coverId)),
  ]
  const waiting = loading || retrying
  const failed = loadError || failedImages.length > 0

  async function retryPhotos() {
    setRetrying(true)
    try {
      await onRetry()
      setFailedImages([])
    } catch {
      // Keep unavailable photos visible so the user can retry again.
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="listing-marketing-gallery">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#142132]">Media</h3>
          <p className="mt-1 text-sm text-[#607387]">Control what buyers see across your marketing channels.</p>
        </div>
        <button type="button" className={editClass} onClick={onEdit} disabled={saving || waiting}><Pencil size={16} aria-hidden="true" />Edit Media</button>
      </div>

      {waiting ? <p role="status" className="text-sm text-[#607387]">Loading listing photos…</p> : null}
      {failed && !waiting ? (
        <div role="alert" className="text-sm text-[#9f3131]">
          <p>Some listing photos could not be loaded.</p>
          <button type="button" className={`${editClass} mt-2`} onClick={retryPhotos} disabled={saving}>Retry loading photos</button>
        </div>
      ) : null}

      <div role="region" aria-label="Listing photos" tabIndex={0} className="listing-marketing-gallery-scroll focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f4f78]">
        <div className="listing-marketing-photo-grid">
          {displayImages.map(({ image, index }) => {
            const cover = String(image.id) === String(coverId)
            const disabled = saving || waiting
            return (
              <div key={image.id} className={`listing-marketing-photo overflow-hidden rounded-[14px] border bg-white ${cover ? 'is-cover border-[#1f4f78]' : 'border-[#dbe6f2]'}`}>
                <div className="listing-marketing-photo-image relative bg-[#eef4fa]">
                  {image.url && !failedImages.includes(image.url)
                    ? <img src={image.url} alt={`${title} — photo ${index + 1}`} loading={cover ? 'eager' : 'lazy'} decoding="async" width={cover ? 800 : 240} height={cover ? 360 : 180} className="h-full w-full object-cover" onError={() => setFailedImages(previous => [...new Set([...previous, image.url])])} />
                    : <div className="grid h-full place-items-center text-sm text-[#607387]">Photo unavailable</div>}
                  {cover ? <span className="absolute left-2 top-2 rounded-full bg-[#123955] px-2 py-1 text-[0.62rem] font-semibold text-white">Cover</span> : null}
                </div>
                <div className="listing-marketing-photo-actions border-t border-[#edf2f7] p-2">
                  <span className="text-xs font-semibold text-[#42617f]">{cover ? 'Cover photo' : `Photo ${index + 1}`}</span>
                  <div className="grid w-full grid-cols-4 gap-1">
                    {!cover ? <button type="button" onClick={() => onCover(image.id)} disabled={disabled} className={actionClass} aria-label={`Set photo ${index + 1} as cover`}><BadgeCheck size={14} aria-hidden="true" /></button> : null}
                    <button type="button" onClick={() => onMove(image.id, 'left')} disabled={disabled || index === 0} className={actionClass} aria-label={`Move photo ${index + 1} earlier`}><ArrowLeft size={14} aria-hidden="true" /></button>
                    <button type="button" onClick={() => onMove(image.id, 'right')} disabled={disabled || index === images.length - 1} className={actionClass} aria-label={`Move photo ${index + 1} later`}><ArrowRight size={14} aria-hidden="true" /></button>
                    <button type="button" onClick={() => onRemove(image.id)} disabled={disabled} className={`${actionClass} text-[#c74d4d]`} aria-label={`Remove photo ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            )
          })}
          <button type="button" onClick={() => uploadInput.current?.click()} disabled={saving || waiting} className="listing-marketing-add-photos grid min-h-32 place-items-center rounded-[14px] border border-dashed border-[#c9d8e8] bg-[#fbfdff] text-xs font-semibold text-[#5f7894] disabled:opacity-40"><span><Home className="mx-auto mb-1" size={18} aria-hidden="true" />Add Photos</span></button>
        </div>
      </div>
      <input ref={uploadInput} type="file" accept="image/*" multiple className="hidden" aria-label="Upload listing photos" onChange={onUpload} disabled={saving || waiting} />

      {saving ? <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#42617f]"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Saving photo changes…</p> : null}
      <footer aria-label="Media summary" className="listing-marketing-gallery-footer flex flex-wrap gap-2 border-t border-[#edf2f7] pt-4">
        <span className="rounded-full border border-[#d8eddf] bg-[#ecfaf1] px-3 py-1 text-xs font-semibold text-[#1f7d44]">{images.length ? `${images.length} photo${images.length === 1 ? '' : 's'}` : 'No photos'}</span>
        <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{images.length ? 'Cover selected' : 'Cover missing'}</span>
        <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{floorPlanCount ? `${floorPlanCount} floor plan${floorPlanCount === 1 ? '' : 's'}` : 'Floor plan missing'}</span>
        <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{hasVideo ? 'Video added' : 'Video not added (optional)'}</span>
        <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#607387]">{hasVirtualTour ? 'Virtual tour added' : 'Virtual tour not added (optional)'}</span>
      </footer>
    </div>
  )
}
