import { createHmac } from 'node:crypto'
import { queueHomeSeekersJoinFollowUp } from './homeSeekersJoinDelivery.js'
import { calculateSplitCosts, splitCalculatorModels } from '../../src/pages/homeSeekersSplitCalculatorModel.js'

const reply = (status, body) => ({status, body, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
const clean = (value, max=160) => typeof value === 'string' ? value.trim().replace(/[\r\n]/g,' ').slice(0,max) : ''
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const money = value => `R${Math.round(value).toLocaleString('en-ZA')}`
export async function createHomeSeekersJoinFollowUpResponse({ method='POST', headers={}, body={}, env=process.env, queue=queueHomeSeekersJoinFollowUp }={}) {
  if(method!=='POST') return reply(405,{error:'method_not_allowed'})
  if(!body || Array.isArray(body) || typeof body!=='object') return reply(400,{error:'Invalid request.'})
  const type = clean(body.type), email=clean(body.email,254).toLowerCase(), name=clean(body.name || (type==='breakdown' ? 'Calculator breakdown' : ''))
  const source=clean(body.source,40), sales=clean(body.sales,20), model=clean(body.model,30), phone=clean(body.mobile,30)
  let page
  try { page=new URL(body.pageUrl) } catch { return reply(400,{error:'Invalid page.'}) }
  const host=clean(headers.host || headers.Host,255).toLowerCase()
  if(!['call','booking','breakdown','application','application_contact','session'].includes(type) || !validEmail(email) || name.length<2 || !source || body.consent!==true || !/^[A-Za-z0-9._:-]{16,128}$/.test(body.idempotencyKey || '') || page.host.toLowerCase()!==host || !['http:','https:'].includes(page.protocol) || !/^\/(?:demo\/homeseekers\/)?join\/?$/.test(page.pathname)) return reply(400,{error:'Complete your details and contact consent.'})
  if(['call','booking'].includes(type) && (!['under 5','5-9','10-19','20+'].includes(sales) || !splitCalculatorModels.some(([id])=>id===model) || !/^\d{9,15}$/.test(phone.replace(/\D/g,'')))) return reply(400,{error:'Complete both questions and a valid mobile number.'})
  if(type==='booking' && !/^https:\/\/api\.calendly\.com\/scheduled_events\/[^/]+\/invitees\/[^/]+$/.test(body.bookingUrl || '')) return reply(400,{error:'Invalid booking receipt.'})
  // Recompute all results from validated inputs; never trust a browser's savings claim.
  const inputs=body.calculator?.inputs
  const calculation=inputs ? calculateSplitCosts(inputs) : null
  if((inputs && !calculation) || (type==='breakdown' && !calculation)) return reply(400,{error:'Check the calculator inputs.'})
  const title=type==='call' ? 'Call requested' : type==='booking' ? 'Call booked' : type==='session' ? 'Session registered' : type==='application_contact' ? 'Application started' : type==='application' ? 'Application completed' : 'Breakdown requested'
  const summary=calculation ? `${inputs.sales} sales, ${inputs.model}, ${calculation.difference>=0 ? 'saves' : 'costs an extra'} ${money(Math.abs(calculation.difference))}` : `${sales || 'sales not supplied'}, ${model || 'model not supplied'}`
  const subject=`${title}: ${summary} · ${source}`.slice(0,240)
  const context={source, type, ...(type==='booking' ? {bookingUrl:body.bookingUrl} : {}), sales:sales || null, model:model || null, calculator:calculation ? {inputs,result:calculation}:null}
  const details=[subject,`Name: ${name}`,`Email: ${email}`,`Mobile: ${phone || 'not supplied'}`,`Source: ${source}`,type==='booking' ? `Calendar receipt: ${body.bookingUrl}` : '',`Registered sales: ${sales || inputs?.sales || 'not supplied'}`,`Current model: ${model || inputs?.model || 'not supplied'}`, calculation ? `Commission: ${money(calculation.gross)}\nCurrent annual cost: ${money(calculation.currentCost)}\nHome Seekers annual cost: ${money(calculation.homeSeekersCost)}\nAnnual difference: ${money(calculation.difference)}\nAll amounts excluding VAT. Illustrative brokerage costs, not take-home income.\nCalculator inputs: ${JSON.stringify(inputs)}` : 'Calculator not used.',type==='call' ? 'This is a call request, not a confirmed calendar booking.' : ''].filter(Boolean).join('\n\n')
  if (!env.WEBSITES_LEAD_FINGERPRINT_SECRET || env.WEBSITES_LEAD_FINGERPRINT_SECRET.length<32) return reply(503,{error:'Email follow-up is temporarily unavailable. Please try again shortly.'})
  const address=clean(headers['x-forwarded-for'] || headers['x-real-ip'] || 'local',512).split(',')[0].trim()
  const fingerprint=createHmac('sha256',env.WEBSITES_LEAD_FINGERPRINT_SECRET).update(`join:${address}`).digest('hex')
  try {
    const result=await queue({env,key:body.idempotencyKey,fingerprint,contact:{version:'home-seekers-join-v1',privacyAccepted:true,name,email,phone,subject,details,...context}})
    if(result.rateLimited) return reply(429,{error:'Please wait before sending another enquiry.'})
    if(result.conflict) return reply(409,{error:'These details differ from your saved request. Refresh the page to send a new request.'})
    if(!result.accepted || result.deliveryFailed) return reply(503,{error:'Email delivery needs attention. Your saved details are safe; please contact admin@homeseekers.co.za.'})
    return reply(result.deliveryAccepted ? 200 : 202,{accepted:true,deliveryAccepted:result.deliveryAccepted===true,deliveryQueued:result.deliveryQueued===true,duplicate:result.duplicate===true})
  } catch { return reply(503,{error:'Your email follow-up could not be confirmed. Retry with the same details.'}) }
}
