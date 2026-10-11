// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { getEmailCampaignAssets, uploadEmailCampaignImage } from '../emailCampaignAssetService'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), bucket: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: mocks.rpc, storage: { from: mocks.bucket } } }))
const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const asset = { id: assetId, organisation_id: org, storage_path: `organisations/${org}/${assetId}.png`, original_name: 'hero.png', mime_type: 'image/png', byte_size: 8 }
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'hero.png', { type: 'image/png' })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.bucket.mockReturnValue({ upload: mocks.upload, getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.example/object/public/email-campaign-images/${path}` } }) })
  mocks.upload.mockResolvedValue({ data: {}, error: null })
  mocks.rpc.mockImplementation(async (name) => ({ data: name === 'email_campaign_reserve_asset' ? asset : [asset], error: null }))
})

it('reserves agency ownership and verifies the receipt before returning a permanent public URL', async () => {
  const file = png()
  const result = await uploadEmailCampaignImage({ organisationId: org, file })
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['email_campaign_reserve_asset', 'email_campaign_list_assets'])
  expect(mocks.rpc.mock.calls[0][1]).toEqual({ p_organisation_id: org, p_original_name: 'hero.png', p_mime_type: 'image/png', p_byte_size: 8 })
  expect(mocks.upload).toHaveBeenCalledWith(asset.storage_path, file, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
  expect(mocks.rpc.mock.calls[1][1]).toEqual({ p_organisation_id: org, p_asset_id: assetId })
  expect(result.public_url).toContain('/object/public/email-campaign-images/')
  expect(result.public_url).not.toContain('token=')
})

it('rejects unsupported, empty, oversized and disguised files before reserving or uploading', async () => {
  for (const file of [new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }), new File([], 'empty.png', { type: 'image/png' }), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), new File(['<html>'], 'fake.png', { type: 'image/png' })]) {
    await expect(uploadEmailCampaignImage({ organisationId: org, file })).rejects.toThrow()
  }
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.upload).not.toHaveBeenCalled()
})

it.each([
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/gif', [...'GIF89a'].map((char) => char.charCodeAt(0))],
  ['image/webp', [...'RIFF0000WEBP'].map((char) => char.charCodeAt(0))],
])('accepts the supported %s signature and reserves a canonical extension', async (type, signature) => {
  const extension = { 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type]
  const row = { ...asset, mime_type: type, storage_path: `organisations/${org}/${assetId}.${extension}` }
  mocks.rpc.mockImplementation(async (name) => ({ data: name === 'email_campaign_reserve_asset' ? row : [row] }))
  await expect(uploadEmailCampaignImage({ organisationId: org, file: new File([new Uint8Array(signature)], 'image', { type }) })).resolves.toMatchObject({ mime_type: type })
})

it('refuses a forged reservation from another agency', async () => {
  mocks.rpc.mockResolvedValue({ data: { ...asset, organisation_id: otherOrg } })
  await expect(uploadEmailCampaignImage({ organisationId: org, file: png() })).rejects.toThrow('ownership')
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('recognises an upload that completed despite an interrupted response without retrying or overwriting', async () => {
  mocks.upload.mockRejectedValue(new Error('network interruption'))
  await expect(uploadEmailCampaignImage({ organisationId: org, file: png() })).resolves.toMatchObject({ id: assetId })
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})

it('does not report a failed or unconfirmed upload as successful', async () => {
  mocks.upload.mockResolvedValue({ error: new Error('Upload rejected') })
  mocks.rpc.mockResolvedValueOnce({ data: asset }).mockResolvedValueOnce({ data: [] })
  await expect(uploadEmailCampaignImage({ organisationId: org, file: png() })).rejects.toThrow('Upload rejected')
  mocks.rpc.mockResolvedValueOnce({ data: asset }).mockResolvedValueOnce({ error: new Error('receipt unavailable') })
  await expect(uploadEmailCampaignImage({ organisationId: org, file: png() })).rejects.toThrow('Refresh the image library')
})

it('loads only the selected agency and surfaces unavailable hosting', async () => {
  expect(await getEmailCampaignAssets(org)).toHaveLength(1)
  expect(mocks.rpc).toHaveBeenCalledWith('email_campaign_list_assets', { p_organisation_id: org, p_asset_id: null })
  mocks.rpc.mockResolvedValue({ error: new Error('Hosting not installed') })
  await expect(getEmailCampaignAssets(org)).rejects.toThrow('Hosting not installed')
  await expect(getEmailCampaignAssets('')).rejects.toThrow('Choose an agency')
})

it('explains missing hosting setup without exposing database implementation details', async () => {
  mocks.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Could not find function in the schema cache' } })
  await expect(getEmailCampaignAssets(org)).rejects.toThrow('Ask your workspace administrator to enable it')
})
