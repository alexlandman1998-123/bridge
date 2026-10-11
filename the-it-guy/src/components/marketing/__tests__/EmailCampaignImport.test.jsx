// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EmailCampaignImport from '../EmailCampaignImport'

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))
vi.mock('../../../services/emailCampaignAssetService', async (original) => ({ ...await original(), uploadEmailCampaignImage: mocks.upload }))
const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const png = (name = 'hero.png') => new File([signature], name, { type: 'image/png' })
const html = (content) => new File([content], 'email.html', { type: 'text/html' })
const input = () => screen.getByLabelText('Email package or HTML and images')
const confirm = () => screen.getByRole('button', { name: 'Host images and replace email' })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.upload.mockImplementation(async ({ organisationId, file }) => ({ organisation_id: organisationId, id: file.name, public_url: `https://images.example/${file.name}` }))
})
afterEach(cleanup)

it('stages a local preview and only uploads and replaces content after confirmation', async () => {
  const apply = vi.fn()
  render(<EmailCampaignImport organisationId="agency" onImported={apply} />)
  fireEvent.change(input(), { target: { files: [html('<p>Designer</p><img src="images/hero.png?cache=1">'), png()] } })
  await screen.findByText('Ready: hero.png')
  await waitFor(() => expect(screen.getByTitle('Uploaded email preview').srcdoc).toContain('src="data:image/png;base64,'))
  expect(screen.getByTitle('Uploaded email preview').srcdoc).not.toContain('?cache=1')
  expect(screen.getByTitle('Uploaded email preview').getAttribute('sandbox')).toBe('')
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(confirm())
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
  expect(apply.mock.calls[0][0].html).toContain('https://images.example/hero.png?cache=1')
})

it('lets users resolve a missing image and then import', async () => {
  const apply = vi.fn()
  render(<EmailCampaignImport organisationId="agency" onImported={apply} />)
  fireEvent.change(input(), { target: { files: [html('<img src="images/missing.png">')] } })
  await screen.findByText('Image missing. Choose a file below.')
  expect(confirm().disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Choose image for images/missing.png'), { target: { files: [png()] } })
  await screen.findByText('Ready: hero.png')
  await screen.findByTitle('Uploaded email preview')
  expect(confirm().disabled).toBe(false)
  fireEvent.click(confirm())
  await waitFor(() => expect(apply).toHaveBeenCalled())
})

it('keeps the staged email after a failure and retries without reuploading completed images', async () => {
  const apply = vi.fn()
  mocks.upload.mockResolvedValueOnce({ id: 'first', organisation_id: 'agency', public_url: 'https://images.example/first.png' }).mockRejectedValueOnce(new Error('Connection lost. Try again.'))
  render(<EmailCampaignImport organisationId="agency" onImported={apply} />)
  fireEvent.change(input(), { target: { files: [html('<img src="hero.png"><img src="footer.png">'), png(), png('footer.png')] } })
  await screen.findByText('Ready: footer.png')
  await screen.findByTitle('Uploaded email preview')
  fireEvent.click(confirm())
  expect((await screen.findByRole('alert')).textContent).toContain('Connection lost')
  expect(apply).not.toHaveBeenCalled()
  expect(confirm().disabled).toBe(false)
  fireEvent.click(confirm())
  await waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
  expect(mocks.upload).toHaveBeenCalledTimes(3)
})

it('ignores an in-flight upload when the dialog is closed', async () => {
  let resolveUpload
  mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
  const apply = vi.fn()
  const view = render(<EmailCampaignImport organisationId="agency" onImported={apply} />)
  fireEvent.change(input(), { target: { files: [html('<img src="hero.png"><img src="footer.png">'), png(), png('footer.png')] } })
  await screen.findByText('Ready: footer.png')
  await screen.findByTitle('Uploaded email preview')
  fireEvent.click(confirm())
  await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1))
  expect(input().disabled).toBe(true)
  view.unmount()
  await act(async () => resolveUpload({ id: 'first', organisation_id: 'agency', public_url: 'https://images.example/first.png' }))
  expect(apply).not.toHaveBeenCalled()
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})

it('reports invalid packages and leaves a new file selection available', async () => {
  render(<EmailCampaignImport organisationId="agency" onImported={vi.fn()} />)
  fireEvent.change(input(), { target: { files: [html('<p>A</p>'), html('<p>B</p>')] } })
  expect((await screen.findByRole('alert')).textContent).toContain('Choose one ZIP')
  expect(input().disabled).toBe(false)
  expect(screen.queryByTitle('Uploaded email preview')).toBeNull()
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('surfaces invalid replacement bytes before allowing confirmation or uploading', async () => {
  render(<EmailCampaignImport organisationId="agency" onImported={vi.fn()} />)
  fireEvent.change(input(), { target: { files: [html('<img src="hero.png"><img src="missing.png">'), png()] } })
  await screen.findByText('Ready: hero.png')
  fireEvent.change(screen.getByLabelText('Choose image for missing.png'), { target: { files: [new File(['bad'], 'missing.png', { type: 'image/png' })] } })
  expect((await screen.findByRole('alert')).textContent).toContain('contents')
  expect(confirm().disabled).toBe(true)
  expect(mocks.upload).not.toHaveBeenCalled()
})

it('bounds preview expansion when the HTML repeats the same image many times', async () => {
  render(<EmailCampaignImport organisationId="agency" onImported={vi.fn()} />)
  const bytes = new Uint8Array(16 * 1024)
  bytes.set(signature)
  fireEvent.change(input(), { target: { files: [html('<img src="hero.png">'.repeat(4000)), new File([bytes], 'hero.png', { type: 'image/png' })] } })
  expect((await screen.findByRole('alert', {}, { timeout: 4000 })).textContent).toContain('repeats large images')
  expect(confirm().disabled).toBe(true)
  expect(mocks.upload).not.toHaveBeenCalled()
})
