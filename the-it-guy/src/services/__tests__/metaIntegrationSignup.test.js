// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { launchWhatsAppSignup } from '../metaIntegrationService'
const invoke=vi.hoisted(()=>vi.fn())
vi.mock('../../lib/supabaseClient',()=>({invokeEdgeFunction:invoke}))
afterEach(()=>vi.clearAllMocks())
it('exchanges the short-lived code immediately and only trusts exact Facebook origins',async()=>{
  let callback
  invoke.mockResolvedValue({data:{exchanged:true}})
  const promise=launchWhatsAppSignup({sdk:{login:cb=>{callback=cb}},intent:{state:'intent',configurationId:'config'},organisationId:'org'})
  await callback({authResponse:{code:'temporary-code'}})
  expect(invoke.mock.calls[0][1].body.action).toBe('exchange_whatsapp_code')
  expect(invoke).toHaveBeenCalledTimes(1)
  const data={type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'100',phone_number_id:'200'}}
  window.dispatchEvent(new MessageEvent('message',{origin:'https://evilfacebook.com',data}))
  expect(invoke).toHaveBeenCalledTimes(1)
  invoke.mockResolvedValue({data:{sender:{id:'sender'}}})
  window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:JSON.stringify(data)}))
  await expect(promise).resolves.toEqual({sender:{id:'sender'}})
  expect(invoke.mock.calls[1][1].body).toMatchObject({action:'finish_whatsapp',wabaId:'100',phoneNumberId:'200'})
})
it('cancels an unfinished signup without connecting assets later',async()=>{
  const controller=new AbortController()
  const promise=launchWhatsAppSignup({sdk:{login:()=>{}},intent:{state:'intent'},organisationId:'org',signal:controller.signal})
  controller.abort();await expect(promise).rejects.toThrow('closed')
  window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'100',phone_number_id:'200'}}}))
  expect(invoke).not.toHaveBeenCalled()
})
