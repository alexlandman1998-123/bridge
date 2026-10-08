// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsProperty24Page from '../SettingsProperty24Page'

const mocks = vi.hoisted(() => ({
  settings: vi.fn(), users: vi.fn(), save: vi.fn(), refresh: vi.fn(), fetch: vi.fn(),
}))
vi.mock('../../../context/OrganisationContext', () => ({
  useOrganisation: () => ({ refreshOrganisation: mocks.refresh }),
}))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentWorkspace: null }) }))
vi.mock('../../../lib/settingsApi', () => ({
  fetchOrganisationSettings: mocks.settings, listOrganisationUsers: mocks.users, updateWorkflowSettings: mocks.save,
}))
vi.mock('../../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'local-test-token' } } }) } },
}))
vi.mock('../../../services/property24StatisticsOperationsService', () => ({
  getProperty24StatisticsSyncRuns: async () => [], runProperty24StatisticsSync: vi.fn(),
}))
vi.mock('../../../services/property24LiveCutoverService', () => ({
  fetchProperty24LiveCutover: async () => null, applyProperty24LiveCutoverAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.settings.mockResolvedValue({
    organisation: { id: 'org-1', name: 'Agency' },
    organisationSettings: { property24: { hiddenAgentPhoneNumbers: { 'user-2': true } } },
  })
  mocks.users.mockResolvedValue([
    { id: 'membership-1', userId: 'user-1', fullName: 'First Agent', email: 'first@example.com', phone: '0825551123', status: 'active' },
    { id: 'membership-2', userId: 'user-2', fullName: 'Second Agent', email: 'second@example.com', phone: '0825551124', status: 'active' },
  ])
  mocks.save.mockResolvedValue({})
  mocks.refresh.mockResolvedValue({})
  mocks.fetch.mockImplementation(async (url) => {
    if (String(url).includes('/connection?')) return new Response(JSON.stringify({
      connection: { enabled: true, agencyId: '31382', credentialsConfigured: true },
    }), { headers: { 'Content-Type': 'application/json' } })
    if (url === '/api/property24/settings/health') return new Response('{}')
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', mocks.fetch)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Property24 agent phone preferences', () => {
  it('ticks immediately during a slow save and unlocks before the workspace refresh finishes', async () => {
    let finishSave
    mocks.save.mockImplementation(() => new Promise((resolve) => { finishSave = resolve }))
    mocks.refresh.mockImplementation(() => new Promise(() => {}))
    render(<SettingsProperty24Page />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for First Agent' })
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)
    expect(screen.getByText('Saving phone preference…')).toBeTruthy()
    finishSave({})
    await waitFor(() => expect(checkbox.disabled).toBe(false))
    expect(checkbox.checked).toBe(true)
    expect(screen.queryByText('Saving phone preference…')).toBeNull()
    expect(screen.getByText(/Phone preference saved for First Agent/)).toBeTruthy()
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('restores the last value if a delayed save fails', async () => {
    let failSave
    mocks.save.mockImplementation(() => new Promise((resolve, reject) => { failSave = reject }))
    render(<SettingsProperty24Page />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for Second Agent' })
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    expect(checkbox.disabled).toBe(true)
    failSave(new Error('Phone preference could not be saved'))
    expect(await screen.findByText('Phone preference could not be saved')).toBeTruthy()
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('retains a successful save when the workspace refresh fails', async () => {
    mocks.refresh.mockRejectedValue(new Error('Refresh unavailable'))
    render(<SettingsProperty24Page />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for First Agent' })
    fireEvent.click(checkbox)
    expect(await screen.findByText('Property24 settings saved, but the workspace could not refresh. Reload the page to refresh it.')).toBeTruthy()
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(false)
    expect(screen.getByText(/Phone preference saved for First Agent/)).toBeTruthy()
  })

  it('saves per agent, preserves other preferences and waits for explicit sync', async () => {
    const view = render(<SettingsProperty24Page />)
    const first = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for First Agent' })
    expect(first.checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: 'Hide phone number on Property24 for Second Agent' }).checked).toBe(true)
    fireEvent.click(first)
    await waitFor(() => expect(first.checked).toBe(true))
    expect(mocks.save.mock.calls[0][0].property24.hiddenAgentPhoneNumbers).toEqual({ 'user-1': true, 'user-2': true })
    expect(screen.getByText(/Phone preference saved for First Agent/).textContent).toContain('Choose Sync & match')
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes('agents-sync'))).toBe(false)
    expect(screen.getByText('0825551123')).toBeTruthy()
    // Reloading uses the saved preference; turning it off retains the other agent.
    mocks.settings.mockResolvedValue({
      organisation: { id: 'org-1' }, organisationSettings: { property24: mocks.save.mock.calls[0][0].property24 },
    })
    view.unmount()
    render(<SettingsProperty24Page />)
    const reloaded = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for First Agent' })
    expect(reloaded.checked).toBe(true)
    fireEvent.click(reloaded)
    await waitFor(() => expect(reloaded.checked).toBe(false))
    expect(mocks.save.mock.calls.at(-1)[0].property24.hiddenAgentPhoneNumbers).toEqual({ 'user-2': true })
  })

  it('keeps the last saved preference and shows a failed save', async () => {
    mocks.save.mockRejectedValue(new Error('Unable to save preference'))
    render(<SettingsProperty24Page />)
    const checkbox = await screen.findByRole('checkbox', { name: 'Hide phone number on Property24 for First Agent' })
    fireEvent.click(checkbox)
    expect(await screen.findByText('Unable to save preference')).toBeTruthy()
    expect(checkbox.checked).toBe(false)
    expect(screen.queryByText(/Phone preference saved/)).toBeNull()
  })
})
