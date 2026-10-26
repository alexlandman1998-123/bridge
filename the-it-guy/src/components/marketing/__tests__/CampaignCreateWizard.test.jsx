// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import CampaignCreateWizard from '../CampaignCreateWizard'
vi.mock('../../../lib/supabaseClient', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))
vi.mock('../MarketingAudiences', () => ({ default: ({ onChoose }) => <form onSubmit={(event) => event.preventDefault()}><button type="button" onClick={() => onChoose({ id: '00000000-0000-4000-8000-000000000001', name: 'Local sellers' })}>Use local sellers</button><button type="submit">Save audience</button></form> }))
afterEach(cleanup)
const next = () => {
  const objective = screen.queryByLabelText('Objective')
  if (objective && !objective.value) fireEvent.change(objective, { target: { value: 'OUTCOME_LEADS' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue', exact: true }))
}
const change = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
it('carries a custom goal, exact Meta objective, target and selected live audience into the saved draft', async () => {
  const onSave = vi.fn().mockResolvedValue({})
  render(<CampaignCreateWizard organisationId="agency" onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: /Start from scratch/ }))
  change('Campaign name', 'Rental growth')
  fireEvent.click(screen.getByRole('button', { name: 'Custom goal' }))
  change('Custom goal', 'Grow landlord enquiries')
  change('Objective', 'OUTCOME_LEADS')
  change('Target', '20 landlord enquiries')
  fireEvent.click(screen.getByRole('button', { name: 'Create audience' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Save audience' }))
  expect(screen.getByRole('heading', { name: 'What do you want to achieve?' })).toBeTruthy()
  expect(onSave).not.toHaveBeenCalled()
  fireEvent.click(await screen.findByRole('button', { name: 'Use local sellers' }))
  next(); next(); next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ goal: 'custom', objective: 'Leads', audience: 'Local sellers', offer: '', campaign_setup: expect.objectContaining({ customGoal: 'Grow landlord enquiries', metaObjective: 'OUTCOME_LEADS', target: '20 landlord enquiries', audienceId: '00000000-0000-4000-8000-000000000001' }) }))
})
it('keeps separate channel snapshots, restores deselected copy, and saves only at review', async () => {
  const onSave = vi.fn().mockResolvedValue({})
  const source = {
    id: 'email',
    channel: 'email',
    name: 'Seller email',
    title: 'Original subject',
    body: 'Original body',
    visibility: 'agency',
  }
  render(<CampaignCreateWizard templates={[source]} onSave={onSave} />)
  fireEvent.click(screen.getByRole('button', { name: /Start from scratch/ }))
  change('Campaign name', 'Winter campaign')
  next()
  change('Template for Email', 'email')
  fireEvent.click(screen.getByRole('button', { name: 'Apply template' }))
  change('Email draft message', 'Personal wording')
  fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }))
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Email' }), {key: 'ArrowRight'})
  expect(document.activeElement).toBe(screen.getByRole('tab', {name:'WhatsApp'}))
  change('WhatsApp draft message', 'Personal WhatsApp')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Email' }))
  expect(screen.getByLabelText('Email draft message').value).toBe(
    'Personal wording',
  )
  fireEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }))
  next()
  change('How should this campaign run?', 'ongoing')
  next()
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByText('Personal wording')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Winter campaign',
      end_date: '',
      status: 'draft',
      planned_channels: ['email'],
      campaign_setup: expect.objectContaining({ metaObjective: 'OUTCOME_LEADS' }),
      channel_content: {
        email: expect.objectContaining({
          body: 'Personal wording',
          title: 'Original subject',
        }),
      },
    }),
  )
  expect(source.body).toBe('Original body')
})
it('blocks an empty channel mix and allows fresh copy when saved templates fail to load', () => {
  const retry = vi.fn()
  render(
    <CampaignCreateWizard
      template={{ name: 'Launch' }}
      templatesError="Storage unavailable"
      onRetryTemplates={retry}
    />,
  )
  next()
  expect(screen.getByText(/Saved templates unavailable/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(retry).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Email' }))
  next()
  expect(screen.getByRole('alert').textContent).toBe(
    'Choose at least one channel.',
  )
  expect(screen.queryByLabelText('Start date')).toBeNull()
})
it('keeps the draft and stable id after save failure, allowing review edits before retry', async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValue({})
  render(
    <CampaignCreateWizard
      template={{ name: 'Launch', objective: 'Reach owners' }}
      onSave={save}
    />,
  )
  next()
  change('Email draft message', 'Keep me')
  next()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Edit goal & offer' }))
  change('Campaign name', 'Updated launch')
  next()
  expect(screen.getByLabelText('Email draft message').value).toBe('Keep me')
  next()
  next()
  fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
  expect(save.mock.calls[1][0].id).toBe(save.mock.calls[0][0].id)
  expect(save.mock.calls[1][0].name).toBe('Updated launch')
})
it('opens the existing template library from the starting point without saving', () => {
  const browse = vi.fn(),
    save = vi.fn()
  render(<CampaignCreateWizard onBrowseTemplates={browse} onSave={save} />)
  fireEvent.click(screen.getByRole('button', { name: /Use a template/ }))
  expect(browse).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
})

it('keeps a saved playbook when creating a new campaign from a reusable template',async()=>{
  const {createCampaignPlaybook}=await import('../../../services/campaignPlaybookModel')
  const onSave=vi.fn().mockResolvedValue({})
  const template={name:'Valuation playbook',goal:'seller_leads',objective:'Book valuations',channels:['email'],mode:'bounded',duration_days:14,channel_content:{email:{title:'Know your options',body:'Get a local valuation.'}}}
  template.playbook=createCampaignPlaybook({...template,planned_channels:template.channels})
  render(<CampaignCreateWizard template={template} onSave={onSave} />)
  next()
  change('Email draft message','Personalised opening message')
  next();next()
  expect(screen.getByText(/Includes 2 communication steps and 2 follow-up actions/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Create campaign'}))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({playbook:expect.objectContaining({steps:expect.arrayContaining([expect.objectContaining({id:template.playbook.steps[0].id,body:'Personalised opening message'}),expect.objectContaining({id:template.playbook.steps[1].id,body:template.playbook.steps[1].body})])})}))
})
