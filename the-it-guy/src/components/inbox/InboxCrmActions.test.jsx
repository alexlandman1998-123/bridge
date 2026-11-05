// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InboxCrmActions from './InboxCrmActions'
import { createInboxLead, linkInboxLead, searchInboxClients, searchInboxLeads, searchClientProperties, saveInboxLeadProperty, routeInboxLead } from '../../services/inboxClientService'
import { mergeClientIdentities } from '../../services/clientIdentityService'
vi.mock('../../services/inboxClientService',()=>({createInboxLead:vi.fn(),linkInboxLead:vi.fn(),searchInboxClients:vi.fn(),searchInboxLeads:vi.fn(),searchClientProperties:vi.fn(),saveInboxLeadProperty:vi.fn(),routeInboxLead:vi.fn()}))
vi.mock('../../services/clientIdentityService',()=>({mergeClientIdentities:vi.fn()}))
vi.mock('../../core/clients/agentClientDirectory',()=>({invalidateAgentClientDirectoryCache:vi.fn()}))
const source={identityId:'source',identityVersion:2,name:'Chat contact'},target={identityId:'target',identityVersion:3,name:'Existing client',email:'person@example.test'}
const props={mode:'link',workspace:{organisationId:'org',currentUserId:'me',canManage:true},current:{id:'chat',contact_name:'Pat Smith',contact_phone:'27821234567'},info:{client:source,context:{candidates:[{kind:'buyer',recordId:'lead',name:'Pat',phone:'27821234567'}]}},onClose:vi.fn(),onChanged:vi.fn()}
beforeEach(()=>{vi.resetAllMocks();searchInboxClients.mockResolvedValue([target]);searchInboxLeads.mockResolvedValue([]);searchClientProperties.mockResolvedValue([{id:"property",kind:"listing",title:"Madison Place",assignedAgentId:"me"}]);saveInboxLeadProperty.mockResolvedValue({});routeInboxLead.mockResolvedValue({});linkInboxLead.mockResolvedValue({});createInboxLead.mockResolvedValue({kind:'buyer',recordId:'new-lead'});mergeClientIdentities.mockResolvedValue({client_id:'target'})})
afterEach(cleanup)
it('links only the explicitly selected matching lead',async()=>{render(<InboxCrmActions {...props}/>);expect(linkInboxLead).not.toHaveBeenCalled();await waitFor(()=>expect(screen.getByLabelText('Existing lead').disabled).toBe(false));fireEvent.change(screen.getByLabelText('Existing lead'),{target:{value:'buyer:lead'}});fireEvent.click(screen.getByRole('button',{name:'Link lead'}));await waitFor(()=>expect(linkInboxLead).toHaveBeenCalledWith(expect.objectContaining({organisationId:'org',conversationId:'chat',kind:'buyer',recordId:'lead'})));expect(props.onClose).toHaveBeenCalledOnce()})
it('retains a saved lead when linking fails so retry cannot create a duplicate',async()=>{
 linkInboxLead.mockRejectedValueOnce(Error('Connection interrupted')).mockResolvedValueOnce({});render(<InboxCrmActions {...props} mode="create"/>);fireEvent.click(screen.getByRole('button',{name:'Seller',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Create and link lead'}));await screen.findByRole('button',{name:'Retry linking saved lead'});expect(createInboxLead).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'Retry linking saved lead'}));await waitFor(()=>expect(props.onClose).toHaveBeenCalledOnce());expect(createInboxLead).toHaveBeenCalledOnce();expect(linkInboxLead).toHaveBeenCalledTimes(2)
})
it('requires the target, reason and explicit confirmation before merging clients',async()=>{
 render(<InboxCrmActions {...props} mode="merge"/>);await waitFor(()=>expect(screen.getByRole('option',{name:'Existing client · person@example.test'})).toBeTruthy());fireEvent.change(screen.getByLabelText('Client to keep'),{target:{value:'target'}});fireEvent.change(screen.getByLabelText('Why are these the same client?'),{target:{value:'Client confirmed this is their old number'}});expect(screen.getByRole('button',{name:'Confirm merge'}).disabled).toBe(true);expect(mergeClientIdentities).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm merge'}));await waitFor(()=>expect(mergeClientIdentities).toHaveBeenCalledWith(target,source,'Client confirmed this is their old number'))
})
it('does not offer an agent a working merge control',()=>{render(<InboxCrmActions {...props} mode="merge" workspace={{...props.workspace,canManage:false}}/>);expect(screen.getByRole('button',{name:'Confirm merge'}).disabled).toBe(true);expect(mergeClientIdentities).not.toHaveBeenCalled()})

it('offers leads whose phone differs and removes the old explanatory copy',async()=>{
 searchInboxLeads.mockResolvedValue([{kind:'seller',recordId:'different',name:'Other number',phone:'27829999999'}]);render(<InboxCrmActions {...props} info={{context:{candidates:[]}}} onCreate={vi.fn()}/>);
 await screen.findByRole('option',{name:'Other number · seller · 27829999999'});fireEvent.change(screen.getByLabelText('Existing lead'),{target:{value:'seller:different'}});fireEvent.click(screen.getByRole('button',{name:'Link lead'}));await waitFor(()=>expect(linkInboxLead).toHaveBeenCalledWith(expect.objectContaining({recordId:'different'})));expect(screen.queryByText(/The chat stays/)).toBeNull();expect(screen.queryByText(/No accessible leads match/)).toBeNull()
})

it('requires a property for a buyer and links the chosen property to the saved lead',async()=>{
 render(<InboxCrmActions {...props} mode="create" current={{...props.current,channel:'email'}}/>);
 fireEvent.submit(screen.getByRole('button',{name:'Create and link lead'}).closest('form'));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Choose a property or development for this buyer.');expect(createInboxLead).not.toHaveBeenCalled();
 fireEvent.click(screen.getByLabelText('Listing',{exact:true}));fireEvent.click(await screen.findByRole('option',{name:/Madison Place/}));
 fireEvent.click(screen.getByRole('button',{name:'Create and link lead'}));
 await waitFor(()=>expect(saveInboxLeadProperty).toHaveBeenCalledWith({organisationId:'org',recordId:'new-lead',property:{id:'property',kind:'listing',title:'Madison Place',assignedAgentId:'me'}}));
 expect(linkInboxLead).toHaveBeenCalledWith(expect.objectContaining({channel:'email',actorId:'me'}));
})
it('offers development selection for buyers and hides the picker for sellers',async()=>{
 render(<InboxCrmActions {...props} mode="create"/>);fireEvent.click(screen.getByRole('tab',{name:'Developments'}));
 await waitFor(()=>expect(searchClientProperties).toHaveBeenCalledWith('org','development'));
 fireEvent.click(screen.getByRole('button',{name:'Seller',exact:true}));expect(screen.queryByRole('tab',{name:'Developments'})).toBeNull();
})

it('asks whether to refer or share another agent’s listing and retains a saved lead on routing retry',async()=>{
 searchClientProperties.mockResolvedValue([{id:'listing',kind:'listing',title:'Partner listing',assignedAgentId:'agent-two'}]);
 routeInboxLead.mockRejectedValueOnce(Error('Try again')).mockResolvedValueOnce({});
 render(<InboxCrmActions {...props} mode="create"/>);fireEvent.click(screen.getByLabelText('Listing',{exact:true}));fireEvent.click(await screen.findByRole('option',{name:/Partner listing/}));
 fireEvent.submit(screen.getByRole('button',{name:'Create and link lead'}).closest('form'));expect(await screen.findByRole('alert')).toHaveProperty('textContent','Choose Refer or Share for the listing’s assigned agent.');expect(createInboxLead).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:/Share Keep together/}));fireEvent.click(screen.getByRole('button',{name:'Create and link lead'}));
 await screen.findByRole('button',{name:'Retry linking saved lead'});expect(routeInboxLead).toHaveBeenCalledWith(expect.objectContaining({mode:'share',expectedAgentId:'agent-two',listingId:'listing',recordId:'new-lead'}));
 fireEvent.click(screen.getByRole('button',{name:'Retry linking saved lead'}));await waitFor(()=>expect(props.onClose).toHaveBeenCalledOnce());expect(createInboxLead).toHaveBeenCalledOnce();
})
