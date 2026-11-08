// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsWhatsAppPage from '../SettingsWhatsAppPage'
import { metaIntegrationRequest, prepareFacebookSdk } from '../../../services/metaIntegrationService'
const state=vi.hoisted(()=>({workspace:null}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>state.workspace}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:vi.fn(),prepareFacebookSdk:vi.fn(),launchWhatsAppSignup:vi.fn()}))
const sender={id:'sender-a',display_phone_number:'+27 68 643 9449',business_display_name:'Samlin Construction',connection_status:'connected',owner_user_id:null,onboarding_mode:'coexistence',ownership_version:3}
const mount=()=>render(<MemoryRouter><SettingsWhatsAppPage/></MemoryRouter>)
beforeEach(()=>{vi.clearAllMocks();state.workspace={organisationId:'org-a',accessScope:'org-a:user-a',senders:[sender],assignees:[{id:'user-a',name:'Alex'},{id:'user-b',name:'Sam'}],loading:false,refresh:vi.fn(),canManage:true,currentUserId:'user-a',canConnectOwn:true};metaIntegrationRequest.mockResolvedValue({appId:'app',graphVersion:'v23.0'});prepareFacebookSdk.mockResolvedValue({})})
afterEach(cleanup)
it('keeps the compact header and removes repeated descriptions and the phone sync panel',()=>{
 mount();expect(screen.getByRole('heading',{name:'WhatsApp Business',level:1})).toBeTruthy();expect(screen.getByRole('button',{name:'Refresh',exact:true})).toBeTruthy()
 expect(screen.queryByText('Connect your business number to manage messages and campaigns.')).toBeNull();expect(screen.queryByText('WhatsApp accounts connected to this organisation.')).toBeNull();expect(screen.queryByText('WhatsApp Business phone app sync')).toBeNull();expect(screen.queryByText('Agency inbox and bulk campaigns')).toBeNull();expect(metaIntegrationRequest).not.toHaveBeenCalled()
})
it('puts ownership behind a dropdown and saves only after confirmation',async()=>{
 mount();fireEvent.change(screen.getByLabelText('Inbox owner'),{target:{value:'user-b'}});expect(screen.getByRole('dialog',{name:'Change WhatsApp number owner'})).toBeTruthy();expect(metaIntegrationRequest).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Save ownership'}));await waitFor(()=>expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','set_sender_owner',{senderId:'sender-a',ownerUserId:'user-b',ownershipVersion:3}));expect(state.workspace.refresh).toHaveBeenCalledOnce()
})
it('opens a clear add-number dialog and preserves phone-app mode during preparation',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Add number'}));expect(screen.getByRole('dialog',{name:'Add WhatsApp number'})).toBeTruthy();expect(metaIntegrationRequest).not.toHaveBeenCalled();expect(screen.getByLabelText('Number setup').value).toBe('phone')
 fireEvent.change(screen.getByLabelText('Inbox'),{target:{value:'user-a'}});fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await screen.findByRole('button',{name:'Continue with Meta'});expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','begin_whatsapp',{ownerUserId:'user-a',coexistence:true});expect(screen.getByText(/Connecting for: My inbox/)).toBeTruthy()
})
it('supports a platform-only shared number without conflating its setup with ownership',async()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Add number'}));fireEvent.change(screen.getByLabelText('Number setup'),{target:{value:'platform'}});fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await screen.findByRole('button',{name:'Continue with Meta'});expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','begin_whatsapp',{ownerUserId:null,coexistence:false})
})
it('restricts a personal connector to their own inbox',async()=>{
 state.workspace={...state.workspace,canManage:false,senders:[{...sender,owner_user_id:'user-a'}]};mount();expect(screen.queryByRole('combobox',{name:'Inbox owner'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Add number'}));expect(screen.queryByRole('combobox',{name:'Inbox'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await screen.findByRole('button',{name:'Continue with Meta'});expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','begin_whatsapp',{ownerUserId:'user-a',coexistence:true})
})
it('closes configuration when switching organisation',()=>{
 const view=mount();fireEvent.click(screen.getByRole('button',{name:'Add number'}));state.workspace={...state.workspace,organisationId:'org-b',accessScope:'org-b:user-a'};view.rerender(<MemoryRouter><SettingsWhatsAppPage/></MemoryRouter>);expect(screen.queryByRole('dialog')).toBeNull();expect(metaIntegrationRequest).not.toHaveBeenCalled()
})
