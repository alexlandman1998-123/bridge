import { useEffect, useRef, useState } from 'react'
import { getEmailCampaignAssets, uploadEmailCampaignImage } from '../../services/emailCampaignAssetService'

export default function EmailCampaignImages({ organisationId, onSelect }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scope = useRef(null)
  const request = useRef(0)

  const refresh = async (currentScope = scope.current) => {
    const version = ++request.current
    setLoading(true)
    setError('')
    try {
      const rows = await getEmailCampaignAssets(organisationId)
      if (scope.current === currentScope && request.current === version) setImages(rows)
    } catch (cause) {
      if (scope.current === currentScope && request.current === version) setError(cause.message || 'Campaign images could not be loaded.')
    } finally {
      if (scope.current === currentScope && request.current === version) setLoading(false)
    }
  }

  useEffect(() => {
    const currentScope = { organisationId }
    scope.current = currentScope
    setImages([])
    setNotice('')
    setUploading(false)
    void refresh(currentScope)
    return () => { scope.current = null }
    // Loading is scoped to the agency; local UI changes must not reload it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId])

  const upload = async (file) => {
    if (!file || uploading) return
    const currentScope = scope.current
    setUploading(true)
    setError('')
    setNotice('')
    try {
      const image = await uploadEmailCampaignImage({ organisationId, file })
      if (scope.current !== currentScope) return
      ++request.current // An older list response must not discard this upload.
      setLoading(false)
      setImages((rows) => [image, ...rows.filter((row) => row.id !== image.id)].slice(0, 100))
      setNotice('Image uploaded. Its link stays available for your emails.')
      onSelect?.(image)
    } catch (cause) {
      if (scope.current === currentScope) setError(cause.message || 'The image could not be uploaded. Try again.')
    } finally {
      if (scope.current === currentScope) setUploading(false)
    }
  }

  const copyLink = async (image) => {
    const currentScope = scope.current
    setError('')
    try {
      await navigator.clipboard.writeText(image.public_url)
      if (scope.current === currentScope) setNotice(`Image link copied for ${image.original_name}.`)
    } catch {
      if (scope.current === currentScope) setError('Unable to copy. Select and copy the image link below.')
    }
  }

  return <section className="eb-image-library" aria-label="Campaign image library">
    <div className="eb-image-library-heading"><h3>Campaign images</h3><button type="button" disabled={loading || uploading} onClick={() => void refresh()}>Refresh images</button></div>
    <p>Upload images for your agency. Links stay available after sending; uploaded images cannot be replaced or deleted.</p>
    <label className="eb-field">Upload campaign image<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={!organisationId || uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file) }} /></label>
    <small>JPG, PNG, GIF or WebP · up to 5 MB. Upload a new file to replace an image.</small>
    {images.length === 100 && <small>Showing the latest 100 campaign images. Older image links remain available.</small>}
    {uploading && <p role="status">Uploading image…</p>}
    {loading ? <p role="status">Loading campaign images…</p> : images.length ? <div className="eb-image-library-list">{images.map((image) => <article className="eb-image-library-item" key={image.id}>
      <img src={image.public_url} alt="" loading="lazy" />
      <div><strong>{image.original_name}</strong><small>{Math.max(1, Math.round(image.byte_size / 1024))} KB</small></div>
      <label className="eb-field">Image link<input readOnly value={image.public_url} aria-label={`Image link for ${image.original_name}`} onFocus={(event) => event.target.select()} /></label>
      <div className="eb-image-library-actions">{onSelect && <button type="button" disabled={uploading} onClick={() => onSelect(image)}>Use image<span className="sr-only"> {image.original_name}</span></button>}<button type="button" onClick={() => void copyLink(image)}>Copy link<span className="sr-only"> {image.original_name}</span></button></div>
    </article>)}</div> : !error && <p>No campaign images yet. Upload your first image above.</p>}
    {error && <p className="wa-error" role="alert">{error}</p>}
    {notice && <p className="wa-notice" role="status">{notice}</p>}
  </section>
}
