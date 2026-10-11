// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ListingSaveStatus from '../ListingSaveStatus'
import RentalListingIndexCard from '../RentalListingIndexCard'
import SalesListingIndexCard from '../SalesListingIndexCard'

afterEach(cleanup)
it('shows saving and pending photos without claiming Listings has saved them', () => {
  render(<ListingSaveStatus cloud={{ status: 'saving' }} recovery="photos" dirty />)
  expect(screen.getByText('Saving to Listings…')).toBeTruthy()
  expect(screen.getByText(/Photos are still saving/)).toBeTruthy()
  expect(screen.queryByText(/^Saved to Listings/)).toBeNull()
})
it('shows a verified saved time and stops claiming new edits are saved', () => {
  const cloud = { status: 'saved', savedAt: '2026-10-11T12:00:00Z' }
  const view = render(<ListingSaveStatus cloud={cloud} recovery="device" />)
  expect(screen.getByText(/^Saved to Listings at/)).toBeTruthy()
  view.rerender(<ListingSaveStatus cloud={cloud} recovery="device" dirty />)
  expect(screen.queryByText(/^Saved to Listings/)).toBeNull()
  expect(screen.getByText(/Changes kept on this device/)).toBeTruthy()
})
it('separates failed cloud saving from device recovery', () => {
  render(<ListingSaveStatus cloud={{ status: 'error' }} recovery="device" dirty />)
  expect(screen.getByText(/Could not confirm saving to Listings/)).toBeTruthy()
  expect(screen.getByText(/Changes kept on this device/)).toBeTruthy()
})
it('names the saving action available in an existing sale editor', () => {
  render(<ListingSaveStatus cloud={{ status: 'error' }} recovery="device" dirty saveLabel="Save changes" />)
  expect(screen.getByText(/retry Save changes/)).toBeTruthy()
  expect(screen.getByText(/Use Save changes to continue/)).toBeTruthy()
  expect(screen.queryByText(/Save draft/)).toBeNull()
})
it('makes continuing rental and sale drafts visible on their listing cards', () => {
  render(<><RentalListingIndexCard row={{ title: 'Rental draft', isCaptureDraft: true }} liveChannels={[]} />
    <SalesListingIndexCard card={{ addressLabel: 'Sale draft', liveChannels: [] }} openLabel="Continue draft" /></>)
  expect(screen.getAllByRole('button', { name: 'Continue draft' })).toHaveLength(2)
})

it('can hide the routine device notice while preserving actual save errors', () => {
 const view = render(<ListingSaveStatus hideDeviceNotice recovery="device" dirty />)
 expect(screen.queryByRole('status')).toBeNull()
 view.rerender(<ListingSaveStatus hideDeviceNotice cloud={{ status: 'error' }} recovery="device" dirty />)
 expect(screen.getByText(/Could not confirm saving/)).toBeTruthy()
})


it('hides an editor’s routine saved notice while keeping saving and failure visible', () => {
  const view = render(<ListingSaveStatus hideSavedNotice hideDeviceNotice cloud={{ status: 'saved', savedAt: '2026-10-11T12:00:00Z' }} />)
  expect(screen.queryByRole('status')).toBeNull()
  view.rerender(<ListingSaveStatus hideSavedNotice cloud={{ status: 'saving' }} />)
  expect(screen.getByText('Saving to Listings…')).toBeTruthy()
  view.rerender(<ListingSaveStatus hideSavedNotice cloud={{ status: 'error' }} saveLabel="Save changes" />)
  expect(screen.getByText(/retry Save changes/)).toBeTruthy()
})
