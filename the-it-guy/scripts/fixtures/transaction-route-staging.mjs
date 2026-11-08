import assert from 'node:assert/strict'
import {buildRouteBuyerForm,sellerRouteVariant} from './transaction-route-onboarding.mjs'
import {getTransactionPurchaserTypeValue} from '../../src/lib/purchaserPersonas.js'
import {resolveBuyerOnboardingFlow} from '../../src/lib/buyerOnboardingFlow.js'
import { createMatter, evidence, signInAs, uploadBuyerRequirements } from '../full-transaction-portal-staging-acceptance.test.mjs'
import { exerciseCashTransactionCloseout } from './full-transaction-closeout.mjs'

// These cases distinguish executable workflow branches, rather than treating
// every permutation of independent facts as a separately certified product.
export const TRANSACTION_ROUTE_CASES = Object.freeze([
  {key:'withdrawn_sale',financeType:'cash',terminalOutcome:'cancelled'},
  {key:'specialist_hold',financeType:'cash',terminalOutcome:'specialist_hold'},
  {key:'other_instrument_hold',financeType:'cash',terminalOutcome:'other_instrument',propertyTenure:'share_block'},
  {key:'private_cash',financeType:'cash'},
  {key:'zero_rated_going_concern',financeType:'cash',vatTreatment:'zero_rated_going_concern',buyerEntityType:'company',sellerEntityType:'company'},
  {key:'tax_exemption',financeType:'cash',vatTreatment:'exempt'},
  {key:'sars_query',financeType:'cash',sarsQuery:true},
  {key:'non_resident_seller',financeType:'cash',nonResidentSeller:true},
  {key:'property_conditions',financeType:'cash',propertyConditions:true},
  {key:'specialist_reviewed',financeType:'cash',specialistReviewed:true},
  {key:'private_bond',financeType:'bond'},
  {key:'private_cash_cancellation',financeType:'cash',existingBond:true},
  {key:'private_bond_combined',financeType:'bond',existingBond:true},
  {key:'private_hybrid',financeType:'hybrid'},
  {key:'private_hybrid_combined',financeType:'hybrid',existingBond:true},
  {key:'developer_cash',financeType:'cash',transactionType:'developer_sale'},
  {key:'developer_bond',financeType:'bond',transactionType:'developer_sale',sellerEntityType:'company',vatTreatment:'vat'},
  {key:'developer_hybrid',financeType:'hybrid',transactionType:'developer_sale',sellerEntityType:'company',vatTreatment:'vat'},
  {key:'developer_direct',financeType:'cash',transactionType:'developer_sale',sellerEntityType:'company',saleChannel:'developer_direct',vatTreatment:'vat'},
  {key:'developer_agency_introduced',financeType:'cash',transactionType:'developer_sale',sellerEntityType:'company',saleChannel:'agency_introduced',vatTreatment:'vat',sourceAgencyOrgId:'cbd15832-98b0-4f4d-ade5-3565d7ef8b79'},
  {key:'sectional_title',financeType:'cash',propertyTenure:'sectional_title',hoaApplicable:true},
  {key:'estate_hoa',financeType:'cash',propertyTenure:'estate_hoa',hoaApplicable:true},
  {key:'company_vat',financeType:'cash',buyerEntityType:'company',sellerEntityType:'company',vatTreatment:'vat'},
  {key:'trust',financeType:'cash',buyerEntityType:'trust',sellerEntityType:'trust'},
  {key:'joint_purchasers',financeType:'cash',partyVariant:'joint_purchasers'},
  ...['married_coc','married_anc','married_anc_accrual'].map(purchaserType=>({key:purchaserType,financeType:'cash',purchaserType})),
  {key:'commercial_vat',financeType:'cash',propertyType:'commercial',buyerEntityType:'company',sellerEntityType:'company',vatTreatment:'vat'},
  {key:'foreign_buyer',financeType:'cash',partyVariant:'foreign_buyer'},
])

export async function exerciseBondFinanceRoute({api,admin,appClient,created,runId,progress,bondOriginator}){
  const id=created.transactionId
  await signInAs(admin,appClient,bondOriginator.email)
  const stageOrder=['intake','documents','submitted_to_banks','bank_review','quote_received','quote_accepted','bond_approved','grant_received','grant_signed','grant_submitted','instruction_sent','complete']
  const forward=async stage=>{
    const current=await appClient.from('transaction_finance_workflows').select('current_stage').eq('transaction_id',id).eq('workflow_type','bond_hybrid').single()
    if(current.error)throw current.error
    if(stageOrder.indexOf(current.data.current_stage)<stageOrder.indexOf(stage))await api.updateBondHybridFinanceStage(id,stage,{actorRole:'bond_originator'})
  }
  await api.createOrGetBondHybridFinanceWorkflow(id,{actorRole:'bond_originator'})
  const existing=await appClient.from('transaction_finance_workflows').select('status').eq('transaction_id',id).eq('workflow_type','bond_hybrid').single()
  if(existing.error)throw existing.error
  if(existing.data.status==='completed'){
    const instruction=await appClient.from('transaction_bond_instructions').select('grant_document_id,signed_grant_document_id,instruction_document_id,grant_received,grant_signed,grant_submitted,instruction_sent').eq('transaction_id',id).single()
    if(instruction.error)throw instruction.error
    assert.ok(instruction.data.grant_document_id&&instruction.data.signed_grant_document_id&&instruction.data.instruction_document_id)
    assert.ok(instruction.data.grant_received&&instruction.data.grant_signed&&instruction.data.grant_submitted&&instruction.data.instruction_sent)
    progress('resumed_finance_completion_verified');return
  }
  await assert.rejects(()=>api.updateBondHybridFinanceStage(id,'complete',{actorRole:'bond_originator'}),/quote|grant|instruction/i)
  await forward('documents')
  await api.markFinanceDocumentsReviewed(id,{actorRole:'bond_originator',notes:'Synthetic staging documents reviewed; no bank delivery.'})
  const priorApplication=await appClient.from('transaction_bond_applications').select('id').eq('transaction_id',id).eq('application_type','bank_application').eq('bank_name','Controlled staging bank').maybeSingle()
  if(priorApplication.error)throw priorApplication.error
  if(!priorApplication.data)await api.addBondApplication(id,{bankName:'Controlled staging bank',referenceNumber:`STAGING-${runId}`,status:'submitted'},{actorRole:'bond_originator'})
  const application=await appClient.from('transaction_bond_applications').select('id').eq('transaction_id',id).eq('application_type','bank_application').eq('bank_name','Controlled staging bank').single()
  if(application.error)throw application.error
  await forward('bank_review')
  for(const outcome of ['additional_documents_required','conditional','approved'])await api.recordBondBankOutcome(application.data.id,{outcome,notes:'Controlled staging bank response; no external bank interaction.'},{actorRole:'bond_originator'})
  progress('bank_feedback_recorded')
  const quoted=await admin.from('transactions').select('bond_amount').eq('id',id).single()
  if(quoted.error)throw quoted.error
  const priorQuote=await appClient.from('transaction_bond_quotes').select('id').eq('transaction_id',id).maybeSingle()
  if(priorQuote.error)throw priorQuote.error
  if(!priorQuote.data){
    const quoteDocument=await api.uploadTransactionFinanceDocument({transactionId:id,file:evidence('bank-quote'),documentType:'bank_quote',actorRole:'bond_originator',relatedEntityType:'bond_application',relatedEntityId:application.data.id})
    await api.addBondQuote(id,{bankName:'Controlled staging bank',bondApplicationId:application.data.id,quotedAmount:quoted.data.bond_amount,termMonths:240,interestRate:10.5,quoteDocumentId:quoteDocument.id,validUntil:new Date(Date.now()+30*86400000).toISOString().slice(0,10)},{actorRole:'bond_originator'})
  }
  const quote=await appClient.from('transaction_bond_quotes').select('id').eq('transaction_id',id).single()
  if(quote.error)throw quote.error
  const visibleFinance=await api.fetchClientPortalOriginatorFinanceByToken(created.buyerPortalToken)
  assert.ok(visibleFinance.offerCaptures.some(offer=>offer.id===quote.data.id),'The buyer must see the real canonical quote.')
  const pdf=await api.resolveClientPortalQuotePdf({token:created.buyerPortalToken,offerId:quote.data.id})
  const downloaded=await fetch(pdf.url)
  assert.equal(downloaded.status,200,'The buyer quote URL must open its actual stored bytes.')
  assert.ok((await downloaded.arrayBuffer()).byteLength>0)
  progress('bank_quote_and_pdf_visible_to_buyer')
  progress('bank_quote_shared')
  // Use the buyer's actual anonymous portal context for the acceptance.
  await appClient.auth.signOut({scope:'local'})
  await api.recordBondOfferDecision(quote.data.id,{decision:'accepted',token:created.buyerPortalToken,actorRole:'buyer',notes:'Controlled staging buyer acceptance.'})
  progress('buyer_offer_accepted')
  await signInAs(admin,appClient,bondOriginator.email)
  const accepted=await appClient.from('transaction_bond_quotes').select('quote_status').eq('id',quote.data.id).single()
  if(accepted.error)throw accepted.error
  assert.equal(accepted.data.quote_status,'approved_by_buyer','Buyer acceptance must update the canonical offer, not only an event.')
  await api.recordBondGrantMilestone(id,{stage:'bond_approved'},{actorRole:'bond_originator'})
  const grant=await api.uploadTransactionFinanceDocument({transactionId:id,file:evidence('bond-grant'),documentType:'bond_grant',actorRole:'bond_originator'})
  const signed=await api.uploadTransactionFinanceDocument({transactionId:id,file:evidence('signed-bond-grant'),documentType:'signed_bond_grant',actorRole:'bond_originator'})
  for(const stage of ['grant_received','grant_signed','grant_submitted']){
    await api.recordBondGrantMilestone(id,{stage,acceptedBondOfferId:quote.data.id,grantDocumentId:grant.id,signedGrantDocumentId:signed.id},{actorRole:'bond_originator'})
    progress(stage)
  }
  const instruction=await api.uploadTransactionFinanceDocument({transactionId:id,file:evidence('bank-attorney-instruction'),documentType:'bond_instruction',actorRole:'bond_originator'})
  await api.markFinanceInstructionSent(id,{instructionDocumentId:instruction.id,acceptedBondOfferId:quote.data.id,actorRole:'bond_originator'})
  await api.updateBondHybridFinanceStage(id,'complete',{actorRole:'bond_originator'})
  const grantedFinance=await api.fetchClientPortalOriginatorFinanceByToken(created.buyerPortalToken)
  assert.ok(grantedFinance.grantCaptures.length,'The buyer must see the published grant.')
  progress('buyer_grant_readback_verified')
  progress('bond_finance_complete')
}

export async function exerciseTransactionRoute({vite,api,admin,appClient,scenario,state,progress,actors,runId}){
  assert.equal(new URL(process.env.VITE_SUPABASE_URL).hostname,'vaszuxjeoajeuhlcnzzf.supabase.co')
  const developer=scenario.transactionType==='developer_sale'
  const actor=developer?actors.developer:actors.agent
  let unitId=null
  if(developer&&!state.created){
    const unit=await admin.from('units').insert({development_id:'74d85095-1c99-4e04-a826-a67401691e4d',unit_number:`ROUTE-${runId}`,unit_label:'Controlled route test',price:2190000,status:'Available',notes:`full_transaction_portal_staging_acceptance_v1:${runId}`}).select('id').single()
    if(unit.error)throw unit.error
    unitId=unit.data.id;state.unitIds.push(unitId);progress('unit_created')
  }
  await signInAs(admin,appClient,actor.email)
  const buyerEmail=`${developer?'developer':'agent'}.buyer.${runId}@example.test`
  if(!state.buyerEmails.includes(buyerEmail))state.buyerEmails.push(buyerEmail)
  const created=state.created||await createMatter({admin,api,transactionType:scenario.transactionType||'private_property',actor,organisationId:actor.organisation_id,unitId,runId,firm:actors.firm,bondOriginator:actors.bondOriginator,buyerEmail,scenario})
  if(!state.transactionIds.includes(created.transactionId))state.transactionIds.push(created.transactionId)
  if(created.privateListingId&&!state.privateListingIds.includes(created.privateListingId))state.privateListingIds.push(created.privateListingId)
  state.created=created;progress('transaction_created')
  if(!state.buyerSubmitted){
  await appClient.auth.signOut({scope:'local'})
  const demo=await vite.ssrLoadModule('/src/lib/onboardingDemoLinks.js')
  const formData=buildRouteBuyerForm({scenario,primary:demo.getDemoBuyerOnboardingPayload().formData.purchasers[0],buyerEmail,phone:`+2782${runId.replace(/\D/g,'').slice(-7)}`,developer})
  const consent=await vite.ssrLoadModule('/src/lib/platformFeeConsent.js')
  formData.platformFeeConsent=consent.buildPlatformFeeConsentAcceptance('buyer',{accepted:true,acceptedAt:new Date().toISOString(),source:'controlled_staging_acceptance'})
  const signing=await vite.ssrLoadModule('/src/core/documents/buyerFicaDeclarationSigning.js')
  formData.buyer_fica_declaration=signing.buildBuyerFicaDeclarationSigningState({purchaserEntityType:formData.purchaser_entity_type,purchasers:formData.purchasers,company:formData.company,trust:formData.trust},{acknowledgementAccepted:true,acknowledgedAt:new Date().toISOString(),signers:signing.getBuyerFicaDeclarationSigners({purchaserEntityType:formData.purchaser_entity_type,purchasers:formData.purchasers,company:formData.company,trust:formData.trust}).map(signer=>({id:signer.id,signature:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfZkAAAAASUVORK5CYII=',signedAt:new Date().toISOString()}))})

  const onboarding=await admin.from('transaction_onboarding').select('token').eq('transaction_id',created.transactionId).single()
  if(onboarding.error)throw onboarding.error
  const initial=await api.fetchClientOnboardingByToken(onboarding.data.token)
  await api.saveClientOnboardingDraft({token:onboarding.data.token,formData:{...initial.formData,...formData}})
  await uploadBuyerRequirements({admin,api,created,label:scenario.key})
  const reopened=await api.fetchClientOnboardingByToken(onboarding.data.token)
  await api.submitClientOnboarding({token:onboarding.data.token,formData:reopened.formData})
  await uploadBuyerRequirements({admin,api,created,label:scenario.key})
  state.buyerSubmitted=true;progress('buyer_submitted')
  }
  if(!state.sellerSubmitted){
  if(developer){
    await signInAs(admin,appClient,actor.email)
    const service=await vite.ssrLoadModule('/src/services/developerDocumentPortalService.js')
    const link=await service.createDeveloperDocumentPortalLink({transactionId:created.transactionId,recipientEmail:actor.email,expiresDays:1})
    const payload=await service.fetchDeveloperDocumentPortal(link.accessToken)
    for(const r of payload.requirements||[])await service.uploadDeveloperDocumentPortalFile({token:link.accessToken,portalId:payload.portal.id,transactionId:created.transactionId,requirementId:r.id,category:r.category||'Developer Documents',file:evidence(`developer-${r.key||r.id}`)})
    progress('developer_documents_submitted')
  }else{
    const service=await vite.ssrLoadModule('/src/services/privateListingService.js')
    const sellerSession=state.sellerSession||await service.setSellerPortalPassword({token:created.sellerOnboardingToken,password:`Controlled!${runId}`})
    const token=sellerSession.stablePortalToken||created.sellerOnboardingToken
    state.sellerSession=sellerSession;state.sellerToken=token;progress('seller_session_created')
    await appClient.auth.signOut({scope:'local'})
    const seller=await service.getSellerOnboardingByToken(token,{requirePortalAccess:true,includeRequirementsAndDocuments:true,sellerPortalAccessToken:sellerSession.accessToken})
    const sellerType=scenario.sellerEntityType||'individual'
    const sellerDraft={...seller.onboarding.form_data,...sellerRouteVariant(scenario,`seller.${runId}@example.test`,`+2784${runId.replace(/\D/g,'').slice(-7)}`)}
    await service.updateSellerOnboardingProgress(token,{sellerPortalAccessToken:sellerSession.accessToken,formData:sellerDraft,listingSnapshot:seller.listing,sellerType,ownershipStructure:sellerType})
    const sellerRequirements=await service.getSellerOnboardingByToken(token,{requirePortalAccess:true,includeRequirementsAndDocuments:true,sellerPortalAccessToken:sellerSession.accessToken})
    const suppliedSellerKeys=new Set((sellerRequirements.listing.documentRequirements||[]).map(r=>r.requirement_key||r.key))
    for(const r of sellerRequirements.listing.documentRequirements||[])await service.uploadSellerClientPortalDocument({token,accessToken:sellerSession.accessToken,file:evidence(`seller-${r.requirement_key||r.key}`),requirementKey:r.requirement_key||r.key,documentType:r.requirement_key||r.key,category:'Seller Document'})
    const latest=await service.getSellerOnboardingByToken(token,{requirePortalAccess:true,sellerPortalAccessToken:sellerSession.accessToken})
    await service.submitSellerOnboarding(token,{sellerPortalAccessToken:sellerSession.accessToken,formData:{...latest.onboarding.form_data,sellerFirstName:'Controlled',sellerSurname:'Seller',email:`seller.${runId}@example.test`,phone:`+2784${runId.replace(/\D/g,'').slice(-7)}`,...sellerRouteVariant(scenario,`seller.${runId}@example.test`,`+2784${runId.replace(/\D/g,'').slice(-7)}`),askingPrice:'2190000'},listingSnapshot:latest.listing,sellerType:scenario.sellerEntityType||'individual',ownershipStructure:scenario.sellerEntityType||'sole_owner',maritalRegime:'single'})
    const submittedSeller=await service.getSellerOnboardingByToken(token,{requirePortalAccess:true,includeRequirementsAndDocuments:true,sellerPortalAccessToken:sellerSession.accessToken})
    for(const r of (submittedSeller.listing.documentRequirements||[]).filter(r=>!suppliedSellerKeys.has(r.requirement_key||r.key)))await service.uploadSellerClientPortalDocument({token,accessToken:sellerSession.accessToken,file:evidence(`seller-${r.requirement_key||r.key}`),requirementKey:r.requirement_key||r.key,documentType:r.requirement_key||r.key,category:'Seller Document'})
    progress('seller_submitted')
  }
  state.sellerSubmitted=true;progress('seller_phase_complete')
  }
  if(scenario.financeType!=='cash'&&!state.financeComplete){
    await signInAs(admin,appClient,actor.email)
    const spine=await appClient.from('transactions').select('bond_workspace_id').eq('id',created.transactionId).single()
    if(spine.error)throw spine.error
    if(!spine.data.bond_workspace_id){
      const replay=await appClient.from('transaction_bond_applications').update({assigned_user_id:actors.bondOriginator.user_id}).eq('transaction_id',created.transactionId).eq('application_type','originator_intake')
      if(replay.error)throw replay.error
    }
    await exerciseBondFinanceRoute({api,admin,appClient,created,runId,progress,bondOriginator:actors.bondOriginator})
    state.financeComplete=true;progress('finance_phase_complete')
  }
  await signInAs(admin,appClient,actor.email)
  if(scenario.financeType!=='cash'||scenario.existingBond){
    const email=`firm-admin.${runId}@example.test`
    let userId=state.fixtureLegalUserIds?.at(-1)
    if(!userId){
    const made=await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:'Controlled staging firm administrator'}})
    if(made.error)throw made.error
    userId=made.data.user.id
    state.fixtureLegalUserIds=[...(state.fixtureLegalUserIds||[]),userId];progress('firm_admin_created')
    const profile=await admin.from('profiles').upsert({id:userId,email,full_name:'Controlled staging firm administrator',role:'attorney'})
    if(profile.error)throw profile.error
    const membership=await admin.from('organisation_users').insert({user_id:userId,email,organisation_id:'cbbd85b9-dbf8-44db-9d2a-e025600a940f',role:'owner',workspace_role:'owner',app_role:'attorney',scope_level:'workspace_hq',status:'active',membership_status:'active'})
    if(membership.error)throw membership.error
    const firmMember=await admin.from('attorney_firm_members').insert({firm_id:'417e5aa8-4c61-4821-838e-8dd4a479cc19',user_id:userId,role:'firm_admin',status:'active'})
    if(firmMember.error)throw firmMember.error
    }
    const owned=await admin.auth.admin.getUserById(userId)
    if(owned.error)throw owned.error
    assert.equal(owned.data.user.email,email)
    const link=await admin.auth.admin.generateLink({type:'magiclink',email})
    if(link.error)throw link.error
    const signed=await actors.firmAdminClient.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})
    if(signed.error)throw signed.error
    state.firmAdminSession=signed.data.session
    state.fixtureAuthSessions=[...(state.fixtureAuthSessions||[]),signed.data.session.access_token]
    progress('firm_admin_authenticated')
  }
  const attorneyClient=actors.attorneyClient
  if(scenario.financeType!=='cash'){
    await signInAs(admin,actors.bondOriginatorClient,actors.bondOriginator.email)
    const originatorAuth=await actors.bondOriginatorClient.auth.getSession()
    if(originatorAuth.error)throw originatorAuth.error
    state.bondOriginatorSession=originatorAuth.data.session
  }
  await signInAs(admin,attorneyClient,actors.attorney.email)
  const auth=await attorneyClient.auth.getSession()
  if(auth.error)throw auth.error
  state.attorneySession=auth.data.session;progress('legal_ready')
  // The first negative check must use the initiating agent, not the temporary
  // firm administrator used above to accept a bank appointment.
  await signInAs(admin,appClient,actor.email)
  const receipt=await exerciseCashTransactionCloseout({vite,api,admin,appClient,created,attorneySession:auth.data.session,runId,evidence,progress,state,scenario})
  if(receipt.registrationVerified&&receipt.closeoutVerified){
    receipt.persistedRouteFacts=await verifyPersistedRouteFacts({client:appClient,transactionId:created.transactionId,scenario})
    await appClient.auth.signOut({scope:'local'})
    receipt.portalReadbacks=await verifyTransactionRouteReadbacks({vite,api,created,state,developer})
    progress('completed_portal_readbacks_verified')
  }
  progress('route_completed')
  return receipt
}

export async function verifyTransactionRouteReadbacks({vite,api,created,state,developer=false}){
  const buyer=await api.fetchClientPortalCoreByToken(created.buyerPortalToken)
  assert.equal(buyer.transaction.id,created.transactionId)
  assert.equal(buyer.transaction.current_main_stage,'REG')
  if(developer){
    assert.equal(buyer.unit?.id,created.unitId,'The buyer must retain access to their purchased development unit')
    assert.equal(buyer.unit?.status,'Registered','The purchased unit inventory must reflect registration')
  }
  const journey=await api.fetchClientPortalJourneySnapshotByToken(created.buyerPortalToken,'buyer',{legalOnly:true})
  assert.equal(journey.legalJourney.status,'ready')
  assert.equal(journey.legalJourney.snapshot.legalProgress.percent,100,'Buyer legal progress must reflect completed applicable tasks')
  const result={buyerRegistrationVisible:true,buyerLegalProgress:100,
    verifiedApplicableLegalTaskCount:journey.legalJourney.snapshot.legalProgress.applicableCount}
  if(!developer){
    const service=await vite.ssrLoadModule('/src/services/privateListingService.js')
    const seller=await service.getSellerOnboardingByToken(state.sellerToken,{requirePortalAccess:true,corePayload:true,sellerPortalAccessToken:state.sellerSession.accessToken})
    assert.equal(seller.transaction.id,created.transactionId)
    assert.equal(seller.transaction.lifecycle_state,'completed')
    const sellerJourney=await api.fetchClientPortalJourneySnapshotByToken(state.sellerToken,'seller',{legalOnly:true,sellerPortalAccessToken:state.sellerSession.accessToken})
    assert.equal(sellerJourney.legalJourney.status,'ready')
    assert.equal(sellerJourney.legalJourney.snapshot.legalProgress.percent,100,'Seller legal progress must reflect completed applicable tasks')
    Object.assign(result,{sellerCompletionVisible:true,sellerLegalProgress:100})
  }
  return result
}

export async function verifyPersistedRouteFacts({client,transactionId,scenario}){
    const facts=await client.from('transactions').select('finance_type,transaction_type,purchaser_type,property_type,property_tenure,seller_type,vat_treatment,seller_has_existing_bond,sale_channel,source_agency_org_id,purchase_price,sales_price,cash_amount,bond_amount,deposit_amount,routing_profile_json').eq('id',transactionId).single()
    if(facts.error)throw facts.error
    assert.equal(facts.data.finance_type,scenario.financeType)
    assert.equal(facts.data.transaction_type,scenario.transactionType||'private_property')
    const expectedPurchaserType=scenario.buyerEntityType||scenario.purchaserType||(scenario.partyVariant==='foreign_buyer'?'foreign_purchaser':'individual')
    assert.equal(facts.data.purchaser_type,getTransactionPurchaserTypeValue(expectedPurchaserType))
    assert.equal(facts.data.property_type,scenario.propertyType||'residential')
    assert.equal(facts.data.property_tenure,scenario.propertyTenure||'freehold')
    assert.equal(facts.data.seller_type,scenario.sellerEntityType||'individual')
    assert.equal(facts.data.vat_treatment,scenario.vatTreatment||'transfer_duty')
    assert.equal(facts.data.seller_has_existing_bond,scenario.existingBond===true)
    assert.equal(Number(facts.data.purchase_price),2190000)
    assert.equal(Number(facts.data.sales_price),2190000)
    assert.equal(Number(facts.data.cash_amount),scenario.financeType==='cash'?2190000:scenario.financeType==='hybrid'?500000:0)
    assert.equal(Number(facts.data.bond_amount),scenario.financeType==='cash'?0:scenario.financeType==='hybrid'?1690000:2190000)
    assert.equal(Number(facts.data.deposit_amount),100000)
    if(scenario.saleChannel)assert.equal(facts.data.sale_channel,scenario.saleChannel)
    if(scenario.sourceAgencyOrgId)assert.equal(facts.data.source_agency_org_id,scenario.sourceAgencyOrgId)
    const profile=facts.data.routing_profile_json||{},tax=profile.transferTaxDecision||{}
    if(scenario.sarsQuery){assert.equal(tax.sarsEvidenceRequest,'yes');assert.ok(tax.sarsQueryResponseReference?.startsWith('QUERY-RESPONSE-'),'The saved SARS query response must survive registration and closeout')}
    if(scenario.nonResidentSeller){
      const seller=profile.scenarioProfile?.parties?.find(p=>p.role==='seller')
      assert.equal(seller?.taxResidence,'outside_south_africa')
      const review=tax.nonResidentSellers?.[seller.id]
      assert.equal(review?.directiveStatus,'issued');assert.equal(review?.withholdingRequired,'yes')
      assert.ok(review.paymentReference?.startsWith('STAGING-NO-PAYMENT-'))
    }
    if(scenario.hoaApplicable)assert.equal(profile.mvpProfile?.hoaApplicable,'yes')
    if(scenario.propertyConditions){assert.equal(profile.mvpProfile?.propertyConditions?.titleRestrictions,'yes');assert.equal(profile.mvpProfile?.propertyConditions?.complianceCertificates,'yes')}
    if(scenario.specialistReviewed){
      const routes=Object.values(profile.scenarioProfile?.specialistRoutes||{})
      assert.ok(routes.length>0);assert.ok(routes.every(r=>r.status==='confirmed'&&r.instrument==='deeds_transfer'))
    }
    let buyerBranchVerified=null
    if(scenario.purchaserType||scenario.partyVariant){
      const saved=await client.from('onboarding_form_data').select('form_data').eq('transaction_id',transactionId).single()
      if(saved.error)throw saved.error
      const form=saved.data.form_data
      const flow=resolveBuyerOnboardingFlow(form,facts.data)
      buyerBranchVerified=flow.buyer_branch||flow.purchaser_branch
      assert.equal(buyerBranchVerified,scenario.purchaserType||(scenario.partyVariant==='foreign_buyer'?'foreign_purchaser':'individual'))
      if(scenario.partyVariant==='joint_purchasers'){
        assert.equal(form.purchasers.length,2)
        assert.equal(form.purchasers.reduce((sum,p)=>sum+Number(p.ownership_share),0),100)
      }
    }
    return {financeType:facts.data.finance_type,transactionType:facts.data.transaction_type,purchaserType:facts.data.purchaser_type,buyerBranchVerified,propertyType:facts.data.property_type,propertyTenure:facts.data.property_tenure,sellerType:facts.data.seller_type,vatTreatment:facts.data.vat_treatment,saleChannel:facts.data.sale_channel,existingBond:facts.data.seller_has_existing_bond,priceAndFundingPreserved:true}
}
