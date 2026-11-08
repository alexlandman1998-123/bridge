import {beforeEach,it,expect,vi} from 'vitest'
import {sendEmailCampaignTest} from '../emailCampaignService'
import {supabase} from '../../lib/supabaseClient'
vi.mock('../../lib/supabaseClient',()=>({supabase:{functions:{invoke:vi.fn()}}}))
const payload={organisationId:'org',senderIdentityId:'sender',recipientEmail:'agent@example.com'}
beforeEach(()=>vi.clearAllMocks())
it('accepts only a matching recipient and provider receipt',async()=>{
 supabase.functions.invoke.mockResolvedValue({data:{providerMessageId:'receipt',deliveredTo:'agent@example.com'}})
 await expect(sendEmailCampaignTest(payload)).resolves.toMatchObject({providerMessageId:'receipt'})
})
it.each([null,{}, {deliveredTo:'agent@example.com'}, {providerMessageId:'receipt',deliveredTo:'other@example.com'}])('marks incomplete or mismatched acceptance as uncertain: %j',async data=>{
 supabase.functions.invoke.mockResolvedValue({data})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:true})
})
it.each([400,401,403,429,500,502,408])('distinguishes rejection and uncertain HTTP failures: %s',async status=>{
 const error=Object.assign(Error('HTTP failure'),{context:new Response(JSON.stringify({error:'Sending unavailable'}),{status})})
 supabase.functions.invoke.mockResolvedValue({error})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({message:'Sending unavailable',deliveryUncertain:status>=500||status===408})
})
it('marks a lost network response uncertain',async()=>{
 supabase.functions.invoke.mockResolvedValue({error:Error('Network lost')})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:true})
})
it('preserves setup tests addressed to the signed-in inbox by the server',async()=>{
 supabase.functions.invoke.mockResolvedValue({data:{providerMessageId:'receipt',deliveredTo:'agent@example.com'}})
 await expect(sendEmailCampaignTest({organisationId:'org',senderIdentityId:'sender',setupTest:true})).resolves.toMatchObject({providerMessageId:'receipt'})
})
it('marks thrown transport failures as uncertain too',async()=>{
 supabase.functions.invoke.mockRejectedValueOnce(Error('Connection dropped'))
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:true})
})
it('reuses the same protected key across requests and starts a distinct explicit test',async()=>{
 supabase.functions.invoke.mockResolvedValue({data:{providerMessageId:'receipt',deliveredTo:'agent@example.com'}})
 await sendEmailCampaignTest({...payload,subject:'News'})
 await sendEmailCampaignTest({subject:'News',...payload})
 await sendEmailCampaignTest({...payload,subject:'News',testGeneration:'explicit-new-test'})
 const keys=supabase.functions.invoke.mock.calls.map(([,options])=>options.body.requestId)
 expect(keys[0]).toMatch(/^[a-f0-9]{64}$/)
 expect(keys[1]).toBe(keys[0])
 expect(keys[2]).not.toBe(keys[0])
})
it('preserves a server indication of uncertainty on a conflict response',async()=>{
 supabase.functions.invoke.mockResolvedValue({error:Object.assign(Error('Conflict'),{context:new Response(JSON.stringify({error:'Already processing',deliveryUncertain:true}),{status:409})})})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:true})
})
it('still marks acceptance uncertain when an SDK error response body was consumed',async()=>{
 const context=new Response('Unavailable',{status:502});await context.text()
 supabase.functions.invoke.mockResolvedValue({error:Object.assign(Error('Provider unavailable'),{context})})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:true,message:'Provider unavailable'})
})

it('distinguishes a known provider rejection from an uncertain delivery when receipt storage fails', async () => {
 const context = new Response(JSON.stringify({error:'Provider rejected the sender; saving its rejection failed.',deliveryUncertain:false}),{status:503})
 supabase.functions.invoke.mockResolvedValue({error:Object.assign(Error('Function HTTP failure'),{context})})
 await expect(sendEmailCampaignTest(payload)).rejects.toMatchObject({deliveryUncertain:false,message:expect.stringContaining('Provider rejected')})
})
