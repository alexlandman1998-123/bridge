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
  callback({authResponse:{code:'temporary-code'}}); await Promise.resolve(); await Promise.resolve()
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

it('passes a regular callback to the Meta SDK and exchanges duplicate callbacks only once',async()=>{
 let callback;invoke.mockResolvedValue({data:{exchanged:true}})
 const controller=new AbortController()
 const promise=launchWhatsAppSignup({sdk:{login:cb=>{callback=cb;if(cb.constructor.name!=='Function')throw Error('Expression is of type asyncfunction, not function')}},intent:{state:'intent'},organisationId:'org',signal:controller.signal})
 expect(callback.constructor.name).toBe('Function')
 callback({authResponse:{code:'code'}});callback({authResponse:{code:'code'}})
 await Promise.resolve();expect(invoke).toHaveBeenCalledTimes(1)
 controller.abort();await expect(promise).rejects.toThrow('closed')
})
it('cleans up listeners and timers if the SDK throws synchronously',async()=>{
 const remove=vi.spyOn(window,'removeEventListener')
 const promise=launchWhatsAppSignup({sdk:{login:()=>{throw Error('SDK failed')}},intent:{state:'intent'},organisationId:'org'})
 await expect(promise).rejects.toThrow('SDK failed');expect(remove).toHaveBeenCalledWith('message',expect.any(Function));remove.mockRestore()
})
it('handles cancelled login without exchanging or completing a number',async()=>{
 const promise=launchWhatsAppSignup({sdk:{login:cb=>cb(null)},intent:{state:'intent'},organisationId:'org'})
 await expect(promise).rejects.toThrow('did not authorize');expect(invoke).not.toHaveBeenCalled()
})
it('handles a Meta finish event before the login callback and finishes only once',async()=>{
 let callback;invoke.mockResolvedValue({data:{sender:{id:'sender'}}})
 const promise=launchWhatsAppSignup({sdk:{login:cb=>{callback=cb}},intent:{state:'intent'},organisationId:'org'})
 const event=()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'100',phone_number_id:'200'}}}))
 event();expect(invoke).not.toHaveBeenCalled();callback({authResponse:{code:'code'}});event()
 await expect(promise).resolves.toEqual({sender:{id:'sender'}})
 expect(invoke.mock.calls.filter(call=>call[1].body.action==='finish_whatsapp')).toHaveLength(1)
})
it('fails a stuck SDK load promptly and allows a clean retry',async()=>{
 vi.useFakeTimers();delete window.FB
 const {prepareFacebookSdk}=await import('../metaIntegrationService')
 const loading=prepareFacebookSdk('test-app','v23.0')
 const rejection=expect(loading).rejects.toThrow('too long')
 await vi.advanceTimersByTimeAsync(20000);await rejection
 expect(document.querySelector('script[src="https://connect.facebook.net/en_US/sdk.js"]')).toBeNull()
 window.FB={init:vi.fn(),login:vi.fn()}
 await expect(prepareFacebookSdk('test-app','v23.0')).resolves.toBe(window.FB)
 delete window.FB;delete window.fbAsyncInit;vi.useRealTimers()
})
it('does not continue after the code exchange fails',async()=>{
 invoke.mockResolvedValue({error:{message:'Code expired'}})
 const promise=launchWhatsAppSignup({sdk:{login:cb=>cb({authResponse:{code:'code'}})},intent:{state:'intent'},organisationId:'org'})
 await expect(promise).rejects.toThrow('Code expired')
 window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH',data:{waba_id:'100',phone_number_id:'200'}}}))
 expect(invoke).toHaveBeenCalledTimes(1)
})
