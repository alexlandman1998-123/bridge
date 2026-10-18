// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ListingInstagramPostPanel from '../ListingInstagramPostPanel'

const mocks = vi.hoisted(() => ({ request: vi.fn(), viewer: 'user-one', role: 'principal', workspace: 'org-one', accounts: [], photos: [], posts: [], publish: null }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { user: { id: mocks.viewer }, currentWorkspace: { id: mocks.workspace }, currentMembership: { role: mocks.role, status: 'active' } } }) }))
vi.mock('../../../services/metaIntegrationService', () => ({ metaIntegrationRequest: mocks.request }))
const account = { id: '500', connectionId: 'connection-one', username: 'arch9_test', name: 'Arch9', pageName: 'Arch9 Page' }
const photo = { id: 'photo-one', url: 'https://example.supabase.co/cover.jpg', label: 'Listing photo 1 · cover' }
const post = { id: 'post-one', platform: 'instagram', status: 'draft', created_by: 'user-one', target_account_name: 'arch9_test', snapshot_json: { imageId: photo.id, imageUrl: photo.url, caption: 'Reviewed public caption' } }
const view = (organisationId = 'org-one', listingId = 'listing-one') => <MemoryRouter><ListingInstagramPostPanel organisationId={organisationId} listingId={listingId} /></MemoryRouter>

beforeEach(() => {
  mocks.viewer = 'user-one'; mocks.role = 'principal'; mocks.workspace = 'org-one'; mocks.accounts = [account]; mocks.photos = [photo]; mocks.posts = []; mocks.publish = { ...post, status: 'published', public_url: 'https://www.instagram.com/p/Arch9_test/' }
  mocks.request.mockImplementation(async (_org, action, fields) => {
    if (action === 'instagram_accounts') return { accounts: mocks.accounts, issues: [] }
    if (action === 'instagram_listing_options') return { photos: mocks.photos, caption: 'Default public caption' }
    if (action === 'instagram_listing_posts') return { posts: mocks.posts }
    if (action === 'preview_instagram_post') return { post: { ...post, target_account_name: mocks.accounts.find(row => row.id === fields.instagramAccountId)?.username, snapshot_json: { ...post.snapshot_json, imageId: fields.imageId, imageUrl: mocks.photos.find(row => row.id === fields.imageId)?.url, caption: fields.caption } } }
    if (action === 'publish_instagram_post' || action === 'refresh_instagram_post') return { post: mocks.publish }
    throw Error(`Unexpected action ${action}`)
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

async function preview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Preview Instagram post' }))
  return screen.findByRole('dialog', { name: 'Review Instagram post' })
}

it('requires a reviewed photo and caption before an explicit Instagram publish', async () => {
  render(view())
  await preview()
  expect(mocks.request.mock.calls.some(call => call[1] === 'publish_instagram_post')).toBe(false)
  expect(screen.getByAltText('Reviewed listing photo for Instagram').src).toBe(photo.url)
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Instagram' }))
  await screen.findByText('Meta accepted this Instagram post.')
  expect(screen.getByRole('link', { name: 'Open on Instagram' }).href).toBe('https://www.instagram.com/p/Arch9_test/')
  expect(mocks.request.mock.calls.filter(call => call[1] === 'publish_instagram_post')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Publish to Instagram' })).toBeNull()
})

it('saves the selected account, listing photo and exact caption in the reviewed preview', async () => {
  mocks.accounts.push({ ...account, id: '501', connectionId: 'connection-two', username: 'second_agency' })
  mocks.photos.push({ id: 'photo-two', url: 'https://example.supabase.co/second.jpg', label: 'Listing photo 2' })
  render(view())
  fireEvent.change(await screen.findByLabelText('Instagram account'), { target: { value: '501' } })
  fireEvent.change(screen.getByLabelText('Instagram listing photo'), { target: { value: 'photo-two' } })
  fireEvent.change(screen.getByLabelText('Instagram caption'), { target: { value: 'Public listing caption\nhttps://agency.example/listing' } })
  await preview()
  expect(mocks.request).toHaveBeenCalledWith('org-one', 'preview_instagram_post', { listingId: 'listing-one', connectionId: 'connection-two', instagramAccountId: '501', imageId: 'photo-two', caption: 'Public listing caption\nhttps://agency.example/listing' })
  expect(screen.getByText(/Publish will share.*second_agency/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.change(screen.getByLabelText('Instagram caption'), { target: { value: 'Changed caption' } })
  expect(screen.queryByRole('button', { name: 'Publish to Instagram' })).toBeNull()
  await preview()
  expect(mocks.request.mock.calls.filter(call => call[1] === 'preview_instagram_post')).toHaveLength(2)
})

it('shows processing and separates a status check from finishing the publish', async () => {
  mocks.publish = { ...post, status: 'publishing', provider_container_id: 'container-one', publish_requested_at: null }
  render(view()); await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Instagram' }))
  await screen.findByRole('button', { name: 'Check and finish publishing' })
  fireEvent.click(screen.getByRole('button', { name: 'Check Instagram status' }))
  await waitFor(() => expect(mocks.request.mock.calls.filter(call => call[1] === 'refresh_instagram_post')).toHaveLength(1))
  expect(mocks.request.mock.calls.filter(call => call[1] === 'publish_instagram_post')).toHaveLength(1)
  mocks.publish = { ...post, status: 'published' }
  fireEvent.click(screen.getByRole('button', { name: 'Check and finish publishing' }))
  await screen.findByText('Meta accepted this Instagram post.')
  expect(mocks.request.mock.calls.filter(call => call[1] === 'publish_instagram_post')).toHaveLength(2)
})

it('does not offer another publish after an unknown result or an outstanding provider claim', async () => {
  mocks.publish = { ...post, status: 'unknown', error_message: 'Check Instagram before creating another post.' }
  render(view()); await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Publish to Instagram' }))
  await screen.findByText('Check Instagram before creating another post.')
  expect(screen.queryByRole('button', { name: 'Publish to Instagram' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Check and finish publishing' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Check Instagram status' }))
  await waitFor(() => expect(mocks.request.mock.calls.filter(call => call[1] === 'refresh_instagram_post')).toHaveLength(1))
  expect(mocks.request.mock.calls.filter(call => call[1] === 'publish_instagram_post')).toHaveLength(1)
})

it('guides connection setup and blocks missing photos or an overlong caption', async () => {
  mocks.accounts = []
  const rendered = render(view())
  expect(await screen.findByRole('link', { name: 'Manage Meta connection' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Preview Instagram post' })).toBeNull()
  rendered.unmount(); mocks.accounts = [account]; mocks.photos = []
  render(view()); await screen.findByLabelText('Instagram caption')
  expect(screen.getByRole('button', { name: 'Preview Instagram post' }).disabled).toBe(true)
  cleanup(); mocks.photos = [photo]; render(view())
  fireEvent.change(await screen.findByLabelText('Instagram caption'), { target: { value: 'a'.repeat(2201) } })
  expect(screen.getByRole('button', { name: 'Preview Instagram post' }).disabled).toBe(true)
  expect(mocks.request.mock.calls.some(call => call[1] === 'preview_instagram_post')).toBe(false)
})

it('discards old previews, private drafts and late responses when the account or agency changes', async () => {
  const rendered = render(view()); await preview()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.change(screen.getByLabelText('Instagram caption'), { target: { value: 'Private unsent draft' } })
  let resolveOld
  const original = mocks.request.getMockImplementation()
  mocks.request.mockImplementation((org, action, fields) => action === 'instagram_listing_options' ? new Promise(resolve => { resolveOld = resolve }) : original(org, action, fields))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Instagram' }))
  await waitFor(() => expect(resolveOld).toBeTypeOf('function'))
  mocks.viewer = 'user-two'; mocks.role = 'agent'; mocks.workspace = 'org-two'; mocks.request.mockRejectedValue(Error('Listing access revoked'))
  rendered.rerender(view('org-two', 'listing-two'))
  expect(screen.queryByDisplayValue('Private unsent draft')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByText('Listing access revoked')
  resolveOld({ photos: [photo], caption: 'Old private caption' })
  await waitFor(() => expect(screen.queryByDisplayValue('Old private caption')).toBeNull())
})

it('clears a same-agency preview and caption immediately after a user or role changes', async () => {
  const rendered = render(view()); await preview()
  mocks.viewer = 'user-two'; mocks.role = 'agent'; mocks.request.mockRejectedValue(Error('No listing access'))
  rendered.rerender(view())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByDisplayValue('Default public caption')).toBeNull()
  await screen.findByText('No listing access')
})

it('removes the previous listing editor immediately when only the active workspace changes', async () => {
  const rendered = render(view()); await preview()
  const requests = mocks.request.mock.calls.length
  mocks.workspace = 'org-two'
  rendered.rerender(view())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByDisplayValue('Default public caption')).toBeNull()
  expect(screen.getByText('Open this listing in its agency workspace to publish to Instagram.')).toBeTruthy()
  expect(mocks.request.mock.calls).toHaveLength(requests)
})

it('opens a saved result and clears its details when a refresh revokes listing access', async () => {
  mocks.posts = [{ ...post, status: 'unknown', error_message: 'Unconfirmed public post' }]
  render(view())
  fireEvent.click(await screen.findByRole('button', { name: 'Review post details' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  mocks.request.mockRejectedValue(Error('Listing no longer available'))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh Instagram' }))
  await screen.findByText('Listing no longer available')
  expect(screen.queryByText('Unconfirmed public post')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
})
