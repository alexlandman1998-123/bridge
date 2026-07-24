export const PROFILE_AVATAR_MAX_SOURCE_BYTES = 12 * 1024 * 1024
export const PROFILE_AVATAR_TARGET_SIZE = 512
export const PROFILE_AVATAR_MAX_FILE_BYTES = 650 * 1024
export const PROFILE_AVATAR_QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46]
export const PROFILE_AVATAR_SIZE_ERROR_MESSAGE = 'Profile photo must be under 1 MB; we could not compress this one.'

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Arch9 could not read that image. Try a JPG or PNG file.'))
    image.src = dataUrl
  })
}

async function createProfileAvatarCanvas(file) {
  if (file.size > PROFILE_AVATAR_MAX_SOURCE_BYTES) {
    throw new Error('Choose an image smaller than 12MB. Arch9 will resize it before saving.')
  }

  const originalDataUrl = await readImageFileAsDataUrl(file)
  const image = await loadImageFromDataUrl(originalDataUrl)
  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
  if (!sourceSize) throw new Error('Arch9 could not read that image. Try a different profile picture.')

  const outputSize = Math.min(PROFILE_AVATAR_TARGET_SIZE, sourceSize)
  const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2)
  const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Arch9 could not resize that image in this browser. Try a smaller JPG or PNG file.')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputSize, outputSize)
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize)
  return canvas
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export function isProfileAvatarSizeError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('object exceeded the maximum allowed size') ||
    message.includes('exceeded the maximum allowed size') ||
    message.includes('profile photo must be under 1 mb') ||
    message.includes('still too large')
  )
}

export function getProfileAvatarErrorMessage(error, fallback = 'Unable to upload profile picture.') {
  if (isProfileAvatarSizeError(error)) return PROFILE_AVATAR_SIZE_ERROR_MESSAGE
  return error?.message || fallback
}

export async function createProfileAvatarFile(file) {
  const selectedFile = typeof Blob !== 'undefined' && file instanceof Blob ? file : null
  if (!selectedFile) {
    throw new Error('Select a valid profile picture before uploading.')
  }
  if (selectedFile.type && !selectedFile.type.startsWith('image/')) {
    throw new Error('Choose an image file for your profile picture.')
  }

  const canvas = await createProfileAvatarCanvas(selectedFile)
  for (const quality of PROFILE_AVATAR_QUALITIES) {
    const blob = await canvasToBlob(canvas, quality)
    if (blob && blob.size <= PROFILE_AVATAR_MAX_FILE_BYTES) {
      return new File([blob], 'profile-avatar.jpg', { type: 'image/jpeg' })
    }
  }
  throw new Error(PROFILE_AVATAR_SIZE_ERROR_MESSAGE)
}
