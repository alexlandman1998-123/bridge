// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { launchWhatsAppSignup } from '../metaIntegrationService'
const invoke=vi.hoisted(()=>vi.fn())
vi.mock('../../lib/supabaseClient',()=>({invokeEdgeFunction:invoke}))
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks()})
it('uses the regular callback type required by the real Meta SDK',async()=>{
  let callback
  const controller=new AbortController()
  const promise=launchWhatsAppSignup({sdk:{login:cb=>{
    if(Object.prototype.toString.call(cb)!=='[object Function]') throw new TypeError('Expression is of type asyncfunction, not function')
    callback=cb
  }},intent:{state:'intent',configurationId:'config'},organisationId:'org',signal:controller.signal})
  const rejected=expect(promise).rejects.toThrow('Meta did not authorize')
  try { callback?.({});await rejected }
  finally { controller.abort() }
  expect(invoke).not.toHaveBeenCalled()
})
it('removes the signup listener and timeout when the SDK throws while opening login',async()=>{
  const remove=vi.spyOn(window,'removeEventListener'),clear=vi.spyOn(window,'clearTimeout'),schedule=vi.spyOn(window,'setTimeout')
  await expect(launchWhatsAppSignup({sdk:{login:()=>{throw new Error('Meta login could not open.')}},intent:{state:'intent'},organisationId:'org'})).rejects.toThrow('could not open')
  expect(remove).toHaveBeenCalledWith('message',expect.any(Function))
  expect(clear).toHaveBeenCalledWith(schedule.mock.results[0].value)
  expect(invoke).not.toHaveBeenCalled()
})
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
it('accepts WABA-only phone app completion in either callback order and uses the prepared onboarding mode',async()=>{
  let callback,options
  const promise=launchWhatsAppSignup({sdk:{login:(cb,config)=>{callback=cb;options=config}},intent:{state:'intent',configurationId:'v4-config',coexistence:true},organisationId:'org'})
  expect(options.extras).toEqual({featureType:'whatsapp_business_app_onboarding'})
  const selection={requiresPhoneSelection:true,wabaId:'100',phones:[{id:'200',displayPhoneNumber:'+27 82 000 0000'}]}
  invoke.mockImplementation(async(_name,{body})=>({data:body.action==='exchange_whatsapp_code'?{exchanged:true}:selection}))
  window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'100'}}}))
  expect(invoke).not.toHaveBeenCalled()
  await callback({authResponse:{code:'fake-code'}})
  await expect(promise).resolves.toEqual(selection)
  expect(invoke.mock.calls[1][1].body).toEqual({organisationId:'org',action:'finish_whatsapp',state:'intent',wabaId:'100',phoneNumberId:''})
})
it('does not change a prepared cloud flow to phone-app onboarding through client flags',async()=>{
  let options
  const control=new AbortController()
  const promise=launchWhatsAppSignup({sdk:{login:(_cb,value)=>{options=value}},intent:{state:'intent',coexistence:false},coexistence:true,organisationId:'org',signal:control.signal})
  expect(options.extras).toEqual({})
  const failure=expect(promise).rejects.toThrow('phone app option')
  window.dispatchEvent(new MessageEvent('message',{origin:'https://www.facebook.com',data:{type:'WA_EMBEDDED_SIGNUP',event:'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',data:{waba_id:'100'}}}))
  await failure
  expect(invoke).not.toHaveBeenCalled()
})
