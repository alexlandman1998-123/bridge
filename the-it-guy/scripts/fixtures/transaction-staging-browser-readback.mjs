import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from 'playwright'

// Real staging traffic and isolated browser sessions; no mocked business data.
export async function verifyStagingRoleScreens({origin,buyerToken,sellerToken,sellerSession,
  agentSession,attorneySession,transactionId,outputDirectory,expectedBuyerName='Agent portal fixture buyer',roles=['buyer','seller','agent','attorney']}) {
  assert.equal(new URL(origin).hostname,'127.0.0.1')
  await mkdir(outputDirectory,{recursive:true})
  const browser=await chromium.launch({channel:'chrome',headless:true})
  const receipt=[],timers=[]
  try {
    for(const role of roles) {
      const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
      const errors=[],failures=[]
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url())
        if(url.hostname.includes('isdowlnollckzvltkasn')||
          (request.method()!=='GET'&&url.pathname.includes('/functions/v1/')))return route.abort()
        return route.continue()
      })
      const session=role==='agent'?agentSession:role==='attorney'?attorneySession:null
      await context.addInitScript(({session,sellerToken,sellerSession,role})=>{
        if(session)localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token',JSON.stringify(session))
        localStorage.setItem('bridge:active-workspace','residential')
        if(role==='seller')localStorage.setItem('bridge:seller-portal-access:'+sellerToken,JSON.stringify(sellerSession))
      },{session,sellerToken,sellerSession,role})
      const page=await context.newPage()
      const pending=new Map(),messages=[]
      page.on('request',request=>pending.set(request,new URL(request.url()).pathname))
      page.on('requestfinished',request=>pending.delete(request))
      page.on('requestfailed',request=>pending.delete(request))
      page.on('console',message=>{if(/perf|transaction-workspace|full detail load|access/i.test(message.text()))messages.push(message.text().slice(0,400))})
      timers.push(setInterval(async()=>{
        try{await writeFile(outputDirectory+'/'+role+'-live.json',JSON.stringify({url:page.url(),body:(await page.locator('body').innerText()).slice(0,12000),errors,failures,pending:[...pending.values()],messages:messages.slice(-20)},null,2))}catch{}
      },10000))

      let previousFirm=''
      if(role==='attorney'){
        await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000})
        const switcher=page.locator('[aria-label="Organisation switcher"]')
        await switcher.waitFor({state:'visible',timeout:60000})
        previousFirm=(await switcher.getByRole('button').innerText()).trim()
        if(!/Tuckers/i.test(previousFirm)){
          await switcher.getByRole('button').click()
          const preference=page.waitForResponse(r=>r.url().includes('/rest/v1/user_workspace_preferences')&&r.request().method()==='POST'&&r.request().postDataJSON()?.active_workspace_source==='user_selected',{timeout:60000})
          await page.getByRole('menuitemradio',{name:/Tuckers/i}).click()
          const savedPreference=await preference
          if(!savedPreference.ok())await writeFile(outputDirectory+'/attorney-workspace-switch-error.json',JSON.stringify({status:savedPreference.status(),body:await savedPreference.json()},null,2))
          assert.ok(savedPreference.ok(),'The attorney organisation switch must persist through the normal API.')
          await switcher.getByRole('button',{name:/Tuckers/i}).waitFor({timeout:60000})
        }
      }
      page.on('pageerror',e=>errors.push(e.message))
      page.on('response',async r=>{
        if(r.url().includes('vaszuxjeoajeuhlcnzzf.supabase.co/rest/')&&r.status()>=400)
          failures.push({path:new URL(r.url()).pathname,status:r.status(),body:await r.json().catch(()=>null)})
      })
      const route=role==='buyer'?`/client/${buyerToken}/buying`:
        role==='seller'?`/client/${sellerToken}/selling`:`/transactions/${transactionId}`
      await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:60000})
      try{await page.waitForFunction(expected=>document.body.innerText.includes(expected),role==='seller'?'Listing Progress':role==='buyer'?'Your purchase':expectedBuyerName,{timeout:180000})}catch(error){
        await page.screenshot({path:outputDirectory+'/'+role+'-failed.png'});await writeFile(outputDirectory+'/'+role+'-failed.txt',JSON.stringify({url:page.url(),body:await page.locator('body').innerText(),errors,failures},null,2));throw error
      }
      if(role==='agent'||role==='attorney')await page.waitForFunction(()=>{const text=document.body.innerText.toLowerCase();return (text.includes('registered')||text.includes('transaction completed')||text.includes('all applicable legal tasks complete'))&&!text.includes('loading saved progress')},{},{timeout:180000})
      await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{})
      await page.screenshot({path:outputDirectory+'/'+role+'.png',fullPage:false})
      assert.deepEqual(errors,[],`${role} screen raised a browser exception`)
      assert.deepEqual(failures,[],`${role} screen raised a failed database request`)
      receipt.push({role,rendered:true,pageErrors:errors,failedRequests:failures})
      await writeFile(outputDirectory+'/receipt.json',JSON.stringify(receipt,null,2))
      if(role==='attorney'&&previousFirm&&!/Tuckers/i.test(previousFirm)){
        const switcher=page.locator('[aria-label="Organisation switcher"]')
        await switcher.getByRole('button').click()
        const restored=page.waitForResponse(r=>r.url().includes('/rest/v1/user_workspace_preferences')&&r.request().method()==='POST'&&r.request().postDataJSON()?.active_workspace_source==='user_selected',{timeout:60000})
        await page.getByRole('menuitemradio',{name:previousFirm,exact:true}).click()
        assert.ok((await restored).ok(),'Restore the original attorney organisation preference.')
      }
      await context.close()
    }
    await writeFile(outputDirectory+'/receipt.json',JSON.stringify(receipt,null,2))
    return receipt
  }finally{for(const timer of timers)clearInterval(timer);await browser.close()}
}
