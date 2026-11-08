// @vitest-environment jsdom
import { createElement, useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateEmailCampaign } from '../EmailCampaigns'
const api = vi.hoisted(() => ({ save: vi.fn(), workspace: vi.fn() }))
vi.mock('../../../context/AuthSessionContext', () => ({ useAuthSession: () => ({ authState: { currentWorkspace: { id: 'org' }, user: { id: 'actor' } } }) }))
vi.mock('../../../services/marketingAudienceService', () => ({ loadMarketingAudiences: vi.fn().mockResolvedValue({ audiences: [], total: 0 }) }))
vi.mock('../../../services/emailCampaignService', () => ({ getEmailCampaignWorkspace: api.workspace, saveEmailAudience: api.save }))
vi.mock('../EmailCampaignBuilder', () => ({ default: function Harness({ workspace, AudienceStudio }) {
  const [filter, setFilter] = useState({})
  return <><output aria-label="Draft targeting">{JSON.stringify(filter)}</output>{createElement(AudienceStudio, { audienceFilter: filter, onChange: setFilter, contacts: workspace.contacts || [], savedAudiences: workspace.savedAudiences || [], organisationId: workspace.organisationId, userId: workspace.userId, onRefresh: workspace.refresh, setNotice() {}, setError() {} })}</>
} }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
test('a saved selection cannot silently ignore custom filter edits', async () => {
  api.workspace.mockResolvedValue({ savedAudiences: [{ id: 'saved', name: 'Shared buyers', filter_json: { saved_audience_id: 'saved' } }], contacts: [] })
  render(<CreateEmailCampaign />)
  const option = await screen.findByRole('option', { name: 'Shared buyers' })
  fireEvent.change(option.parentElement, { target: { value: 'saved' } })
  expect(screen.getByLabelText('Draft targeting').textContent).toBe('{"saved_audience_id":"saved"}')
  fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: 'buyer' } })
  expect(screen.getByLabelText('Draft targeting').textContent).toBe('{"role_type":"buyer"}')
  fireEvent.change(screen.getByLabelText('Audience name'), { target: { value: 'Custom buyers' } })
  api.save.mockResolvedValue({ id: 'custom' })
  fireEvent.click(screen.getByRole('button', { name: 'Save audience' }))
  await waitFor(() => expect(api.save).toHaveBeenCalledWith({ organisationId: 'org', userId: 'actor', audience: { name: 'Custom buyers', filterJson: { role_type: 'buyer' } } }))
})
