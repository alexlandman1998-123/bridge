// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import AudienceImportDialog from '../AudienceImportDialog'
import {prepareAudienceSheet} from '../../../services/audienceImportService'
const api=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}))
vi.mock('../../../services/audienceImportService',async original=>({...await original(),readAudienceImportFile:api.read,importAudienceContacts:api.save}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('reviews before importing, locks repeated clicks and reuses the request after a failure',async()=>{
 api.read.mockResolvedValue(prepareAudienceSheet([['Email','First name'],['pat@example.test','Pat'],['bad','Bad'],['pat@example.test','Duplicate']]))
 api.save.mockRejectedValueOnce(Error('Connection lost')).mockResolvedValueOnce({audienceId:'audience',contactIds:['contact'],name:'Buyers',added:1,existing:0,eligible:0,total:1})
 const applied=vi.fn();render(<AudienceImportDialog organisationId="org" subscriptionId="category" onClose={()=>{}} onImported={applied}/>);
 fireEvent.change(screen.getByLabelText('Audience file'),{target:{files:[new File(['data'],'Buyers.csv')]}});await screen.findByLabelText('Map Email address');expect(api.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Review contacts'}));expect(screen.getByText('Invalid email address')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Import 1 contacts'}));await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Retry same import'}));await screen.findByText('Buyers is ready');expect(api.save.mock.calls[0][0]).toEqual(api.save.mock.calls[1][0]);expect(api.save.mock.calls[0][0].contacts).toHaveLength(1);expect(applied).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Use this audience'}));await waitFor(()=>expect(applied).toHaveBeenCalledWith(expect.objectContaining({audienceId:'audience'})));
})
