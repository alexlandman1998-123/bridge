import { describe, expect, it } from 'vitest'
import { DEVELOPMENT_LEAD_STAGES } from '../../leads/developmentBuyerLead.js'
import { DEVELOPMENT_LEAD_BOARD_STAGES, getDevelopmentLeadBoardStage, resolveDevelopmentLeadBoardMove } from '../developmentLeadBoard.js'

describe('Revo development board stages', () => {
  it('uses the shared sales workflow in order with Lost as the final lead outcome', () => {
    expect(DEVELOPMENT_LEAD_BOARD_STAGES.map(({ key, label }) => [key, label])).toEqual([...DEVELOPMENT_LEAD_STAGES.slice(0, 8).map(([key, label]) => [key, label]), ['lost', 'Lost']])
  })
  it.each([
    ['new', 'captured'], ['contacted', 'contacted'], ['qualified', 'qualified'], ['viewing', 'viewing'],
    ['reserved', 'development_selection'], ['onboarding_sent', 'transaction_setup'], ['onboarding_submitted', 'transaction_setup'], ['otp', 'offer'], ['converted', 'transaction'], ['lost', 'lost'],
  ])('maps saved %s leads to %s without merging workflow steps', (leadStatus, key) => {
    expect(getDevelopmentLeadBoardStage({ leadStatus }).key).toBe(key)
  })
  it('saves follow-up moves, ignores the current column and rejects unknown stages', () => {
    expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'new' }, 'qualified')).toMatchObject({ kind: 'status', status: 'qualified' })
    expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'qualified' }, 'qualified')).toEqual({ kind: 'noop' })
    expect(() => resolveDevelopmentLeadBoardMove({}, 'fake')).toThrow('valid development lead stage')
  })
  it('opens reservation and onboarding actions instead of recording uncompleted workflow', () => {
    expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'qualified' }, 'development_selection')).toMatchObject({ kind: 'workflow', tab: 'development' })
    for (const target of ['transaction_setup', 'offer', 'transaction']) expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'viewing' }, target)).toMatchObject({ kind: 'workflow', tab: 'onboarding_otp' })
    expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'viewing', reservationState: 'reserved' }, 'development_selection')).toMatchObject({ kind: 'status', status: 'reserved' })
  })
  it('keeps an existing converted transaction connected when its card is moved', () => {
    expect(resolveDevelopmentLeadBoardMove({ leadStatus: 'converted', convertedTransactionId: 'deal-one' }, 'qualified')).toMatchObject({ kind: 'workflow', transactionId: 'deal-one' })
  })
})
