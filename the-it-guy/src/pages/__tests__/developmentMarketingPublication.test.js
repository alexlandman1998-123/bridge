// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
const source=readFileSync(new URL('../DevelopmentDetail.jsx',import.meta.url),'utf8')
function bind(name,next,dependencies,async=true){
  const start=source.indexOf(`  ${async?'async ':''}function ${name}(`),end=source.indexOf(`\n  ${next}`,start)
  if(start<0||end<0)throw Error(`Missing ${name}`)
  return new Function(...Object.keys(dependencies),`return ${source.slice(start,end)}`)(...Object.values(dependencies))
}
function setup({live=false,ready=true,siteReady=true,...overrides}={}){
  const form={expectedDevelopmentRevision:0,expectedProfileRevision:0,marketing:{mediaLibrary:{visualMap:{status:live?'published':'draft'},sitePlanUrl:siteReady?'':'plan.pdf'},listingOverview:{listingTitle:'Unsaved copy'},listingConfiguration:{publicVisibility:live,marketingStatus:live?'live':'draft'},externalLinks:{},floorplans:[]}}
  const dependencies={detailsForm:form,normalizeMarketingContentForm:structuredClone,unitRows:[],sitePlanQuality:{ready:siteReady,issueCount:2},
    buildDevelopmentVisualPreviewReadiness:()=>({safeToPublish:ready,errors:[{detail:'Check the boundaries'}],warnings:[]}),
    openMarketingHubSection:vi.fn(),setError:vi.fn(),buildPublicDevelopmentSlug:()=> 'fixture',buildPublicDevelopmentUrl:()=> 'https://fixture.invalid/development',
    data:{development:{id:'dev',name:'Fixture'}},setVisualMapPublicationStatus:(map,status)=>({...map,status}),hydrateVisualMapMediaLibrary:value=>value,
    selectedMarketingFloorplan:null,canManageDevelopment:true,setDetailsSaving:vi.fn(),setFeedback:vi.fn(),
    saveDevelopmentDetails:vi.fn(async()=>({developmentRevision:1,profileRevision:1})),buildDevelopmentDetailsPayload:value=>({marketingContent:value.marketing}),
    applyConfirmedMarketing:vi.fn(),window:{dispatchEvent:vi.fn()},Event,loadData:vi.fn(async()=>{}),...overrides,
  }
  return{...dependencies,publish:bind('handlePublishDevelopmentMarketing','async function handleSavePublicPageSettings',dependencies),unpublish:bind('handleUnpublishDevelopmentMarketing','function setMarketingSellingPointEntries',dependencies)}
}
it.each(['publish','unpublish'])('keeps the original publication state and content after a rejected %s',async action=>{
  const context=setup({live:action==='unpublish',saveDevelopmentDetails:vi.fn(async()=>{throw Error('Save denied')})})
  const original=structuredClone(context.detailsForm)
  await context[action]()
  expect(context.detailsForm).toEqual(original)
  expect(context.applyConfirmedMarketing).not.toHaveBeenCalled()
  expect(context.setError).toHaveBeenLastCalledWith('Save denied')
  expect(context.window.dispatchEvent).not.toHaveBeenCalled()
})
it('applies publication status only after the save is confirmed',async()=>{
  let complete
  const context=setup({saveDevelopmentDetails:vi.fn(()=>new Promise(resolve=>{complete=resolve}))})
  const pending=context.publish()
  expect(context.applyConfirmedMarketing).not.toHaveBeenCalled()
  expect(context.detailsForm.marketing.listingConfiguration.publicVisibility).toBe(false)
  complete({developmentRevision:1,profileRevision:1});await pending
  expect(context.applyConfirmedMarketing).toHaveBeenCalledWith(expect.objectContaining({listingConfiguration:expect.objectContaining({publicVisibility:true,marketingStatus:'live'})}),{developmentRevision:1,profileRevision:1})
})
it.each([{ready:false},{siteReady:false}])('navigates failed publication checks to the canonical website section: %j',async options=>{
  const context=setup(options);await context.publish()
  expect(context.openMarketingHubSection).toHaveBeenCalledWith('website')
  expect(context.setFeedback).toHaveBeenCalledWith('')
  expect(context.saveDevelopmentDetails).not.toHaveBeenCalled()
})
it.each(['publish','unpublish'])('reports a committed %s even if its subsequent view refresh fails',async action=>{
  const context=setup({live:action==='unpublish',loadData:vi.fn(async()=>{throw Error('Offline')})});await context[action]()
  expect(context.applyConfirmedMarketing).toHaveBeenCalledOnce()
  expect(context.setError).toHaveBeenLastCalledWith(expect.stringContaining(action==='publish'?'was published':'was unpublished'))
})
it('applies a confirmed profile and revision without writing into another development',()=>{
  let data={development:{id:'dev',revision:0},profile:{revision:0,description:'Keep this'}}
  const apply=bind('applyConfirmedMarketing','async function handlePublishDevelopmentMarketing',{data,setData:update=>{data=update(data)}},false)
  apply({listingConfiguration:{publicVisibility:true}},{developmentRevision:1,profileRevision:1})
  expect(data.profile).toMatchObject({description:'Keep this',revision:1,marketingContent:{listingConfiguration:{publicVisibility:true}}})
  data={development:{id:'other'},profile:{description:'Other'}}
  apply({},{developmentRevision:2,profileRevision:2})
  expect(data.profile.description).toBe('Other')
})
