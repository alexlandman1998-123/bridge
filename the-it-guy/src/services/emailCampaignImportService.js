import { Unzip, UnzipInflate } from 'fflate'
import { emailHtmlAssetIssues, packagePath, rewriteEmailAssets } from '../lib/emailHtmlAssets'
import { inspectEmailHtml } from '../../../supabase/functions/_shared/emailContent.js'
import { uploadEmailCampaignImage, validateEmailCampaignImage } from './emailCampaignAssetService'

export const EMAIL_IMPORT_HTML_LIMIT = 750 * 1024
const PACKAGE_LIMIT = 25 * 1024 * 1024
const EXPANDED_LIMIT = 50 * 1024 * 1024
const FILE_LIMIT = 200
const htmlFile = (name) => /\.html?$/i.test(name)
const imageType = (name) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' })[name.split('.').pop().toLowerCase()]

export async function validateEmailImportFiles(files) {
  const unique = [...new Set(files)]
  if (unique.length > FILE_LIMIT - 1 || unique.reduce((total, file) => total + file.size, 0) > EXPANDED_LIMIT) throw new Error('Choose at most 199 images totalling 50 MB or less.')
  for (const file of unique) await validateEmailCampaignImage(file)
}

async function bytesOf(file) {
  if (file.arrayBuffer) return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(new Error('The email file could not be read. Choose it again.'))
    reader.readAsArrayBuffer(file)
  })
}

async function zipFiles(file) {
  if (!file.size || file.size > PACKAGE_LIMIT) throw new Error('Email ZIP packages must be non-empty and 25 MB or smaller.')
  const bytes = await bytesOf(file)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Choose a valid ZIP containing one HTML file and its images.')
  const entries = new Map()
  let count = 0, expanded = 0, failure = null
  const decoder = new Unzip((entry) => {
    if (failure) return
    try {
      if (++count > FILE_LIMIT) throw new Error('Email packages can contain at most 200 files and folders.')
      const path = packagePath(entry.name)
      if (entry.name.endsWith('/') || path.startsWith('__MACOSX/') || path.split('/').some((part) => part.startsWith('.'))) return
      if (entries.has(path)) throw new Error(`The package contains the same path twice: ${path}.`)
      const type = imageType(path)
      const limit = htmlFile(path) ? EMAIL_IMPORT_HTML_LIMIT : type ? 5 * 1024 * 1024 : 0
      if (!limit) return
      if (entry.originalSize > limit) throw new Error(`${path} is too large for an email import.`)
      const result = { chunks: [], size: 0, done: false, type: type || 'text/html' }
      entries.set(path, result)
      entry.ondata = (error, chunk, final) => {
        if (failure) return
        if (error) { failure = new Error(`Unable to extract ${path}. Export the package again.`); return }
        result.size += chunk.length
        expanded += chunk.length
        if (result.size > limit || expanded > EXPANDED_LIMIT) { failure = new Error('The expanded email package is too large. Reduce the image sizes.'); entry.terminate(); return }
        result.chunks.push(chunk)
        result.done = final
      }
      entry.start()
    } catch (error) { failure = error }
  })
  decoder.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length && !failure; offset += 16384) {
      decoder.push(bytes.subarray(offset, offset + 16384), offset + 16384 >= bytes.length)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  } catch { throw new Error('The ZIP could not be read. Export the email package again.') }
  if (failure) throw failure
  const files = new Map()
  for (const [path, entry] of entries) {
    if (!entry.done) throw new Error('The ZIP is incomplete. Export the email package again.')
    files.set(path, new File(entry.chunks, path.split('/').pop(), { type: entry.type }))
  }
  return files
}

export async function prepareEmailImport({ zip, html, images = [] }) {
  let files, htmlPath
  if (zip) {
    files = await zipFiles(zip)
    const choices = [...files.keys()].filter(htmlFile)
    if (choices.length !== 1) throw new Error('The ZIP must contain exactly one HTML file.')
    htmlPath = choices[0]
  } else {
    if (!html || !htmlFile(html.name)) throw new Error('Choose an .html or .htm file.')
    if (images.length > FILE_LIMIT - 1) throw new Error('Choose at most 199 image files.')
    htmlPath = packagePath(html.webkitRelativePath || html.name)
    files = new Map([[htmlPath, html]])
    for (const image of images) {
      const path = packagePath(image.webkitRelativePath || image.name)
      if (files.has(path)) throw new Error(`Two files use the same path: ${path}. Use a ZIP to preserve their folders.`)
      files.set(path, image)
    }
  }
  const source = files.get(htmlPath)
  if (!source.size || source.size > EMAIL_IMPORT_HTML_LIMIT) throw new Error('HTML must be non-empty and 750 KB or smaller.')
  let sourceHtml
  try { sourceHtml = new TextDecoder('utf-8', { fatal: true }).decode(await bytesOf(source)) } catch { throw new Error('Export the HTML with UTF-8 encoding and try again.') }
  if (!sourceHtml.trim()) throw new Error('Add email content before importing.')
  // Validate every supplied image before any hosted upload starts.
  let total = source.size
  for (const [path, file] of files) {
    if (path === htmlPath) continue
    const type = imageType(path)
    if (!type) throw new Error(`Upload JPG, PNG, GIF or WebP images: ${path}.`)
    if (file.type !== type) files.set(path, new File([await bytesOf(file)], file.name, { type }))
    await validateEmailCampaignImage(files.get(path))
    total += file.size
    if (total > EXPANDED_LIMIT) throw new Error('The email files must total 50 MB or less.')
  }
  const analysed = rewriteEmailAssets(sourceHtml, { htmlPath })
  // Local paths are handled by the file matcher. Inspect a URL-only candidate
  // as well, so unsafe HTML is rejected before spending storage on uploads.
  const candidate = rewriteEmailAssets(sourceHtml, { htmlPath, resolve: () => 'https://email-preview.example.com/image.png' })
  const contentCheck = inspectEmailHtml(candidate.html)
  return { sourceName: zip?.name || html.name, sourceHtml, htmlPath, files, references: analysed.references, problems: [...new Set([...analysed.problems, ...contentCheck.errors])], warnings: contentCheck.warnings, uploaded: new Map() }
}

export function matchEmailImportFiles(prepared, overrides = {}) {
  const paths = [...new Set(prepared.references.filter((ref) => ref.kind === 'local').map((ref) => ref.path))]
  return paths.map((path) => {
    if (overrides[path]) return { path, file: overrides[path] }
    const exact = prepared.files.get(path)
    if (exact && imageType(exact.name)) return { path, file: exact }
    const candidates = [...prepared.files].filter(([name]) => name.split('/').pop() === path.split('/').pop() && imageType(name))
    return { path, file: candidates.length === 1 ? candidates[0][1] : null, ambiguous: candidates.length > 1 }
  })
}

export function emailImportProblems(prepared, overrides = {}) {
  return [...prepared.problems,
    ...matchEmailImportFiles(prepared, overrides).filter((item) => !item.file).map((item) => `${item.ambiguous ? 'Choose the correct image for' : 'Missing image'}: ${item.path}`),
    ...(prepared.references.some((ref) => ref.kind === 'unsupported') ? ['Export embedded, dynamic or unsupported images as separate files with local paths.'] : []),
  ]
}

export async function uploadPreparedEmail({ prepared, organisationId, overrides = {}, isCurrent = () => true, onProgress = () => {} }) {
  const problems = emailImportProblems(prepared, overrides)
  if (problems.length) throw new Error(problems[0])
  const matches = matchEmailImportFiles(prepared, overrides)
  await validateEmailImportFiles(matches.map((item) => item.file))
  const byFile = new Map()
  for (const item of matches) {
    if (!isCurrent()) throw new Error('Email import cancelled.')
    let asset = prepared.uploaded.get(item.path)
    if (asset?.organisation_id !== organisationId || asset?.file !== item.file) asset = null
    if (!asset) {
      asset = byFile.get(item.file) || { ...await uploadEmailCampaignImage({ organisationId, file: item.file }), file: item.file }
      prepared.uploaded.set(item.path, asset)
    }
    byFile.set(item.file, asset)
    onProgress({ completed: byFile.size, total: new Set(matches.map((match) => match.file)).size })
  }
  if (!isCurrent()) throw new Error('Email import cancelled.')
  const output = rewriteEmailAssets(prepared.sourceHtml, { htmlPath: prepared.htmlPath, resolve: (path) => prepared.uploaded.get(path)?.public_url })
  const remaining = emailHtmlAssetIssues(output.html)
  if (remaining.length) throw new Error(remaining[0])
  return { html: output.html, manifest: { version: 1, sourceName: prepared.sourceName, htmlPath: prepared.htmlPath, assets: matches.map(({ path }) => { const asset = prepared.uploaded.get(path); return { sourcePath: path, id: asset.id, publicUrl: asset.public_url } }) } }
}
