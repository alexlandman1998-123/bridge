// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import EmailCampaignImages from '../EmailCampaignImages'
import EmailVisualEditor from '../EmailVisualEditor'
import { createEmailDocument } from '../../../../../supabase/functions/_shared/emailDocument.js'

const mocks = vi.hoisted(() => ({ list: vi.fn(), upload: vi.fn(), copy: vi.fn() }))
vi.mock('../../../services/emailCampaignAssetService', () => ({ getEmailCampaignAssets: mocks.list, uploadEmailCampaignImage: mocks.upload }))
const image = { id: 'image-1', original_name: 'hero.png', byte_size: 1024, public_url: 'https://images.example/hero.png' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.list.mockResolvedValue([])
  mocks.upload.mockResolvedValue(image)
  mocks.copy.mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } })
})
afterEach(cleanup)

it('uploads an image, lets users select it and copies a stable link without deletion controls', async () => {
  const select = vi.fn()
  render(<EmailCampaignImages organisationId="agency" onSelect={select} />)
  await screen.findByText('No campaign images yet. Upload your first image above.')
  const file = new File(['image'], 'hero.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Upload campaign image'), { target: { files: [file] } })
  await screen.findByLabelText('Image link for hero.png')
  expect(mocks.upload).toHaveBeenCalledWith({ organisationId: 'agency', file })
  expect(select).toHaveBeenCalledWith(image)
  fireEvent.click(screen.getByRole('button', { name: 'Copy link hero.png' }))
  await screen.findByText('Image link copied for hero.png.')
  expect(mocks.copy).toHaveBeenCalledWith(image.public_url)
  expect(screen.queryByRole('button', { name: /delete|replace/i })).toBeNull()
  expect(screen.getByLabelText('Image link for hero.png').readOnly).toBe(true)
})

it('adds a hosted image to the selected visual block', async () => {
  mocks.list.mockResolvedValue([image])
  const change = vi.fn()
  const document = createEmailDocument()
  render(<EmailVisualEditor organisationId="agency" document={document} onChange={change} templates={[]} listings={[]} contacts={[]} brand={{}} context={{}} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Use image hero.png' }))
  expect(change.mock.calls[0][0].blocks[0]).toMatchObject({ id: document.blocks[0].id, src: image.public_url })
})

it('keeps the image list when an upload fails and makes retry available', async () => {
  mocks.list.mockResolvedValue([image])
  mocks.upload.mockRejectedValue(new Error('Images must be 5 MB or smaller.'))
  render(<EmailCampaignImages organisationId="agency" />)
  await screen.findByLabelText('Image link for hero.png')
  fireEvent.change(screen.getByLabelText('Upload campaign image'), { target: { files: [new File(['x'], 'large.png')] } })
  expect((await screen.findByRole('alert')).textContent).toContain('5 MB')
  expect(screen.getByLabelText('Image link for hero.png')).toBeTruthy()
  expect(screen.getByLabelText('Upload campaign image').disabled).toBe(false)
})

it('blocks another upload while the first is running and ignores an older list response', async () => {
  let resolveList, resolveUpload
  mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve }))
  mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
  render(<EmailCampaignImages organisationId="agency" />)
  fireEvent.change(screen.getByLabelText('Upload campaign image'), { target: { files: [new File(['x'], 'hero.png')] } })
  expect(screen.getByLabelText('Upload campaign image').disabled).toBe(true)
  await act(async () => resolveUpload(image))
  await screen.findByLabelText('Image link for hero.png')
  await act(async () => resolveList([]))
  expect(screen.getByLabelText('Image link for hero.png')).toBeTruthy()
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})

it('discards a previous agency’s in-flight upload after switching workspaces', async () => {
  let resolveUpload
  mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve }))
  const select = vi.fn()
  const view = render(<EmailCampaignImages organisationId="first" onSelect={select} />)
  await screen.findByText('No campaign images yet. Upload your first image above.')
  fireEvent.change(screen.getByLabelText('Upload campaign image'), { target: { files: [new File(['x'], 'hero.png')] } })
  view.rerender(<EmailCampaignImages organisationId="second" onSelect={select} />)
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith('second'))
  await act(async () => resolveUpload(image))
  expect(screen.queryByText('hero.png')).toBeNull()
  expect(select).not.toHaveBeenCalled()
})

it('keeps a manually copyable URL when clipboard access is denied', async () => {
  mocks.list.mockResolvedValue([image])
  mocks.copy.mockRejectedValue(new Error('denied'))
  render(<EmailCampaignImages organisationId="agency" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link hero.png' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Select and copy')
  expect(screen.getByLabelText('Image link for hero.png').value).toBe(image.public_url)
})
