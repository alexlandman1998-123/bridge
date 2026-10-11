import { useEffect, useMemo, useRef, useState } from 'react'
import { rewriteEmailAssets } from '../../lib/emailHtmlAssets'
import { emailImportProblems, matchEmailImportFiles, prepareEmailImport, uploadPreparedEmail, validateEmailImportFiles } from '../../services/emailCampaignImportService'

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp'

export default function EmailCampaignImport({ organisationId, onImported }) {
  const [prepared, setPrepared] = useState(null)
  const [overrides, setOverrides] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [preview, setPreview] = useState('')
  const version = useRef(0)
  useEffect(() => () => { version.current++ }, [])
  const matches = useMemo(() => prepared ? matchEmailImportFiles(prepared, overrides) : [], [prepared, overrides])
  const problems = useMemo(() => prepared ? emailImportProblems(prepared, overrides) : [], [prepared, overrides])

  useEffect(() => {
    setPreview('')
    if (!prepared) return
    let active = true
    const readers = new Set()
    // Opaque sandbox frames cannot load their parent's blob URLs. Inline image
    // bytes for the local preview, retaining the frame's full sandbox.
    const readPreview = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      readers.add(reader)
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Unable to preview this image. Choose the file again.'))
      reader.onabort = () => reject(new Error('Preview cancelled.'))
      reader.onloadend = () => readers.delete(reader)
      reader.readAsDataURL(file)
    })
    const files = [...new Set(matches.map((item) => item.file).filter(Boolean))]
    void validateEmailImportFiles(files)
      .then(() => active ? Promise.all(files.map(async (file) => [file, await readPreview(file)])) : [])
      .then((entries) => {
        if (!active) return
        const urls = new Map(entries)
        const paths = new Map(matches.map(({ path, file }) => [path, urls.get(file)]))
        const previewSize = prepared.sourceHtml.length + prepared.references.reduce((total, ref) => total + (paths.get(ref.path)?.length || 0), 0)
        if (previewSize > 70 * 1024 * 1024) throw new Error('This email repeats large images too many times to preview. Reduce the image sizes and try again.')
        setPreview(rewriteEmailAssets(prepared.sourceHtml, { htmlPath: prepared.htmlPath, keepSuffix: false, resolve: (path) => paths.get(path) }).html)
      })
      .catch((cause) => { if (active) setError(cause.message) })
    return () => { active = false; for (const reader of readers) reader.abort() }
  }, [prepared, matches])

  const choose = async (files) => {
    const request = ++version.current
    setBusy(true); setError(''); setPrepared(null); setOverrides({}); setProgress(null)
    try {
      const zips = files.filter((file) => /\.zip$/i.test(file.name))
      const html = files.filter((file) => /\.html?$/i.test(file.name))
      if (zips.length ? zips.length !== 1 || files.length !== 1 : html.length !== 1) throw new Error('Choose one ZIP, or one HTML file together with its images.')
      const result = await prepareEmailImport(zips.length ? { zip: zips[0] } : { html: html[0], images: files.filter((file) => file !== html[0]) })
      if (version.current === request) setPrepared(result)
    } catch (cause) { if (version.current === request) setError(cause.message || 'Unable to read this email.') }
    finally { if (version.current === request) setBusy(false) }
  }

  const confirm = async () => {
    const request = ++version.current
    const isCurrent = () => version.current === request
    setBusy(true); setError(''); setProgress(null)
    try {
      const result = await uploadPreparedEmail({ prepared, organisationId, overrides, isCurrent, onProgress: (next) => { if (isCurrent()) setProgress(next) } })
      if (isCurrent()) onImported(result)
    } catch (cause) { if (isCurrent()) setError(cause.message || 'Unable to import this email. Try again.') }
    finally { if (isCurrent()) setBusy(false) }
  }

  return <div className="eb-import">
    <h2>Upload email</h2>
    <p>Choose your designer’s ZIP containing one HTML email and its images, or select the HTML and image files together. JPG, PNG, GIF and WebP are supported.</p>
    <label className="eb-field">Email package or HTML and images
      <input type="file" multiple accept={`.zip,.html,.htm,${IMAGE_ACCEPT}`} disabled={busy} onChange={(event) => {
        const files = Array.from(event.target.files || [])
        event.target.value = ''
        if (files.length) void choose(files)
      }} />
    </label>
    <small>ZIP up to 25 MB · HTML up to 750 KB · Each image up to 5 MB</small>
    {error && <p className="eb-import-error" role="alert">{error}</p>}
    {busy && <p role="status">{progress ? `Hosting images: ${progress.completed} of ${progress.total} ready…` : prepared ? 'Preparing your email for import…' : 'Reading your email package…'}</p>}
    {prepared && <>
      <div className="eb-import-summary"><strong>{prepared.sourceName}</strong><span>{matches.length} local image{matches.length === 1 ? '' : 's'}</span></div>
      {matches.map(({ path, file, ambiguous }) => <div className="eb-import-image" key={path}>
        <span><strong>{path}</strong><small>{file ? `Ready: ${file.name}` : ambiguous ? 'Several images match. Choose the correct one.' : 'Image missing. Choose a file below.'}</small></span>
        <label className="eb-field">{file ? 'Replace image' : 'Choose image'} for {path}
          <input type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) { setOverrides((current) => ({ ...current, [path]: file })); setError('') }
          }} />
        </label>
      </div>)}
      {problems.length > 0 && <div className="eb-import-error" role="status"><strong>Resolve these before importing:</strong><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}
      {prepared.warnings?.length > 0 && <div className="eb-content-warnings"><strong>Inbox compatibility</strong><ul>{prepared.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      <h3>Email preview</h3>
      {preview ? <iframe key={preview} title="Uploaded email preview" sandbox="" srcDoc={preview} /> : <p role="status">Preparing preview…</p>}
      <p>Importing replaces the current email content after its images are hosted. You can undo the replacement. Hosted images remain available for sent emails.</p>
      <button className="eb-primary" disabled={busy || !preview || problems.length > 0} onClick={() => void confirm()}>{busy ? 'Importing…' : 'Host images and replace email'}</button>
    </>}
  </div>
}
