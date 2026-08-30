import { describe, expect, it } from 'vitest'

import { mapMatterToActiveMatterCard } from '../attorneyDashboard'

describe('attorney dashboard active matter cards', () => {
  it('maps existing matter state into a card without dashboard-only status or progress fields', () => {
    const card = mapMatterToActiveMatterCard({
      summary: {
        transactionId: 'matter-1',
        roles: new Set(['transfer']),
        transaction: {
          id: 'matter-1',
          matter_number: 'MAT-2026-000001',
          attorney_stage: 'buyer_fica_requested',
          purchase_price: 2450000,
          property_address_line_1: '123 Main Road',
          suburb: 'Bryanston',
        },
      },
      primaryUnit: {
        transactionId: 'matter-1',
        flags: { awaitingFica: true },
      },
    })

    expect(card).toMatchObject({
      id: 'matter-1',
      reference: 'MAT-2026-000001',
      matterType: 'transfer',
      statusLabel: 'Awaiting FICA',
      contextLabel: 'Client documents required',
      value: 2450000,
      href: '/transactions/matter-1',
    })
    expect(card.progress).toBeGreaterThan(0)
  })

  it('uses the matter-type financial field and retains an unassigned attorney', () => {
    const card = mapMatterToActiveMatterCard({
      summary: {
        transactionId: 'matter-2',
        roles: new Set(['bond']),
        transaction: { id: 'matter-2', bond_amount: 1850000, attorney_stage: 'application_submitted' },
      },
      primaryUnit: { transactionId: 'matter-2', flags: { awaitingGuarantees: true } },
    })

    expect(card.value).toBe(1850000)
    expect(card.assignedStaff).toBe('Unassigned')
    expect(card.statusLabel).toBe('Awaiting Bank')
  })
})
