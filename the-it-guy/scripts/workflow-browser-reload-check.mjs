import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'

// Real application reloads against staging; no intercepted success responses.
export async function workflowBrowserReloadCheck({ matter, readers, buyerToken, sellerToken, sellerSession, sellerTransientFailure = false, reportPath = 'test-results/conveyancing-backpressure-acceptance.json' }) {
  const origin='http://127.0.0.1:4180'
  const browser=await chromium.launch({headless:true})
  const pages={}
  const evidence=[]
  const network={requests:0,failed:0,timeouts:0,slow:0}
  try {
    for(const [role,actor] of Object.entries(readers)) {
      const context=await browser.newContext()
      let injectedFailure=false
      await context.route('**/*',route=>{
        const host=new URL(route.request().url()).hostname
        if(sellerTransientFailure && role==='seller' && !injectedFailure && route.request().url().endsWith('/rpc/bridge_read_seller_shared_matter_journey')) {
          injectedFailure=true
          return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'57014',message:'Simulated statement timeout for recovery verification'})})
        }
        return host.endsWith('.supabase.co')&&host!=='vaszuxjeoajeuhlcnzzf.supabase.co'?route.abort():route.continue()
      })
      const session=(await actor.auth.getSession()).data.session
      await context.addInitScript(({origin,session,sellerToken,sellerSession})=>{
        if(location.origin!==origin)return
        if(session)localStorage.setItem('sb-vaszuxjeoajeuhlcnzzf-auth-token',JSON.stringify(session))
        if(sellerToken)localStorage.setItem(`bridge:seller-portal-access:${sellerToken}`,JSON.stringify(sellerSession))
      },{origin,session,sellerToken:role==='seller'?sellerToken:null,sellerSession})
      const page=await context.newPage()
      const started = new Map()
      page.on('request', request => started.set(request, Date.now()))
      page.on('response', async response => {
        const url = new URL(response.url())
        const elapsed = Date.now() - (started.get(response.request()) || Date.now())
        if (url.hostname.endsWith('.supabase.co')) {
          network.requests++
          if (!response.ok()) network.failed++
          if (elapsed > 5000) network.slow++
        }
        if (url.hostname.endsWith('.supabase.co') && (!response.ok() || elapsed > 5000)) {
          const code = !response.ok() ? await response.json().then(body=>body.code || body.error || null).catch(()=>null) : null
          if (code === '57014') network.timeouts++
          console.log(JSON.stringify({role,requestPath:url.pathname,httpStatus:response.status(),elapsed,code}))
        }
        started.delete(response.request())
      })
      page.on('console', message => {
        if (message.text().startsWith('[perf][transaction-workspace]')) console.log(JSON.stringify({role,performance:message.text()}))
      })
      pages[role]={page,url:role==='buyer'?`${origin}/client/${buyerToken}/progress`:role==='seller'?`${origin}/client/${sellerToken}/selling/progress`:`${origin}/transactions/${matter}`,errors:[]}
      page.on('pageerror',e=>pages[role].errors.push(e.message))
    }
  }catch(error){await browser.close();throw error}
  return {
    close:async()=>{
      await browser.close()
      writeFileSync(reportPath,JSON.stringify({network,checks:evidence},null,2))
    },
    check:async(laneKey,stepKey,status)=>{
      const failures=[]
      for(const [role,entry] of Object.entries(pages)) {
        const {page}=entry
        const checkStarted=Date.now()
        try {
          const responsePromise=page.waitForResponse(response=>response.url().includes('/rpc/bridge_read_')&&response.url().includes('matter_journey')&&response.ok(),{timeout:60000})
          if(page.url()===entry.url)await page.reload({waitUntil:'domcontentloaded'})
          else await page.goto(entry.url,{waitUntil:'domcontentloaded'})
          const snapshot=projectSharedMatterJourneyRead(await (await responsePromise).json(),{audience:role})
          // This harness exercises the first task of each lane. Client task IDs
          // and keys are deliberately redacted; match the same lane position.
          const task=snapshot.lanes.find(l=>l.key===laneKey)?.phases.flatMap(p=>p.tasks)[0]
          assert.equal(task?.status,status,`${role} reloaded journey differs`)
          if(role==='attorney') {
            await page.getByRole('button',{name:'Work',exact:true}).click({timeout:60000})
            if(laneKey!=='transfer') {
              const tab=page.getByRole('tab',{name:laneKey==='bond'?'Bond registration':'Cancellation',exact:true})
              await tab.click({timeout:60000})
              assert.equal(await tab.getAttribute('aria-selected'),'true')
            }
            await page.getByRole('navigation',{name:/stages$/}).waitFor({timeout:60000})
            await page.screenshot({path:`test-results/attorney-${laneKey}-${status}.png`})
          } else {
            if(role==='agent'||role==='developer')await page.getByRole('button',{name:'Conveyancing',exact:true}).click({timeout:60000})
            const target=page.locator(`[data-task-id="${task.id}"]`)
            await target.waitFor({state:'attached',timeout:60000})
            assert.equal(await target.getAttribute('data-task-status'),status,`${role} rendered outcome differs`)
            if(role==='agent') {
              const lane=snapshot.lanes.find(l=>l.key===laneKey)
              const label={transfer:'Transfer',bond:'Bond registration',cancellation:'Bond cancellation'}[laneKey]
              await page.getByRole('heading',{name:`${label} · ${lane.progress.completedCount}/${lane.progress.applicableCount} complete`,exact:true}).waitFor()
              await page.screenshot({path:`test-results/agent-progress-${status}.png`})
            }
            if(role==='seller') await page.locator('[aria-label="Legal journey"]').screenshot({path:'test-results/seller-reload-journey.png'})
          }
          assert.deepEqual(entry.errors,[],`${role} runtime errors`)
          console.log(JSON.stringify({matter,role,lane:laneKey,status,browserReload:'PASS'}))
          evidence.push({role,lane:laneKey,status,result:'PASS',elapsedMs:Date.now()-checkStarted})
        }catch(error){
          await page.screenshot({path:`test-results/workflow-reload-${role}-failure.png`})
          console.log(JSON.stringify({role,body:(await page.locator('body').innerText()).slice(-3500)}))
          failures.push({role,error:error.message.split('\n')[0]})
          evidence.push({role,lane:laneKey,status,result:'FAIL',elapsedMs:Date.now()-checkStarted,error:error.message.split('\n')[0]})
        }
      }
      assert.deepEqual(failures,[],'Browser reload failures: '+JSON.stringify(failures))
    },
  }
}
