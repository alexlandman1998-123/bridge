// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InboxAccountSetup from './InboxAccountSetup'
import { MemoryRouter } from 'react-router-dom'
const state=vi.hoisted(()=>({workspace:null}))
vi.mock('../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>state.workspace}))
vi.mock('./WhatsAppInboxOperations',()=>({default:()=>null}))
import { metaIntegrationRequest, prepareFacebookSdk, launchWhatsAppSignup } from '../../services/metaIntegrationService'
import { startRevoGoogleWorkspaceInboxAuthorization } from '../../modules/revo/sharedInbox/connectionCore'
import { createMailbox, loadEmailMailboxSettings } from '../../modules/sharedInbox/mailboxService'
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:vi.fn(),prepareFacebookSdk:vi.fn(),launchWhatsAppSignup:vi.fn()}))
vi.mock('../../modules/sharedInbox/mailboxService',()=>({configureImapMailbox:vi.fn(),createMailbox:vi.fn(),loadEmailMailboxSettings:vi.fn()}))
vi.mock('../../modules/sharedInbox/outgoingMailService',()=>({configureSmtpMailbox:vi.fn()}))
vi.mock('../../modules/revo/sharedInbox/connectionCore',()=>({startRevoGoogleWorkspaceInboxAuthorization:vi.fn(),startRevoMicrosoftInboxAuthorization:vi.fn()}))
const workspace={organisationId:'org-a',accessScope:'org-a:user-a',currentUserId:'user-a',canManage:true,canConnectOwn:true,refresh:vi.fn(),senders:[],assignees:[],loading:false}
function mount(props={}) { state.workspace=props.workspace||workspace;return render(<MemoryRouter><InboxAccountSetup open onClose={vi.fn()} workspace={workspace} userId="user-a" onConnected={vi.fn()} {...props}/></MemoryRouter>) }
function choose(name) {fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${name}`)}))}
afterEach(cleanup)
beforeEach(()=>{vi.clearAllMocks();loadEmailMailboxSettings.mockResolvedValue({canCreatePrivate:true,canCreateShared:true,mailboxes:[]})})
it('opens a channel chooser without starting connections or changing the inbox URL',()=>{
 const original=window.location.href;mount();expect(screen.getByRole('dialog',{name:'Add an inbox'})).toBeTruthy()
 for(const channel of ['WhatsApp','Email','Meta'])expect(screen.getByRole('button',{name:new RegExp(`^${channel}`)})).toBeTruthy()
 expect(metaIntegrationRequest).not.toHaveBeenCalled();expect(createMailbox).not.toHaveBeenCalled();expect(window.location.href).toBe(original)
})
it('embeds the same personal-default WhatsApp setup as settings',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',graphVersion:'v23.0',state:'session'});prepareFacebookSdk.mockResolvedValue({})
 mount();choose('WhatsApp');fireEvent.click(await screen.findByRole('button',{name:'Add number'}))
 expect(screen.getByLabelText('Inbox').value).toBe('self')
 fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await screen.findByRole('button',{name:'Continue with Meta'})
 expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','begin_whatsapp',{ownerUserId:'user-a',coexistence:true})
})
it('requires a sharing acknowledgement in the embedded WhatsApp flow too',async()=>{
 mount();choose('WhatsApp');fireEvent.click(await screen.findByRole('button',{name:'Add number'}))
 fireEvent.change(screen.getByLabelText('Inbox'),{target:{value:''}})
 expect(screen.getByRole('button',{name:'Continue',exact:true}).disabled).toBe(true)
 expect(metaIntegrationRequest).not.toHaveBeenCalled()
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
it('blocks WhatsApp setup for a member without connection access',async()=>{
 mount({workspace:{...workspace,canManage:false,canConnectOwn:false}});choose('WhatsApp')
 await screen.findByText('Ask an organisation administrator to connect a number.')
 expect(screen.queryByRole('button',{name:'Add number'})).toBeNull();expect(metaIntegrationRequest).not.toHaveBeenCalled()
})
it('waits for Meta confirmation without claiming a pending number is connected',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',graphVersion:'v23.0',state:'session'});prepareFacebookSdk.mockResolvedValue({})
 launchWhatsAppSignup.mockResolvedValue({sender:{id:'sender',connection_status:'pending',owner_user_id:'user-a'}})
 mount();choose('WhatsApp');fireEvent.click(await screen.findByRole('button',{name:'Add number'}))
 fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}))
 await screen.findByText(/Account linked. Activate the number/)
 expect(screen.queryByText(/^WhatsApp connected/)).toBeNull()
})
it('shows readable phone options and sends only the selected authorised number',async()=>{
 metaIntegrationRequest.mockResolvedValue({appId:'app',graphVersion:'v23.0',state:'session'});prepareFacebookSdk.mockResolvedValue({})
 launchWhatsAppSignup.mockResolvedValue({requiresPhoneSelection:true,wabaId:'business',phones:[{id:'phone-1',displayPhoneNumber:'+27123456789'},{id:'phone-2',displayPhoneNumber:'+27987654321'}]})
 mount();choose('WhatsApp');fireEvent.click(await screen.findByRole('button',{name:'Add number'}))
 fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));fireEvent.click(await screen.findByRole('button',{name:'Continue with Meta'}))
 const select=await screen.findByLabelText('WhatsApp number');expect(screen.getByRole('button',{name:'Connect selected number'}).disabled).toBe(true)
 fireEvent.change(select,{target:{value:'phone-2'}})
 metaIntegrationRequest.mockResolvedValue({sender:{id:'sender',connection_status:'connected',owner_user_id:'user-a'}})
 fireEvent.click(screen.getByRole('button',{name:'Connect selected number'}));await screen.findByText(/WhatsApp connected. New conversations/)
 expect(metaIntegrationRequest).toHaveBeenLastCalledWith('org-a','finish_whatsapp',{state:'session',wabaId:'business',phoneNumberId:'phone-2'})
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

it('requires acknowledgement before saving a shared email mailbox',async()=>{
 mount();choose('Email');await waitFor(()=>expect(loadEmailMailboxSettings).toHaveBeenCalled())
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'office@example.test'}})
 fireEvent.change(screen.getByLabelText('Who can access this inbox?'),{target:{value:'workspace'}})
 expect(screen.getByRole('button',{name:'Continue',exact:true}).disabled).toBe(true);expect(createMailbox).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('checkbox',{name:/office@example.test and imported/}))
 createMailbox.mockResolvedValue({id:'mail',address:'office@example.test',providerKey:'google_workspace',accessScope:'workspace'})
 fireEvent.click(screen.getByRole('button',{name:'Continue',exact:true}));await screen.findByRole('button',{name:'Sign in with Google'})
 expect(createMailbox).toHaveBeenCalledWith(expect.objectContaining({accessScope:'workspace',confirmWorkspaceSharing:true}))
})
it('shows and acknowledges the existing scope before continuing an unfinished company mailbox',async()=>{
 loadEmailMailboxSettings.mockResolvedValue({canCreatePrivate:true,canCreateShared:true,mailboxes:[{id:'existing',address:'team@example.test',accessScope:'workspace',providerKey:'google_workspace',permissions:{manage:true}}]})
 mount();choose('Email');fireEvent.change(await screen.findByLabelText('Or finish an existing setup'),{target:{value:'existing'}})
 expect(screen.getByText(/Access: Everyone in this organisation/)).toBeTruthy()
 expect(screen.getByRole('button',{name:'Sign in with Google'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/this connection shares imported messages/}))
 expect(screen.getByRole('button',{name:'Sign in with Google'}).disabled).toBe(false)
})
