// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useGuidedBondApplication } from '../guided/hooks/useGuidedBondApplication.js'
import { useBondApplicationSubmission } from '../guided/hooks/useBondApplicationSubmission.js'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { toLegacyBondApplication } from '../legacy/bondApplicationLegacyAdapter.js'

afterEach(cleanup)
it('editing an answer clears the drawn signature in memory and in the persisted draft', () => {
  const portal = { transaction: { id: 'transaction' }, onboardingFormData: { formData: { bond_application: { _meta: { bond_application_html_signature: { dataUrl: 'old', confirmed: true } } } } } }
  const { result } = renderHook(() => useGuidedBondApplication({ portal, token: 'fixture' }))
  expect(result.current.applicationState.application.signatureEvidence.confirmed).toBe(true)
  act(() => result.current.updateField('participants.primaryApplicant.personal.first_name', 'Updated'))
  expect(result.current.applicationState.application.signatureEvidence).toEqual({})
  expect(toLegacyBondApplication(result.current.applicationState)._meta.bond_application_html_signature).toEqual({})
  act(() => result.current.updateField('application.signatureEvidence.dataUrl', 'new'))
  expect(result.current.applicationState.application.signatureEvidence.dataUrl).toBe('new')
})

it('answers changing reset permission acceptance, while document refreshes do not', () => {
  const initial = createEmptyBondApplicationState()
  const { result, rerender } = renderHook(({ applicationState, documentChecklist }) => useBondApplicationSubmission({ applicationState, documentChecklist }), { initialProps: { applicationState: initial, documentChecklist: { items: [] } } })
  const key = result.current.declarations[0].key
  act(() => result.current.updateDeclaration(key, true))
  expect(result.current.declarationValues[key]).toBe(true)
  rerender({ applicationState: structuredClone(initial), documentChecklist: { items: [{ status: 'approved' }] } })
  expect(result.current.declarationValues[key]).toBe(true)
  const updated = structuredClone(initial)
  updated.application.finance.requestedBondAmount = 2000000
  rerender({ applicationState: updated, documentChecklist: { items: [] } })
  expect(result.current.declarationValues[key]).toBe(false)
})
