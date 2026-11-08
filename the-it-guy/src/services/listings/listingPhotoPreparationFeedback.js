export function listingPhotoPreparationMessages(preview = {}) {
  const preparation = preview.imageByteLoad || {}
  const results = Array.isArray(preparation.results) ? preparation.results : []
  return [preparation.message, ...results
    .filter(photo => photo?.status === 'FAILED' || photo?.status === 'SKIPPED')
    .map(photo => typeof photo.message === 'string' && photo.message.trim() ? photo.message
      : `${typeof photo.photoLabel === 'string' ? photo.photoLabel : Number.isInteger(photo.index) ? `Photo ${photo.index + 1}` : 'A listing photo'} could not be prepared. Review this photo and check again.`)]
    .filter(message => typeof message === 'string' && message.trim())
}

export function listingPhotoPreparationError(preview = {}) {
  const messages = listingPhotoPreparationMessages(preview)
  return messages.length ? `${messages.slice(0, 3).join(' ')}${messages.length > 3 ? ` ${messages.length - 3} more photos need attention; open the photo requirements for details.` : ''}` : ''
}
