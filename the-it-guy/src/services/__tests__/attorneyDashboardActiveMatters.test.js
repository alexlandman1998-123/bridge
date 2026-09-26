import { describe, expect, it } from 'vitest'

import { mapMatterToActiveMatterCard } from '../attorneyDashboard'

describe('attorney dashboard active matter cards', () => {
  it('does not infer progress from legacy stage text when canonical workflow steps are unavailable', () => {
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
    expect(card.progress).toBe(0)
  })

  it('updates progress from the applicable canonical workflow steps', () => {
    const transaction = {
      id: 'matter-progress',
      routing_profile_json: {
        workflowPlan: {
          status: 'active',
          laneKeys: ['transfer'],
          lanes: [{ laneKey: 'transfer', stepKeys: ['instruction_received', 'matter_opened'] }],
        },
      },
      attorneyWorkflowLanes: [{
        process_type: 'transfer',
        transaction_subprocess_steps: [
          { step_key: 'instruction_received', status: 'completed' },
          { step_key: 'matter_opened', status: 'not_started' },
        ],
      }],
    }
    const buildCard = () => mapMatterToActiveMatterCard({
      summary: { transactionId: transaction.id, roles: new Set(['transfer']), transaction },
      primaryUnit: { transactionId: transaction.id, flags: {} },
    })

    expect(buildCard().progress).toBe(50)
    transaction.attorneyWorkflowLanes[0].transaction_subprocess_steps[1].status = 'completed'
    expect(buildCard().progress).toBe(100)
  })

  it('uses the matter-type financial field and retains the firm-level team fallback', () => {
    const card = mapMatterToActiveMatterCard({
      summary: {
        transactionId: 'matter-2',
        roles: new Set(['bond']),
        transaction: { id: 'matter-2', bond_amount: 1850000, attorney_stage: 'application_submitted' },
      },
      primaryUnit: { transactionId: 'matter-2', flags: { awaitingGuarantees: true } },
    })

    expect(card.value).toBe(1850000)
    expect(card.assignedStaff).toBe('Attorney team')
    expect(card.statusLabel).toBe('Awaiting Bank')
  })

  it('uses the linked scheme and unit instead of attorney-assignment metadata', () => {
    const card = mapMatterToActiveMatterCard({
      summary: {
        transactionId: 'matter-3',
        roles: new Set(['transfer']),
        transaction: {
          id: 'matter-3',
          property_tenure: 'sectional_title',
          development_name: 'Junoah Estate',
          unit_number: '12B',
        },
      },
      primaryUnit: {
        transactionId: 'matter-3',
        // This is assignment metadata, not the property unit.
        unit_number: 'assignment-row',
      },
    })

    expect(card.propertyAddress).toBe('Unit 12B | Junoah Estate')
  })
})
