// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import DevelopmentCoverImage from '../DevelopmentCoverImage.jsx'
import { resolveDevelopmentCoverImage } from '../../../lib/developmentMediaStorage.js'

vi.mock('../../../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../../../lib/developmentMediaStorage.js', () => ({ resolveDevelopmentCoverImage: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('downloads the optimized image first without also downloading the original', async () => {
  let finish
  resolveDevelopmentCoverImage.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { container } = render(<DevelopmentCoverImage src="/original.jpg" developmentId="dev-one" />)
  expect(container.querySelector('img')).toBeNull()
  finish('/small.webp')
  await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('/small.webp'))
})
it('falls back once if resizing fails and removes a broken original', async () => {
  resolveDevelopmentCoverImage.mockResolvedValue('/small.webp')
  const { container } = render(<DevelopmentCoverImage src="/original.jpg" developmentId="dev-one" />)
  await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
  fireEvent.error(container.querySelector('img'))
  expect(container.querySelector('img').getAttribute('src')).toBe('/original.jpg')
  fireEvent.error(container.querySelector('img'))
  expect(container.querySelector('img')).toBeNull()
})
it('ignores a late response from the previous cover or development', async () => {
  let finishOld
  resolveDevelopmentCoverImage.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve })).mockResolvedValue('/new.webp')
  const { container, rerender } = render(<DevelopmentCoverImage src="/old.jpg" developmentId="dev-one" />)
  rerender(<DevelopmentCoverImage src="/new.jpg" developmentId="dev-two" />)
  await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('/new.webp'))
  finishOld('/old.webp')
  await Promise.resolve()
  expect(container.querySelector('img').getAttribute('src')).toBe('/new.webp')
})
