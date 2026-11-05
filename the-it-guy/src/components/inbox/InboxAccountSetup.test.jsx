// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InboxAccountSetup from './InboxAccountSetup'
import { metaIntegrationRequest, prepareFacebookSdk, launchWhatsAppSignup } from '../../services/metaIntegrationService'
import { startRevoGoogleWorkspaceInboxAuthorization } from '../../modules/revo/sharedInbox/connectionCore'
import { createMailbox, loadEmailMailboxSettings } from '../../modules/sharedInbox/mailboxService'
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:vi.fn(),prepareFacebookSdk:vi.fn(),launchWhatsAppSignup:vi.fn()}))
vi.mock('../../modules/sharedInbox/mailboxService',()=>({configureImapMailbox:vi.fn(),createMailbox:vi.fn(),loadEmailMailboxSettings:vi.fn()}))
vi.mock('../../modules/sharedInbox/outgoingMailService',()=>({configureSmtpMailbox:vi.fn()}))
vi.mock('../../modules/revo/sharedInbox/connectionCore',()=>({startRevoGoogleWorkspaceInboxAuthorization:vi.fn(),startRevoMicrosoftInboxAuthorization:vi.fn()}))
const workspace={organisationId:'org-a',currentUserId:'user-a',canManage:true,canConnectOwn:true,refresh:vi.fn()}
function mount(props={}) { return render(<InboxAccountSetup open onClose={vi.fn()} workspace={workspace} userId="user-a" onConnected={vi.fn()} {...props}/>) }
function choose(name) {fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${name}`)}))}
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();loadEmailMailboxSettings.mockResolvedValue({canCreatePrivate:true,canCreateShared:true,mailboxes:[]})})
it('opens a channel chooser without starting connections or changing the inbox URL',()=>{
 const original=window.location.href;mount();expect(screen.getByRole('dialog',{name:'Add an inbox'})).toBeTruthy()
 for(const channel of ['WhatsApp','Email','Meta'])expect(screen.getByRole('button',{name:new RegExp(`^${channel}`)})).toBeTruthy()
 expect(metaIntegrationRequest).not.toHaveBeenCalled();expect(createMailbox).not.toHaveBeenCalled();expect(window.location.href).toBe(original)
})
it('prepares a personal WhatsApp connection in the current organisation and confirms actual connection',async()=>{
 const done=vi.fn();metaIntegrationRequest.mockResolvedValue({appId:'app',graphVersion:'v23.0',state:'session'});prepareFacebookSdk.mockResolvedValue({login:vi.fn()});launchWhatsAppSignup.mockResolvedValue({sender:{id:'sender',connection_status:'connected',display_phone_number:'+27123456789'}})
 mount({onConnected:done});choose('WhatsApp');fireEvent.click(screen.getByRole('button',{name:'Continue'}));await screen.findByRole('button',{name:'Continue with Meta'})
 expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','begin_whatsapp',{coexistence:true})
 fireEvent.click(screen.getByRole('button',{name:'Continue with Meta'}));await screen.findByText('WhatsApp connected');expect(done).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Back to Inbox'}));expect(done).toHaveBeenCalledOnce()
})
it('does not report pending WhatsApp registration as connected',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',state:'session'});prepareFacebookSdk.mockResolvedValue({});launchWhatsAppSignup.mockResolvedValue({sender:{id:'sender',connection_status:'pending'}})
 mount();choose('WhatsApp');fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}));await screen.findByText('Waiting for Meta confirmation');expect(screen.queryByText('WhatsApp connected')).toBeNull()
})
it('saves a private email draft and waits for provider confirmation before claiming connected',async()=>{
 createMailbox.mockResolvedValue({id:'mail',address:'sales@example.test',providerKey:'google_workspace'});mount();choose('Email');await waitFor(()=>expect(loadEmailMailboxSettings).toHaveBeenCalledWith('org-a'))
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'sales@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));await screen.findByRole('button',{name:'Sign in with Google'})
 expect(createMailbox).toHaveBeenCalledWith(expect.objectContaining({organisationId:'org-a',actorUserId:'user-a',accessScope:'private',providerKey:'google_workspace'}));expect(screen.queryByText('Email connected')).toBeNull()
 loadEmailMailboxSettings.mockResolvedValue({canCreatePrivate:true,mailboxes:[{id:'mail',address:'sales@example.test',providerKey:'google_workspace',connection:{status:'connected'}}]})
 fireEvent.click(screen.getByRole('button',{name:'Check connection'}));await screen.findByText('Email connected')
})
it('keeps Meta messaging separate and does not claim an unavailable backend is connected',async()=>{
 mount();choose('Meta');await screen.findByText(/messaging are not yet available/);expect(screen.getByRole('button',{name:/^Messenger/})).toBeTruthy();expect(screen.getByRole('button',{name:/^Instagram/})).toBeTruthy();expect(screen.queryByRole('button',{name:'Continue with Meta'})).toBeNull()
})
it('blocks WhatsApp setup for a member without connection access',()=>{
 mount({workspace:{...workspace,canManage:false,canConnectOwn:false}});choose('WhatsApp');expect(screen.getByRole('alert').textContent).toContain('administrator must connect');expect(metaIntegrationRequest).not.toHaveBeenCalled()
})

it('removes number registration and blocks non-admin connection attempts',()=>{
 mount({workspace:{...workspace,canManage:false,canConnectOwn:true}});choose('WhatsApp')
 expect(screen.queryByText('Set up a platform-only number')).toBeNull()
 expect(screen.queryByRole('button',{name:'Continue'})).toBeNull()
 expect(metaIntegrationRequest).not.toHaveBeenCalled()
})
it('keeps a pending number pending until Meta confirms its health',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',state:'session'});prepareFacebookSdk.mockResolvedValue({});launchWhatsAppSignup.mockResolvedValue({sender:{id:'sender',connection_status:'pending'}})
 mount();choose('WhatsApp');fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}))
 await screen.findByText('Waiting for Meta confirmation');expect(screen.queryByLabelText('Six-digit registration PIN')).toBeNull()
 metaIntegrationRequest.mockResolvedValue({sender:{id:'sender',connection_status:'connected',display_phone_number:'+27123456789'}})
 fireEvent.click(screen.getByRole('button',{name:'Check connection'}));await screen.findByText('WhatsApp connected')
 expect(metaIntegrationRequest).toHaveBeenLastCalledWith('org-a','health_sender',{senderId:'sender'})
})
it('shows readable phone options and sends only the selected authorized number',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',state:'session'});prepareFacebookSdk.mockResolvedValue({});launchWhatsAppSignup.mockResolvedValue({requiresPhoneSelection:true,wabaId:'business',phones:[{id:'phone-1',displayPhoneNumber:'+27123456789'},{id:'phone-2',displayPhoneNumber:'+27987654321'}]})
 mount();choose('WhatsApp');fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}))
 const select=await screen.findByLabelText('WhatsApp number');expect(screen.getByRole('button',{name:'Connect selected number'}).disabled).toBe(true)
 expect(screen.getByRole('option',{name:'+27987654321'})).toBeTruthy()
 fireEvent.change(select,{target:{value:'phone-2'}})
 metaIntegrationRequest.mockResolvedValue({sender:{id:'sender',connection_status:'connected'}})
 fireEvent.click(screen.getByRole('button',{name:'Connect selected number'}));await screen.findByText('WhatsApp connected')
 expect(metaIntegrationRequest).toHaveBeenLastCalledWith('org-a','finish_whatsapp',{state:'session',wabaId:'business',phoneNumberId:'phone-2'})
})
it('recovers from an empty number list without trapping the user in a dropdown',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',state:'session'});prepareFacebookSdk.mockResolvedValue({});launchWhatsAppSignup.mockResolvedValue({requiresPhoneSelection:true,phones:[]})
 mount();choose('WhatsApp');fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}))
 expect((await screen.findByRole('alert')).textContent).toContain('No eligible');expect(screen.getByRole('button',{name:'Continue'}).disabled).toBe(false)
})
it('clears the selected setup and cancels it when the dialog closes',async()=>{
 const view=mount();choose('Email');await screen.findByLabelText('Email address')
 view.rerender(<InboxAccountSetup open={false} workspace={workspace} userId="user-a"/> )
 view.rerender(<InboxAccountSetup open workspace={workspace} userId="user-a"/> )
 expect(screen.getByRole('dialog',{name:'Add an inbox'})).toBeTruthy()
 expect(screen.queryByLabelText('Email address')).toBeNull()
})

it('explains blocked email popups without starting authorization',async()=>{
 const popup=vi.spyOn(window,'open').mockReturnValue(null)
 createMailbox.mockResolvedValue({id:'mail',address:'me@example.test',providerKey:'google_workspace'})
 mount();choose('Email');await waitFor(()=>expect(loadEmailMailboxSettings).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'me@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}))
 fireEvent.click(await screen.findByRole('button',{name:'Sign in with Google'}))
 expect(screen.getByRole('alert').textContent).toContain('Allow pop-ups');expect(startRevoGoogleWorkspaceInboxAuthorization).not.toHaveBeenCalled();popup.mockRestore()
})
it('keeps failed email authorization retryable and closes its empty popup',async()=>{
 const child={opener:{},close:vi.fn(),location:{href:'about:blank'}}
 const popup=vi.spyOn(window,'open').mockReturnValue(child)
 startRevoGoogleWorkspaceInboxAuthorization.mockRejectedValue(new Error('Provider unavailable'))
 createMailbox.mockResolvedValue({id:'mail',address:'me@example.test',providerKey:'google_workspace'})
 mount();choose('Email');await waitFor(()=>expect(loadEmailMailboxSettings).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'me@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Continue'}));fireEvent.click(await screen.findByRole('button',{name:'Sign in with Google'}))
 expect((await screen.findByRole('alert')).textContent).toContain('Provider unavailable');expect(child.close).toHaveBeenCalled();expect(screen.getByRole('button',{name:'Sign in with Google'}).disabled).toBe(false);popup.mockRestore()
})
