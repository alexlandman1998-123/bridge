// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import Arch9CampaignSenderForm from '../Arch9CampaignSenderForm'
import {createEmailSender} from '../../../services/emailCampaignService'
vi.mock('../../../services/emailCampaignService',()=>({createEmailSender:vi.fn()}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('records organisation branding and reply-to through the platform sender API',async()=>{
 const refresh=vi.fn();render(<Arch9CampaignSenderForm organisationId="org" platformSender={{ready:true,available:true}} onSaved={refresh}/>);
 fireEvent.change(screen.getByLabelText('Arch9 sender name'),{target:{value:'Samlin'}});fireEvent.change(screen.getByLabelText('Arch9 reply-to inbox'),{target:{value:'office@example.test'}});fireEvent.click(screen.getByRole('button',{name:'Save Arch9 sender'}));
 await waitFor(()=>expect(createEmailSender).toHaveBeenCalledWith({organisationId:'org',senderMode:'arch9',displayName:'Samlin',replyToEmail:'office@example.test',makeDefault:true,identityId:null}));expect(refresh).toHaveBeenCalled();
})
it('does not offer a working fallback when the platform update is absent',()=>{
 render(<Arch9CampaignSenderForm organisationId="org" platformSender={{ready:false,available:false}}/>);expect(screen.getByRole('button',{name:'Save Arch9 sender'}).disabled).toBe(true);expect(screen.getByRole('status').textContent).toContain('needs the platform update and activation');expect(createEmailSender).not.toHaveBeenCalled();
})
