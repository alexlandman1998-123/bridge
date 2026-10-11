// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { emailHtmlAssetIssues, packagePath, rewriteEmailAssets } from '../../lib/emailHtmlAssets'
import { emailImportProblems, matchEmailImportFiles, prepareEmailImport, uploadPreparedEmail, validateEmailImportFiles } from '../emailCampaignImportService'

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))
vi.mock('../emailCampaignAssetService', async (original) => ({ ...await original(), uploadEmailCampaignImage: mocks.upload }))
const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const png = (name = 'hero.png') => new File([signature], name, { type: 'image/png' })
const html = (content, name = 'email.html') => new File([content], name, { type: 'text/html' })
const zip = (entries) => new File([zipSync(Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, typeof content === 'string' ? strToU8(content) : content])))], 'email.zip', { type: 'application/zip' })
const org = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.upload.mockImplementation(async ({ organisationId, file }) => ({ organisation_id: organisationId, id: file.name, public_url: `https://images.example/${file.name}` }))
})

it('preserves layout and conditional Outlook markup while rewriting HTML and CSS image references', () => {
  const source = '<!DOCTYPE html>\n<html><head><style>/* url(ignore.png) */ .hero { background:url("../images/hero%20one.png?q=1&x=2") } .label:after{content:"url(ignore.png)"}</style></head><body><table cellpadding=0><tr><td background="../images/hero%20one.png" style="background-image:url(../images/hero%20one.png)"><img SRC=../images/hero%20one.png alt="Welcome &amp; hello"><!--[if mso]><v:rect><v:fill src="../images/hero%20one.png" /></v:rect><![endif]--></td></tr></table></body></html>'
  const result = rewriteEmailAssets(source, { htmlPath: 'design/email.html', resolve: (path) => path === 'images/hero one.png' ? 'https://images.example/uuid.png' : null })
  expect(result.references).toHaveLength(5)
  expect(result.references.every((ref) => ref.path === 'images/hero one.png')).toBe(true)
  expect(result.html).toContain('/* url(ignore.png) */')
  expect(result.html).toContain('content:"url(ignore.png)"')
  expect(result.html).toContain('<table cellpadding=0>')
  expect(result.html).toContain('alt="Welcome &amp; hello"')
  expect(result.html).toContain('<!--[if mso]><v:rect><v:fill src="https://images.example/uuid.png" /></v:rect><![endif]-->')
  expect(result.html).toContain('uuid.png?q=1&x=2')
  expect(emailHtmlAssetIssues(result.html)).toEqual([])
})

it('rewrites srcset descriptors and keeps external images and external CSS URLs', () => {
  const result = rewriteEmailAssets('<img src="https://cdn.example/hero.png?x=1&amp;y=2" srcset="one.png 1x, two.png 2x, https://cdn.example/a,b.png 3x"><table><tr><td background="//cdn.example/bg.png" style="background:url(https://cdn.example/a.png)"></td></tr></table>', { resolve: (path) => `https://images.example/${path}` })
  expect(result.html).toContain('src="https://cdn.example/hero.png?x=1&amp;y=2"')
  expect(result.html).toContain('srcset="https://images.example/one.png 1x, https://images.example/two.png 2x, https://cdn.example/a,b.png 3x"')
  expect(result.html).toContain('background="https://cdn.example/bg.png"')
  expect(result.html).toContain('background:url(https://cdn.example/a.png)')
})

it('recognises escaped CSS paths and previews blob images without a source query suffix', () => {
  const result = rewriteEmailAssets('<style>.a{background:url(hero\\20 one.png?cache=1)}</style>', { keepSuffix: false, resolve: (path) => path === 'hero one.png' ? 'blob:preview' : null })
  expect(result.html).toContain('url("blob:preview")')
})

it.each(['../escape.png', '/absolute.png', 'C:\\escape.png'])('rejects unsafe archive path %s', (path) => {
  expect(() => packagePath(path)).toThrow('inside the package')
})

it('prepares a nested ZIP without uploading, then hosts each referenced file once', async () => {
  const prepared = await prepareEmailImport({ zip: zip({ 'export/mail.html': '<img src="images/hero.png"><table background="images/hero.png"></table>', 'export/images/hero.png': signature, 'export/images/unused.png': signature, '__MACOSX/ignored.txt': 'ignored', 'readme.txt': 'ignored' }) })
  expect(mocks.upload).not.toHaveBeenCalled()
  const result = await uploadPreparedEmail({ prepared, organisationId: org })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  expect(result.html).toBe('<img src="https://images.example/hero.png"><table background="https://images.example/hero.png"></table>')
  expect(result.manifest).toMatchObject({ sourceName: 'email.zip', htmlPath: 'export/mail.html', assets: [{ sourcePath: 'export/images/hero.png', publicUrl: 'https://images.example/hero.png' }] })
})

it('matches separate image files to paths and permits missing images to be supplied', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="images/hero.png"><img src="images/footer.png">'), images: [png()] })
  expect(emailImportProblems(prepared)).toEqual(['Missing image: images/footer.png'])
  await expect(uploadPreparedEmail({ prepared, organisationId: org })).rejects.toThrow('Missing image')
  expect(mocks.upload).not.toHaveBeenCalled()
  const result = await uploadPreparedEmail({ prepared, organisationId: org, overrides: { 'images/footer.png': png('footer.png') } })
  expect(result.html).toContain('https://images.example/footer.png')
})

it('requires an explicit choice when the same basename occurs in different folders', async () => {
  const prepared = await prepareEmailImport({ zip: zip({ 'email.html': '<img src="missing/hero.png">', 'one/hero.png': signature, 'two/hero.png': signature }) })
  expect(matchEmailImportFiles(prepared)[0]).toMatchObject({ file: null, ambiguous: true })
  expect(emailImportProblems(prepared)[0]).toContain('Choose the correct image')
  await expect(uploadPreparedEmail({ prepared, organisationId: org, overrides: { 'missing/hero.png': prepared.files.get('two/hero.png') } })).resolves.toMatchObject({ html: '<img src="https://images.example/hero.png">' })
})

it('validates every supplied and replacement image before uploading any of them', async () => {
  await expect(prepareEmailImport({ html: html('<img src="hero.png">'), images: [png(), new File(['<script/>'], 'bad.png', { type: 'image/png' })] })).rejects.toThrow('contents')
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png"><img src="bad.png">'), images: [png()] })
  await expect(uploadPreparedEmail({ prepared, organisationId: org, overrides: { 'bad.png': new File(['bad'], 'bad.png', { type: 'image/png' }) } })).rejects.toThrow('contents')
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('accepts image exports with absent MIME types by validating extension and bytes', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png">'), images: [new File([signature], 'hero.png')] })
  expect(matchEmailImportFiles(prepared)[0].file.type).toBe('image/png')
})

it('reuses confirmed images when retrying a partially failed import', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png"><img src="footer.png">'), images: [png(), png('footer.png')] })
  mocks.upload.mockResolvedValueOnce({ id: 'first', organisation_id: org, public_url: 'https://images.example/first.png' }).mockRejectedValueOnce(new Error('Connection lost'))
  await expect(uploadPreparedEmail({ prepared, organisationId: org })).rejects.toThrow('Connection lost')
  expect(prepared.sourceHtml).toContain('src="hero.png"')
  const result = await uploadPreparedEmail({ prepared, organisationId: org })
  expect(mocks.upload).toHaveBeenCalledTimes(3)
  expect(result.html).toContain('https://images.example/first.png')
})

it('never reuses a receipt from another workspace', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png">'), images: [png()] })
  await uploadPreparedEmail({ prepared, organisationId: org })
  await uploadPreparedEmail({ prepared, organisationId: 'another-workspace' })
  expect(mocks.upload).toHaveBeenCalledTimes(2)
})

it('stops further uploads and does not return an imported document after cancellation', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png"><img src="footer.png">'), images: [png(), png('footer.png')] })
  let current = true
  mocks.upload.mockImplementationOnce(async () => { current = false; return { organisation_id: org, id: 'first', public_url: 'https://images.example/first.png' } })
  await expect(uploadPreparedEmail({ prepared, organisationId: org, isCurrent: () => current })).rejects.toThrow('cancelled')
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})

it('blocks unresolved or unsupported resources and preserves fully remote HTML without uploads', async () => {
  for (const content of ['<img src="cid:logo">', '<img src="data:image/png;base64,abcd">', '<img src="{{hero}}">', '<img src="/local.png">', '<base href="https://example.com"><img src="hero.png">', '<link rel="stylesheet" href="styles.css">', '<style>@import "https://example.com/styles.css";</style>']) {
    const prepared = await prepareEmailImport({ html: html(content) })
    expect(emailImportProblems(prepared).length).toBeGreaterThan(0)
    await expect(uploadPreparedEmail({ prepared, organisationId: org })).rejects.toThrow()
  }
  const content = '<html><body><img src="https://cdn.example/hero.png"><p>Hello</p></body></html>'
  const prepared = await prepareEmailImport({ html: html(content) })
  expect((await uploadPreparedEmail({ prepared, organisationId: org })).html).toBe(content)
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects archives with multiple HTML files, traversal, excess entries and oversized images', async () => {
  for (const entries of [
    { 'a.html': '<p>A</p>', 'b.html': '<p>B</p>' },
    { 'email.html': '<p>A</p>', '../hero.png': signature },
    { 'email.html': '<p>A</p>', ...Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`file${i}.txt`, 'ignored'])) },
    { 'email.html': '<img src="big.png">', 'big.png': new Uint8Array(5 * 1024 * 1024 + 1) },
  ]) await expect(prepareEmailImport({ zip: zip(entries) })).rejects.toThrow()
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('rejects empty, oversized, unreadable and non-UTF8 HTML and invalid ZIP files', async () => {
  for (const file of [html(''), html(' '.repeat(750 * 1024 + 1)), html(new Uint8Array([0xff]))]) await expect(prepareEmailImport({ html: file })).rejects.toThrow()
  await expect(prepareEmailImport({ zip: new File(['not a zip'], 'email.zip') })).rejects.toThrow('valid ZIP')
})

it('fails closed if a completed image does not have a usable public URL', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png">'), images: [png()] })
  mocks.upload.mockResolvedValue({ organisation_id: org, id: 'first', public_url: '' })
  await expect(uploadPreparedEmail({ prepared, organisationId: org })).rejects.toThrow('local images')
})

it('enforces the file-count and total-byte limits for manually supplied replacements too', async () => {
  await expect(validateEmailImportFiles(Array.from({ length: 200 }, (_, i) => png(`${i}.png`)))).rejects.toThrow('at most 199')
  const files = Array.from({ length: 11 }, (_, i) => {
    const file = png(`${i}.png`)
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 })
    return file
  })
  await expect(validateEmailImportFiles(files)).rejects.toThrow('50 MB')
})

it('blocks unsafe designer HTML before any image is hosted', async () => {
  const prepared = await prepareEmailImport({ html: html('<img src="hero.png" onerror=bad()>'), images: [png()] })
  expect(emailImportProblems(prepared).join(' ')).toContain('event handlers')
  await expect(uploadPreparedEmail({ prepared, organisationId: org })).rejects.toThrow('event handlers')
  expect(mocks.upload).not.toHaveBeenCalled()
})
