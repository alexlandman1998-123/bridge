// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyBondApplicationState } from '../bondApplicationState.js'
import { useBondApplicationDocuments } from '../guided/hooks/useBondApplicationDocuments.js'
import { useBondApplicationSubmission } from '../guided/hooks/useBondApplicationSubmission.js'

afterEach(cleanup)

describe('Application actions require connected services', () => {
  it('does not claim an upload succeeded without an upload service', async () => {
    const applicationState = createEmptyBondApplicationState()
    const { result } = renderHook(() => useBondApplicationDocuments({ applicationState }))
    let response
    await act(async () => { response = await result.current.uploadDocument({ key: 'proof_of_income' }, new File(['test'], 'proof.pdf')) })
    expect(response.ok).toBe(false)
    expect(result.current.uploadState.proof_of_income.status).toBe('error')
    expect(result.current.error).toContain('not available')
  })

  it('keeps a pending submission locked when cancellation is not connected', async () => {
    const applicationState = createEmptyBondApplicationState()
    const pending = { id: 'pending-application', status: 'awaiting_signature' }
    const onRefreshSubmission = vi.fn().mockResolvedValue({ submission: pending })
    const { result } = renderHook(() => useBondApplicationSubmission({ applicationState, onRefreshSubmission }))
    await act(async () => { await result.current.refreshStatus() })
    let response
    await act(async () => { response = await result.current.makeChanges() })
    expect(response).toEqual({ ok: false, reason: 'cancellation_unavailable' })
    expect(result.current.submission).toEqual(pending)
  })

  it('does not save or report prepared signing without a submission service', async () => {
    const saveLatestApplication = vi.fn()
    const applicationState = createEmptyBondApplicationState()
    const { result } = renderHook(() => useBondApplicationSubmission({ applicationState, saveLatestApplication }))
    let response
    await act(async () => { response = await result.current.prepareForSignature() })
    expect(response).toEqual({ ok: false, reason: 'submission_unavailable' })
    expect(saveLatestApplication).not.toHaveBeenCalled()
    expect(result.current.error).toContain('not available')
  })
})
