// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppAutomations from '../WhatsAppAutomations'
import { automationDraft, automationTemplate } from '../../../../../supabase/functions/_shared/whatsappAutomation.js'

const mocks=vi.hoisted(()=>({request:vi.fn(),org:'agency-one',viewer:'manager-one',canManage:true}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:mocks.org,accessScope:`${mocks.org}:${mocks.viewer}`,canManage:mocks.canManage,loading:false,error:'',assignees:[{id:'agent-one',name:'Amy Agent'}],senders:[{id:'sender-one',display_phone_number:'+27 82 000 0000',connection_status:'connected',owner_user_id:null}]})}))
const template={id:'900',name:'acknowledgement',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}'}]}
const config={name:'Buyer acknowledgement',kind:'buyer',trigger:'new_lead',stage:'',action:'message',delayMinutes:0,startMinute:540,endMinute:1020,days:[1,2,3,4,5],timezone:'Africa/Johannesburg',senderId:'sender-one',assignAgentId:null,template,values:{'body.1':{source:'first_name'}},taskTitle:''}
const rule={id:'rule-one',version:1,enabled:false,config}
const wrap=()=> <MemoryRouter><WhatsAppAutomations/></MemoryRouter>
beforeEach(()=>{
 mocks.org='agency-one';mocks.viewer='manager-one';mocks.canManage=true
 mocks.request.mockReset().mockImplementation(async(_org,action)=>action==='automation_list'?{rules:[rule]}:action==='automation_runs'?{runs:[]}:action==='automation_templates'?{templates:[template]}:{rule})
})
afterEach(()=>cleanup())

it('requires a deliberate enable and shows the switch-off action for an active rule',async()=>{
 mocks.request.mockImplementation(async(_org,action)=>action==='automation_list'?{rules:[{...rule,enabled:false}]}:{runs:[]})
 render(wrap())
 const enable=await screen.findByRole('button',{name:'Enable rule'})
 expect(enable.disabled).toBe(true)
 fireEvent.click(screen.getByLabelText('Allow this rule to act on future leads and messages.'))
 fireEvent.click(enable)
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','automation_enable',{ruleId:'rule-one',version:1,confirmed:true}))
})

it('creates a stage task with safe default sending hours and saves it switched off',async()=>{
 render(wrap())
 fireEvent.click(await screen.findByRole('button',{name:'New rule'}))
 fireEvent.change(screen.getByLabelText('Rule name'),{target:{value:'Seller call'}})
 fireEvent.change(screen.getByLabelText('Lead type'),{target:{value:'seller'}})
 fireEvent.change(screen.getByLabelText('When'),{target:{value:'stage_changed'}})
 fireEvent.change(screen.getByLabelText(/Trigger stage/),{target:{value:'Contacted'}})
 fireEvent.change(screen.getByLabelText('Action'),{target:{value:'task'}})
 fireEvent.change(screen.getByLabelText('Task title'),{target:{value:'Call this seller'}})
 fireEvent.click(screen.getByRole('button',{name:'Save switched off'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','automation_save',expect.objectContaining({rule:expect.objectContaining({kind:'seller',trigger:'stage_changed',stage:'contacted',action:'task',taskTitle:'Call this seller',days:[1,2,3,4,5],startMinute:540,endMinute:1020,senderId:null})})))
 expect(screen.queryByRole('button',{name:'Save switched off'})).toBeNull()
})

it('loads the selected sender templates and supports name variables with a preview',async()=>{
 render(wrap())
 fireEvent.click(await screen.findByRole('button',{name:'New rule'}))
 fireEvent.change(screen.getByLabelText('Rule name'),{target:{value:'New buyer hello'}})
 fireEvent.change(screen.getByLabelText('Sender'),{target:{value:'sender-one'}})
 await screen.findByRole('option',{name:'acknowledgement · en_US'})
 fireEvent.change(screen.getByLabelText('Approved template'),{target:{value:'900'}})
 fireEvent.change(screen.getByLabelText('Body · 1',{selector:'select'}),{target:{value:'first_name'}})
 await screen.findByText('Hello Test')
 fireEvent.click(screen.getByRole('button',{name:'Save switched off'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','automation_save',expect.objectContaining({rule:expect.objectContaining({template,values:{'body.1':{source:'first_name',text:''}}})})))
})

it('shows readable unknown and skipped outcomes without offering a resend',async()=>{
 mocks.request.mockImplementation(async(_org,action)=>action==='automation_list'?{rules:[rule]}:{runs:[{id:'run-one',rule_id:rule.id,kind:'buyer',record_id:'lead-one',contact_name:'Test Buyer',status:'unknown',reason:'Delivery result unconfirmed; automatic resend blocked',due_at:'2026-10-18T10:00:00Z'},{id:'run-two',rule_id:rule.id,status:'skipped',reason:'Customer replied',due_at:'2026-10-18T11:00:00Z'}]})
 render(wrap())
 await screen.findByText('Customer replied')
 expect(screen.getByText('Delivery result unconfirmed; automatic resend blocked')).toBeTruthy()
 expect(screen.getByRole('link',{name:'Test Buyer'}).getAttribute('href')).toBe('/pipeline/leads/lead-one')
 expect(screen.queryByRole('button',{name:/resend/i})).toBeNull()
})

it('discards late activity and an open editor after changing workspace or losing management access',async()=>{
 let resolve
 mocks.request.mockImplementation((_org,action)=>action==='automation_list'?new Promise(done=>{resolve=done}):Promise.resolve({runs:[]}))
 const view=render(wrap())
 await waitFor(()=>expect(resolve).toBeTypeOf('function'))
 mocks.org='agency-two';mocks.request.mockResolvedValue({rules:[],runs:[]})
 view.rerender(wrap())
 await screen.findByText('No rules yet. Create one, review its settings, then enable it.')
 await act(async()=>resolve({rules:[rule]}))
 expect(screen.queryByText(/Buyer acknowledgement · Off/)).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'New rule'}))
 mocks.canManage=false;view.rerender(wrap())
 expect(screen.getByText('Agency management can configure WhatsApp automations.')).toBeTruthy()
 expect(screen.queryByLabelText('Rule name')).toBeNull()
})

it('keeps a failed save visible and reports schedule or variable errors before requesting a save',async()=>{
 render(wrap())
 fireEvent.click(await screen.findByRole('button',{name:'Edit'}))
 await screen.findByRole('option',{name:'acknowledgement · en_US'})
 fireEvent.change(screen.getByLabelText('Until'),{target:{value:'08:00'}})
 fireEvent.click(screen.getByRole('button',{name:'Save switched off'}))
 await screen.findByRole('alert')
 expect(mocks.request.mock.calls.some(call=>call[1]==='automation_save')).toBe(false)
 fireEvent.change(screen.getByLabelText('Until'),{target:{value:'17:00'}})
 mocks.request.mockRejectedValueOnce(Error('This rule changed. Refresh before saving'))
 fireEvent.click(screen.getByRole('button',{name:'Save switched off'}))
 await screen.findByText('This rule changed. Refresh before saving')
 expect(screen.getByLabelText('Rule name').value).toBe(config.name)
})

it('rejects unsupported templates, missing template variables, invalid delays and recruitment assignment',()=>{
 expect(()=>automationDraft({...config,trigger:'no_response',delayMinutes:0})).toThrow(/delay/)
 expect(()=>automationDraft({...config,kind:'recruitment',assignAgentId:'agent-one'})).toThrow(/management/)
 expect(()=>automationTemplate({...template,status:'PAUSED'},config.values)).toThrow(/approve/)
 expect(()=>automationTemplate(template,{})).toThrow(/Fill in/)
 expect(()=>automationTemplate({...template,components:[...template.components,{type:'HEADER',format:'IMAGE'}]},config.values)).toThrow(/text template/)
})
