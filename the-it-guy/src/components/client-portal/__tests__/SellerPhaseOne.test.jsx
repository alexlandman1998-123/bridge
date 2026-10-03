// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import SellerTeamWorkspace from '../team/SellerTeamWorkspace.jsx'
import SellerChecklistSummary from '../documents/SellerChecklistSummary.jsx'
import { buildSellerPortalDocumentSummary, isSellerTeamManagedDocument } from '../../../core/clientPortal/sellerPortalDocumentSummary.js'

afterEach(cleanup)

test('only assigned contacts have actions; missing agent is not replaced with the agency', () => {
  render(<SellerTeamWorkspace model={{ members: [] }} agencyName="Only Realty" />)
  expect(screen.getByText('Agent details not yet available')).toBeTruthy()
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(screen.queryByText('Active now')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})

test('renders verified agent and legal contacts, with actions only for available details', () => {
  render(<SellerTeamWorkspace hasTransaction model={{ members: [
    { id: 'agent', role: 'Estate Agent', name: 'Listing Agent', email: 'agent@onlyrealty.co.za', phone: '0123456789', organisation: 'Only Realty' },
    { id: 'attorney', role: 'Transferring Attorney', name: 'Legal Contact', phone: '0987654321' },
    { id: 'secretary', role: 'Conveyancing Secretary', name: 'Assigned Secretary' },
  ] }} />)
  expect(screen.getByRole('link', { name: 'agent@onlyrealty.co.za' }).getAttribute('href')).toBe('mailto:agent@onlyrealty.co.za')
  expect(screen.getByRole('link', { name: '0123456789' }).getAttribute('href')).toBe('tel:0123456789')
  expect(screen.getByText('Your legal team')).toBeTruthy()
  expect(screen.getAllByRole('link')).toHaveLength(3)
})

test('document checklist matches Overview while excluding team-managed packs and signed copies', () => {
  const documentCenter = { items: [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `request-${index}`, sourceType: 'required_document', status: 'required' })),
    { id: 'mandate', key: 'signed_mandate', sourceType: 'required_document', status: 'required' },
    { id: 'fica', key: 'signed_fica_declaration', sourceType: 'required_document', status: 'required' },
    { id: 'copy', sourceType: 'generated_document', status: 'completed' },
  ] }
  expect(buildSellerPortalDocumentSummary(documentCenter).actionRequired).toBe(10)
  expect(isSellerTeamManagedDocument(documentCenter.items[10])).toBe(true)
  render(<SellerChecklistSummary documentCenter={documentCenter} />)
  expect(screen.getByText('10')).toBeTruthy()
  expect(screen.queryByText('12')).toBeNull()
  expect(screen.getByText(/signed copies are listed separately/)).toBeTruthy()
})

test('failed document reads do not report a zero checklist', () => {
  render(<SellerChecklistSummary documentCenter={{ loadError: 'temporary failure' }} />)
  expect(screen.getByRole('status').textContent).toContain('unavailable')
  expect(screen.queryByText('0')).toBeNull()
})

 test('placeholder emails are not exposed as working team contacts', () => {
  render(<SellerTeamWorkspace model={{ members: [
    { id: 'agent', role: 'Estate Agent', name: 'Agent', email: 'agent@agency.test' },
    { id: 'legal', role: 'Transferring Attorney', name: 'Attorney', email: 'legal@example.com' },
  ] }} />)
  expect(screen.queryAllByRole('link')).toHaveLength(0)
})
