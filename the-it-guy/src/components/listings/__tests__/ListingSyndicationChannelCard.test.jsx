// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ListingSyndicationChannelCard from '../ListingSyndicationChannelCard'

afterEach(cleanup)

it('keeps internal storage included and separates fixing details from selecting a portal', () => {
  const toggle = vi.fn()
  const fix = vi.fn()
  render(<>
    <ListingSyndicationChannelCard channel={{ key: 'arch9_internal', label: 'Arch9 Platform', internalOnly: true }} selected onToggle={toggle} />
    <ListingSyndicationChannelCard channel={{ key: 'property24', label: 'Property24' }} selected={false} needsAttention="2 required fields missing" onToggle={toggle}><button type="button" onClick={fix}>Fix fields</button></ListingSyndicationChannelCard>
  </>)
  const internal = screen.getByRole('button', { name: 'Arch9 Platform' })
  expect(internal.disabled).toBe(true)
  expect(internal.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(internal)
  fireEvent.click(screen.getByRole('button', { name: 'Fix fields' }))
  expect(fix).toHaveBeenCalledTimes(1)
  expect(toggle).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Property24' }))
  expect(toggle).toHaveBeenCalledWith('property24')
})
