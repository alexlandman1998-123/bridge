// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DevelopmentLeadAgent, DevelopmentLeadPropertyImage, DevelopmentLeadSource } from '../DevelopmentLeadVisuals.jsx'
import { getDevelopmentLeadAssignedAgent, getDevelopmentLeadSourceBrand, getDevelopmentLeadUnitImage } from '../developmentLeadVisualsModel.js'

afterEach(cleanup)

it('resolves the allocated agent through membership ID, user ID and email without using the introducing agent photo', () => {
  const users = [
    { id: 'membership-1', userId: 'agent-1', email: 'agent@example.com', fullName: 'Alex Landman', avatarUrl: '/alex.jpg' },
    { id: 'membership-2', userId: 'agent-2', fullName: 'Introducing agent', avatarUrl: '/other.jpg' },
  ]
  for (const assignedAgentId of ['membership-1', 'agent-1', 'AGENT@example.com']) {
    expect(getDevelopmentLeadAssignedAgent({ assignedAgentId, sourceAgentUserId: 'agent-2' }, users)).toEqual({ name: 'Alex Landman', avatarUrl: '/alex.jpg' })
  }
  expect(getDevelopmentLeadAssignedAgent({ assignedAgentId: 'legacy-id', assignedAgentEmail: 'AGENT@example.com' }, users).avatarUrl).toBe('/alex.jpg')
  expect(getDevelopmentLeadAssignedAgent({ assignedAgentEmail: 'agent@example.com', sourceAgentUserId: 'agent-2' }, users).avatarUrl).toBe('/alex.jpg')
  expect(getDevelopmentLeadAssignedAgent({ assignedAgentId: 'unlisted-agent', sourceAgentUserId: 'agent-2' }, users)).toEqual({ name: 'Assigned agent', avatarUrl: '' })
})

it('uses organisation logos only for a matching direct or introduced source', () => {
  const workspace = { id: 'revo', name: 'Revo', logoUrl: '/revo.svg' }
  expect(getDevelopmentLeadSourceBrand({ leadSource: 'developer_direct', developerOrgId: 'revo' }, workspace).logoUrl).toBe('/revo.svg')
  expect(getDevelopmentLeadSourceBrand({ leadSource: 'agency_introduced', sourceAgencyOrgId: 'revo' }, workspace).logoUrl).toBe('/revo.svg')
  expect(getDevelopmentLeadSourceBrand({ leadSource: 'developer_direct', developerOrgId: 'other' }, workspace).logoUrl).toBe('')
  expect(getDevelopmentLeadSourceBrand({ leadSource: 'Property24', developerOrgId: 'revo' }, workspace).logoUrl).toBe('')
  render(<DevelopmentLeadSource source="Property24" brand={{ name: 'Revo', logoUrl: '/revo.svg' }} />)
  expect(screen.getByRole('img', { name: 'Property24' }).getAttribute('src')).toBe('/lead-sources/property24.png')
})

it('chooses only the preferred unit image from this development and falls back to its cover on image failure', () => {
  const units = [{ unit: { id: 'unit-1', image_url: '/unit.jpg' } }, { unit: { id: 'unit-2', image_url: '/unrelated.jpg' } }]
  expect(getDevelopmentLeadUnitImage({ preferredUnitId: 'unit-1' }, units)).toBe('/unit.jpg')
  expect(getDevelopmentLeadUnitImage({ preferredUnitId: 'external-unit' }, units)).toBe('')
  expect(getDevelopmentLeadUnitImage({}, units)).toBe('')
  render(<DevelopmentLeadPropertyImage src="/unit.jpg" fallbackSrc="/cover.jpg" name="Buyer" />)
  fireEvent.error(screen.getByRole('img', { name: 'Property for Buyer' }))
  expect(screen.getByRole('img', { name: 'Property for Buyer' }).getAttribute('src')).toBe('/cover.jpg')
  fireEvent.error(screen.getByRole('img', { name: 'Property for Buyer' }))
  expect(screen.queryByRole('img')).toBeNull()
})

it('shows a failed agent photo as initials and accepts a refreshed photo', () => {
  const { rerender } = render(<DevelopmentLeadAgent agent={{ name: 'Alex Landman', avatarUrl: '/expired.jpg' }} />)
  fireEvent.error(screen.getByRole('img', { name: 'Alex Landman' }))
  expect(screen.getByText('AL')).toBeTruthy()
  rerender(<DevelopmentLeadAgent agent={{ name: 'Alex Landman', avatarUrl: '/new.jpg' }} />)
  expect(screen.getByRole('img', { name: 'Alex Landman' }).getAttribute('src')).toBe('/new.jpg')
})
