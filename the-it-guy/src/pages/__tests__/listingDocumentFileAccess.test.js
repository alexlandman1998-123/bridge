// @vitest-environment node
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

const page = readFileSync(new URL('../AgentListingDetail.jsx', import.meta.url), 'utf8')
const start = page.indexOf('  async function handleOpenSellerDocument(')
const handler = page.slice(start, page.indexOf('  const handleRepairSellerDocumentLinks', start))

function fixture(copy = null) {
  const tab = { location: {}, close: vi.fn() }
  const url = 'https://fixture.supabase.co/storage/v1/object/sign/documents/signed.pdf?token=fixture'
  const context = {
    URL, listingId: 'listing-one', window: { open: vi.fn(() => tab) },
    setDetailError: vi.fn(), setOpeningSellerDocumentKey: vi.fn(),
    getSellerPhysicalSigningCopy: () => copy,
    downloadSellerPhysicalSigningCopy: vi.fn(), downloadGeneratedSellerDocumentPdf: vi.fn(),
    createPrivateListingDocumentDownloadUrl: vi.fn(async () => url),
    requestPersistedPdfAccess: vi.fn(async () => ({ signedUrl: url })),
    normalizeKey: value => String(value || '').toLowerCase(),
  }
  const open = vm.runInNewContext(`(${handler})`, context)
  return { open, context, tab, url }
}

it('downloads the saved signed file instead of its prepared blank copy', async () => {
  const { open, context, tab } = fixture({ versionId: 'prepared-copy' })
  await open({ key: 'signed_mandate', uploaded: true, filePath: 'listing-one/signed.pdf', generatedHtml: '<p>Blank prepared copy</p>' }, { download: true })
  expect(context.createPrivateListingDocumentDownloadUrl).toHaveBeenCalledWith({ listingId: 'listing-one', filePath: 'listing-one/signed.pdf', expiresInSeconds: 300 })
  const target = new URL(tab.location.href)
  expect(target.searchParams.has('download')).toBe(true)
  expect(target.searchParams.get('token')).toBe('fixture')
  expect(context.downloadSellerPhysicalSigningCopy).not.toHaveBeenCalled()
  expect(context.downloadGeneratedSellerDocumentPdf).not.toHaveBeenCalled()
})

it('keeps the existing view action and signed URL unchanged', async () => {
  const { open, context, tab, url } = fixture()
  await open({ key: 'rates', uploaded: true, filePath: 'listing-one/rates.pdf' })
  expect(tab.location.href).toBe(url)
  expect(context.setDetailError).toHaveBeenCalledWith('')
})

it.each([{ canDownload: false }, { can_download: false }])('denies file access when the document forbids download: %j', async permissions => {
  const { open, context } = fixture()
  await open({ key: 'identity', uploaded: true, filePath: 'listing-one/id.pdf', ...permissions }, { download: true })
  expect(context.window.open).not.toHaveBeenCalled()
  expect(context.createPrivateListingDocumentDownloadUrl).not.toHaveBeenCalled()
  expect(context.setDetailError).toHaveBeenCalledWith('You do not have permission to download this document.')
})
