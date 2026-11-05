import assert from 'node:assert/strict'

// Every legal/business assertion below describes disposable staging evidence.
// No live registration, payment, delivery or professional decision is performed.
export async function exerciseCashTransactionCloseout({ vite, api, admin, appClient, created,
  attorneySession, runId, evidence, progress, state = {}, scenario = {} }) {
  const id=created.transactionId
  const financeType=scenario.financeType||'cash'
  const transactionType=scenario.transactionType||'private_property'
  const existingBond=scenario.existingBond===true
  const journal=[]
  const record=(step,details={})=>{journal.push({step,...details});progress(`closeout:${step}`)}
  const resumeAfterFacts=state.routingFactsSaved===true||process.env.STAGING_E2E_RESUME_AFTER_FACTS==='true'
  async function verifyWithdrawnOutcome(){
    // Cancellation intentionally retires the external attorney. Verify the
    // result and terminal gate as a current owner with lifecycle authority.
    const row=await admin.from('transactions').select('organisation_id,lifecycle_state,cancelled_at,cancelled_reason,registered_at,completed_at').eq('id',id).single()
    if(row.error)throw row.error
    assert.equal(row.data.lifecycle_state,'cancelled');assert.ok(row.data.cancelled_at&&row.data.cancelled_reason)
    assert.equal(row.data.registered_at,null);assert.equal(row.data.completed_at,null)
    const email=`finance.${runId}@example.test`
    let userId=state.fixtureFinanceUserIds?.at(-1)
    if(!userId){
      const made=await admin.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:'Controlled staging terminal-state owner'}})
      if(made.error)throw made.error
      userId=made.data.user.id;state.fixtureFinanceUserIds=[...(state.fixtureFinanceUserIds||[]),userId]
      record('fixture_terminal_owner_created')
    }
    const owned=await admin.auth.admin.getUserById(userId)
    if(owned.error)throw owned.error
    assert.equal(owned.data.user.email,email)
    const profile=await admin.from('profiles').upsert({id:userId,email,full_name:'Controlled staging terminal-state owner',role:'developer'})
    if(profile.error)throw profile.error
    const membership=await admin.from('organisation_users').upsert({user_id:userId,email,organisation_id:row.data.organisation_id,app_role:'developer',workspace_role:'owner',role:'owner',status:'active',membership_status:'active'},{onConflict:'organisation_id,email'})
    if(membership.error)throw membership.error
    const link=await admin.auth.admin.generateLink({type:'magiclink',email})
    if(link.error)throw link.error
    const signed=await appClient.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})
    if(signed.error)throw signed.error
    state.fixtureAuthSessions=[...(state.fixtureAuthSessions||[]),signed.data.session.access_token]
    await assert.rejects(()=>api.markTransactionRegistered({transactionId:id,registrationDate:new Date().toISOString().slice(0,10),titleDeedNumber:`STAGING-${runId}`}),/cancelled|lifecycle|registration|stage/i)
    await assert.rejects(()=>api.markTransactionCompleted(id),/register|close|pending|cancelled/i)
    const verified=await appClient.from('transactions').select('lifecycle_state,registered_at,completed_at').eq('id',id).single()
    if(verified.error)throw verified.error
    assert.equal(verified.data.lifecycle_state,'cancelled');assert.equal(verified.data.registered_at,null);assert.equal(verified.data.completed_at,null)
    record('withdrawn_sale_verified_by_authorised_owner')
    record('terminal_route_registration_and_completion_blocked')
    return {route:scenario.key,journal,expectedTerminal:scenario.terminalOutcome,registrationVerified:false,closeoutVerified:false,terminalProtectionVerified:true}
  }
  if(scenario.terminalOutcome==='cancelled'&&resumeAfterFacts){
    const prior=await admin.from('transactions').select('lifecycle_state').eq('id',id).single()
    if(prior.error)throw prior.error
    if(prior.data.lifecycle_state==='cancelled')return verifyWithdrawnOutcome()
  }
  if(!resumeAfterFacts){
  await assert.rejects(()=>api.markTransactionRegistered({transactionId:id}),
    transactionType==='developer_sale'?/stage|checklist|registration|date/i:/role|permission/i)
  record(transactionType==='developer_sale'?'developer_cannot_register_prematurely':'agent_cannot_register')
  if(transactionType!=='developer_sale'){
    const directRegistration=await appClient.from('transactions').update({registered_at:new Date().toISOString()}).eq('id',id).select('id')
    assert.ok(directRegistration.error?.code==='42501'||directRegistration.data?.length===0,'The ordinary agent must also be denied a direct registration write.')
    record('agent_direct_registration_write_blocked')
  }

  // The agent supplies handed-in source documents through the same upload API.
  let requirements=await admin.from('document_requirement_instances').select('*').eq('transaction_id',id)
  if(requirements.error)throw requirements.error
  for(const r of requirements.data.filter(r=>r.status!=='not_applicable'&&!r.satisfied_by_document_id&&
    (r.uploadable_by_roles||[]).some(role=>['agent','agency'].includes(role)))) {
    await api.uploadDocument({transactionId:id,file:evidence(`agent-${r.document_definition_key}`),
      documentType:r.document_definition_key,requiredDocumentKey:r.document_definition_key,
      canonicalRequirementInstanceId:r.id,category:'Controlled staging source evidence'})
  }
  const signedOtp=requirements.data.find(r=>r.document_definition_key==='signed_otp'&&r.satisfied_by_document_id)
  assert.ok(signedOtp,'The simulated signed-OTP starting evidence is required.')
  await api.reviewCanonicalDocumentRequirement({requirementInstanceId:signedOtp.id,documentId:signedOtp.satisfied_by_document_id,
    action:'approve',notes:'Controlled staging signed-OTP precondition; synthetic file, no real legal execution.'})
  await api.finalizeCanonicalPhysicalSignedOtpWorkflow({transactionId:id,financeType,actorRole:'agent'})
  record('agent_signed_otp_handoff_finalized')
  record('agent_source_documents_uploaded')
  const session=await appClient.auth.setSession(attorneySession)
  if(session.error)throw session.error
  let assignment=await appClient.from('transaction_attorney_assignments').select('id,allocation_state,firm_acceptance_status,attorney_user_id,instruction_status').eq('transaction_id',id).eq('attorney_role','transfer_attorney').single()
  if(assignment.error)throw assignment.error
  if(assignment.data.allocation_state==='awaiting_firm_acceptance')await api.acceptAttorneyIncomingMatterInstruction({transactionId:id,note:`Controlled staging firm acceptance ${runId}`})
  if(!assignment.data.attorney_user_id){
    const allocation=await vite.ssrLoadModule('/src/services/attorneyCoordinationNominationService.js')
    await allocation.manageAttorneyFirmAllocation({assignmentId:assignment.data.id,action:'assign_primary',attorneyUserId:attorneySession.user.id},{client:appClient})
  }
  await api.acceptAttorneyIncomingMatterInstruction({transactionId:id,note:`Controlled staging instruction ${runId}`})
  record('attorney_instruction_accepted')
  await assert.rejects(()=>api.markTransactionRegistered({transactionId:id}),/stage|checklist|date|document|registration/i)
  await assert.rejects(()=>api.markTransactionCompleted(id),/register|close|complete|pending|stage/i)
  const prematureDirectRegistration=await appClient.from('transactions').update({registered_at:new Date().toISOString()}).eq('id',id).select('id')
  assert.equal(prematureDirectRegistration.error?.code,'23514','Even an appointed attorney must satisfy database registration readiness.')
  record('attorney_direct_premature_registration_blocked')
  record('premature_registration_and_closeout_blocked')

  }
  const legalSession=await appClient.auth.setSession(attorneySession)
  if(legalSession.error)throw legalSession.error
  const lanes=await vite.ssrLoadModule('/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const planService=await vite.ssrLoadModule('/src/services/attorneyWorkflow/matterWorkflowPlanService.js')
  const presenter=await vite.ssrLoadModule('/src/services/attorneyWorkflow/transferWorkspaceViewModel.js')
  const workbench=await vite.ssrLoadModule('/src/core/transactions/legalTaskWorkbenchModel.js')
  const persona=await vite.ssrLoadModule('/src/services/matterScenarioProfile.js')
  const today=new Date(Date.now()+7200000).toISOString().slice(0,10)
  const future=new Date(Date.now()+30*86400000).toISOString().slice(0,10)
  const party=role=>{
    const entityType=scenario[role+'EntityType']||'individual'
    const data={id:`${role}-primary`,role,name:`Controlled ${role}`,entityType,
      maritalRegime:role==='buyer'&&scenario.purchaserType?.startsWith('married_')?(scenario.purchaserType==='married_coc'?'in_community':'out_of_community'):'single',ownershipShare:100,
      identityRoute:scenario.partyVariant==='foreign_buyer'&&role==='buyer'?'foreign_passport':'sa_id',
      taxResidence:((scenario.partyVariant==='foreign_buyer'&&role==='buyer')||(scenario.nonResidentSeller&&role==='seller'))?'outside_south_africa':'south_africa',
      representatives:['company','trust'].includes(entityType)?[{id:role+'-signatory',name:'Controlled signatory',capacity:entityType==='trust'?'Trustee':'Director'}]:[]}
    return {...data,capacityReview:{status:'cleared',note:'Controlled staging evidence reviewed',
      confirmations:Object.fromEntries(persona.partyCapacityCheckRequirements(data).map(c=>[c.key,true]))}}
  }
  const taxRoute=scenario.vatTreatment||'transfer_duty'
  const parties=[party('buyer'),party('seller')]
  if(scenario.partyVariant==='joint_purchasers'){
    parties[0].ownershipShare=50
    parties.push({...party('buyer'),id:'buyer-secondary',name:'Controlled co-purchaser',ownershipShare:50})
  }
  const specialist=await vite.ssrLoadModule('/src/services/attorneyWorkflow/specialistRoutePolicy.js')
  const specialistRoutes=scenario.terminalOutcome==='specialist_hold'?{other_exception:{active:true,status:'hold',instrument:'unknown',owner:'Controlled staging attorney',reason:'Synthetic unresolved specialist authority.'}}:scenario.terminalOutcome==='other_instrument'?{share_block:{active:true,status:'confirmed',instrument:'other_instrument',owner:'Controlled staging attorney',reason:'Synthetic classification outside deeds-transfer execution.',evidenceReference:`STAGING-INSTRUMENT-${runId}`}}:scenario.specialistReviewed?Object.fromEntries(Object.keys(specialist.SPECIALIST_ROUTE_LABELS).map(key=>[key,{active:true,status:'confirmed',instrument:'deeds_transfer',owner:'Controlled staging attorney',reason:'Synthetic reviewed specialist route; software test only.',evidenceReference:`STAGING-${key}-${runId}`}])):{}
  if(!resumeAfterFacts){
  await api.saveTransactionRoutingProfile({transactionId:id,financeType,transactionType,
    propertyType:scenario.propertyType||'residential',propertyTenure:scenario.propertyTenure||'freehold',purchaserType:scenario.buyerEntityType||scenario.purchaserType||(scenario.partyVariant==='foreign_buyer'?'foreign_purchaser':'individual'),sellerType:scenario.sellerEntityType||'individual',
    sellerHasExistingBond:existingBond,cancellationRequired:existingBond,vatTreatment:scenario.vatTreatment||'transfer_duty',
    mvpProfile:{sellerExistingBond:existingBond,hoaApplicable:scenario.hoaApplicable?'yes':'no',paymentSecurity:financeType==='cash'?'cleared_trust_funds':'bank_guarantee',
      propertyConditions:{titleRestrictions:scenario.propertyConditions?'yes':'no',titleConditionsReference:scenario.propertyConditions?`TITLE-${runId}`:'',complianceCertificates:scenario.propertyConditions?'yes':'no',certificates:{electrical:scenario.propertyConditions?'yes':'no',gas:'no',electricFence:'no',beetle:'no',water:'no'},
        electricalBasisNote:'Controlled staging scenario: undeveloped residential erf with no electrical installation.',
        clearances:Object.fromEntries(['municipal','bodyCorporate','hoa'].map(key=>[key,{issuer:'Controlled staging '+key,reference:`CLEARANCE-${key}-${runId}`,issuedOn:today,validUntil:future}]))}},
    transferTaxDecision:{status:'confirmed',route:taxRoute,dutyPaymentRequired:taxRoute==='transfer_duty'?'yes':'no',
      sellerVatRegistered:taxRoute.includes('vat')||taxRoute==='zero_rated_going_concern'?'yes':'no',
      buyerVatRegistered:taxRoute==='zero_rated_going_concern'?'yes':'no',sellerVatNumberReference:`VAT-${runId}`,buyerVatNumberReference:`BUYER-VAT-${runId}`,supplyInCourseOfEnterprise:'yes',
      goingConcernAgreementReference:`GOING-CONCERN-${runId}`,exemptionClaims:taxRoute==='exempt'?[{statutoryBasis:'Controlled staging exemption basis',appliesTo:'whole transaction',applicable:'yes',evidenceReference:`EXEMPT-${runId}`,basisNote:'Synthetic route fixture; no tax determination.'}]:[],
      sarsEvidenceRequest:scenario.sarsQuery?'yes':'no',sarsQueryResponseReference:scenario.sarsQuery?`QUERY-RESPONSE-${runId}`:'',sellerNonResidentReview:scenario.nonResidentSeller?'yes':'no',nonResidentSellers:scenario.nonResidentSeller?{'seller-primary':{applicable:'yes',basisNote:'Synthetic non-resident seller route.',directiveStatus:'issued',directiveReference:`DIRECTIVE-${runId}`,withholdingRequired:'yes',proofReference:`WITHHOLDING-${runId}`,paymentReference:'',remittanceStatus:'withheld',reservedFundsReference:`STAGING-RESERVED-${runId}`,remittanceOwner:'Controlled staging attorney',paymentEvent:'Synthetic withholding event; no real funds.',withheldOn:today,dueOn:new Date(Date.now()+7*86400000).toISOString().slice(0,10),purchaserResidence:'resident'}}:{},
      tdc01Reference:`TDC-${runId}`,sarsStatus:'receipted',sarsProofReference:`SARS-${runId}`,
      assessmentReference:`ASSESS-${runId}`,paymentReference:`DUTY-${runId}`,basisNote:'Controlled simulated assessment and receipt; not a live tax calculation.'},
    scenarioProfile:scenario.scenarioProfile||{parties,exceptions:[],specialistRoutes},
    reason:'Controlled staging route; confirm fixture facts through the normal attorney editor.'})
  record('attorney_routing_facts_saved')
  const matterNumber=await vite.ssrLoadModule('/src/services/attorneyMatterNumberService.js')
  await matterNumber.saveAttorneyMatterNumber(appClient,id,`STAGING-${runId}`)
  const title=await appClient.from('transactions').update({title_deed_number:`STAGING-TITLE-${runId}`}).eq('id',id)
  if(title.error)throw title.error
  record('attorney_matter_number_saved')
  await lanes.reconcileAttorneyWorkflowPlanForTransaction(id,{source:'controlled_staging_acceptance'})
  state.canonicalRoutingSynced=true
  state.routingFactsSaved=true
  record('attorney_facts_and_current_plan_saved')
  }

  if(!state.canonicalRoutingSynced){await api.prepareBuyerOnboardingDocumentWorkspace(id);state.canonicalRoutingSynced=true;record('canonical_route_documents_reconciled')}
  const allocation=await vite.ssrLoadModule('/src/services/attorneyCoordinationNominationService.js')
  const firmAdminSession=state.firmAdminSession||attorneySession
  for(const laneKey of [financeType==='cash'?null:'bond',existingBond?'cancellation':null].filter(Boolean)){
    const attorneyRole=laneKey+'_attorney'
    let assignment=await appClient.from('transaction_attorney_assignments').select('*').eq('transaction_id',id).eq('attorney_role',attorneyRole).maybeSingle()
    if(assignment.error)throw assignment.error
    if(!assignment.data){
      // Bank appointment evidence and firm acceptance precede staff allocation.
      // Do not bypass the bank-appointed-firm trigger to make the test pass.
      let appointment=await appClient.from('transaction_legal_role_appointments').select('*').eq('transaction_id',id).eq('role_type',attorneyRole).neq('coordination_state','replacement_required').maybeSingle()
      if(appointment.error)throw appointment.error
      if(!appointment.data){
        const bankEvidence=await api.uploadDocument({transactionId:id,file:evidence(laneKey+'-bank-appointment'),documentType:laneKey+'_bank_appointment',source:'attorney_workspace',attorneyLaneKey:'transfer',category:'Controlled staging bank appointment'})
        const bankAppointments=await vite.ssrLoadModule('/src/services/bankAttorneyAppointmentService.js')
        appointment={data:await bankAppointments.captureBankAttorneyAppointment({transactionId:id,roleType:attorneyRole,
          bankName:'Controlled staging bank',appointmentReference:`APPOINT-${laneKey}-${runId}`,companyName:'Tuckers',
          contactName:'Controlled staging attorney',email:firmAdminSession.user.email,evidenceConfirmed:true,evidenceDocumentId:bankEvidence.id},{client:appClient})}
      }
      const invitation=await appClient.from('transaction_partner_invitations').insert({transaction_id:id,role_type:attorneyRole,company_name:'Tuckers',
        contact_name:'Controlled staging attorney',email:firmAdminSession.user.email,status:'pending',invited_by_user_id:attorneySession.user.id,
        invitation_token:crypto.randomUUID(),expires_at:new Date(Date.now()+86400000).toISOString(),metadata:{legal_role_appointment_id:appointment.data.id,source:'controlled_staging_route'}}).select('invitation_token').single()
      if(invitation.error)throw invitation.error
      const firmLogin=await appClient.auth.setSession(firmAdminSession)
      if(firmLogin.error)throw firmLogin.error
      const accepted=await appClient.rpc('bridge_accept_transaction_partner_invitation',{p_token:invitation.data.invitation_token,p_profile:{},p_organisation_id:'cbbd85b9-dbf8-44db-9d2a-e025600a940f'})
      if(accepted.error)throw accepted.error
      assert.equal(accepted.data.success,true,JSON.stringify(accepted.data))
      if(accepted.data.partnerRelationshipId)state.partnerRelationshipIds=[...new Set([...(state.partnerRelationshipIds||[]),accepted.data.partnerRelationshipId])]
      const legalLogin=await appClient.auth.setSession(attorneySession)
      if(legalLogin.error)throw legalLogin.error
      assignment=await appClient.from('transaction_attorney_assignments').select('*').eq('transaction_id',id).eq('attorney_role',attorneyRole).single()
      if(assignment.error)throw assignment.error
      record(laneKey+'_appointed_firm_accepted')
    }
    if(assignment.data.allocation_state==='awaiting_firm_acceptance')await allocation.manageAttorneyFirmAllocation({assignmentId:assignment.data.id,action:'accept'},{client:appClient})
    if(!assignment.data.attorney_user_id)await allocation.manageAttorneyFirmAllocation({assignmentId:assignment.data.id,action:'assign_primary',attorneyUserId:attorneySession.user.id},{client:appClient})
    const bankAppointment=await appClient.from('transaction_legal_role_appointments').select('id,coordination_state,evidence_document_id').eq('transaction_id',id).eq('role_type',attorneyRole).neq('coordination_state','replacement_required').single()
    if(bankAppointment.error)throw bankAppointment.error
    if(bankAppointment.data.coordination_state!=='active'){
      const confirmed=await appClient.rpc('bridge_confirm_bank_legal_instruction',{p_appointment_id:bankAppointment.data.id,p_instruction_reference:`INSTRUCTION-${laneKey}-${runId}`,p_instruction_source:'instruction_document',p_evidence_document_id:bankAppointment.data.evidence_document_id,p_evidence_confirmed:true})
      if(confirmed.error)throw confirmed.error
      const decision=await appClient.rpc('bridge_decide_bank_legal_instruction',{p_appointment_id:bankAppointment.data.id,p_decision:'accepted',p_note:'Controlled staging instruction acceptance.'})
      if(decision.error)throw decision.error
    }
    if(assignment.data.allocation_state!=='active')await allocation.manageAttorneyFirmAllocation({assignmentId:assignment.data.id,action:'activate'},{client:appClient})
    record(laneKey+'_attorney_instruction_accepted')
  }

  const savedFacts=await appClient.from('transactions').select('routing_profile_json').eq('id',id).single()
  if(savedFacts.error)throw savedFacts.error
  const tax=savedFacts.data.routing_profile_json?.transferTaxDecision||{}
  const savedScenario=savedFacts.data.routing_profile_json?.scenarioProfile||{}
  const missingShares=savedScenario.parties?.some(p=>p.ownershipShare==null||!persona.partyCapacityReviewReady(p))
  const missingQueryResponse=scenario.sarsQuery&&!tax.sarsQueryResponseReference
  if(!tax.assessmentReference||!tax.paymentReference||missingShares||missingQueryResponse){
    await api.saveTransactionRoutingProfile({transactionId:id,scenarioProfile:{...savedScenario,parties:savedScenario.parties.map(p=>({...p,ownershipShare:p.ownershipShare??100,capacityReview:{status:'cleared',note:'Controlled staging party facts and signing capacity reviewed after correction.',confirmations:Object.fromEntries(persona.partyCapacityCheckRequirements(p).map(check=>[check.key,true]))}}))},transferTaxDecision:{...tax,
      assessmentReference:`ASSESS-${runId}`,paymentReference:`DUTY-${runId}`,
      ...(missingQueryResponse?{sarsQueryResponseReference:`QUERY-RESPONSE-${runId}`}:{})},reason:'Capture the controlled staging assessment, duty payment and query response references.'})
    await lanes.reconcileAttorneyWorkflowPlanForTransaction(id,{source:'controlled_staging_facts_confirmation'})
    record('attorney_tax_and_capacity_facts_saved')
  }

  const loadDocs=async()=>{
    const result=await appClient.from('documents').select('*').eq('transaction_id',id)
    if(result.error)throw result.error
    return result.data
  }
  async function supplyAndReviewEvidence() {
    const result=await admin.from('document_requirement_instances').select('*').eq('transaction_id',id)
    if(result.error)throw result.error
    for(const r of result.data.filter(r=>r.status!=='not_applicable')) {
      let documentId=r.satisfied_by_document_id
      if(!documentId&&(r.uploadable_by_roles||[]).some(role=>['attorney','transfer_attorney','transferring_attorney','conveyancer','cancellation_attorney'].includes(role))) {
        const uploaded=await api.uploadDocument({transactionId:id,file:evidence(`attorney-${r.document_definition_key}`),
          documentType:r.document_definition_key,requiredDocumentKey:r.document_definition_key,
          canonicalRequirementInstanceId:r.id,category:'Controlled staging attorney evidence',
          source:'attorney_workspace',attorneyLaneKey:(r.uploadable_by_roles||[]).includes('cancellation_attorney')?'cancellation':'transfer'})
        documentId=uploaded.id
      }
      if(documentId&&!['approved','waived'].includes(r.status)) {
        await api.reviewCanonicalDocumentRequirement({requirementInstanceId:r.id,documentId,action:'approve',
          attorneyLaneKey:r.reviewer_role==='cancellation_attorney'?'cancellation':'transfer',notes:`Reviewed disposable staging fixture evidence ${runId}`})
      }
    }
  }
  await supplyAndReviewEvidence()
  record('canonical_evidence_reviewed')

  if(scenario.terminalOutcome){
    if(scenario.terminalOutcome==='cancelled'){
      const cancelled=await api.cancelTransactionLifecycle({transactionId:id,reason:'Synthetic withdrawn sale; no real transaction cancelled.'})
      assert.equal(cancelled.lifecycle_state,'cancelled')
      record('withdrawn_sale_cancelled')
      return verifyWithdrawnOutcome()
    }
    await assert.rejects(()=>api.markTransactionRegistered({transactionId:id,registrationDate:today,titleDeedNumber:`STAGING-${runId}`}),/specialist|classification|instrument|lifecycle|cancelled|permission|stage|registration/i)
    await assert.rejects(()=>api.markTransactionCompleted(id),/register|close|pending|cancelled|permission/i)
    const held=await appClient.from('transactions').select('registered_at,completed_at').eq('id',id).single()
    if(held.error)throw held.error
    assert.equal(held.data.registered_at,null);assert.equal(held.data.completed_at,null)
    record('terminal_route_registration_and_completion_blocked')
    return {route:scenario.key,journal,expectedTerminal:scenario.terminalOutcome,registrationVerified:false,closeoutVerified:false,terminalProtectionVerified:true}
  }

  async function ensureCanonicalRegistration(){
    const current=await appClient.from('transactions').select('registered_at').eq('id',id).single()
    if(current.error)throw current.error
    if(current.data.registered_at)return
    const checklist=await vite.ssrLoadModule('/src/services/transactionOperationalChecklistService.js')
    const synced=await checklist.syncOperationalChecklistForTransaction(id,{client:appClient})
    assert.deepEqual(synced.warnings,[],'The compatibility checklist must reconcile without errors.')
    let registrationDocument=(await loadDocs()).find(d=>d.document_type==='registration_confirmation')
    if(!registrationDocument)registrationDocument=await api.uploadDocument({transactionId:id,
      file:evidence('registration-confirmation'),documentType:'registration_confirmation',
      category:'Controlled staging attorney evidence',source:'attorney_workspace',attorneyLaneKey:'transfer'})
    await api.markTransactionRegistered({transactionId:id,registrationDate:today,
      titleDeedNumber:`STAGING-TITLE-${runId}`,registrationConfirmationDocumentId:registrationDocument.id})
    record('canonical_registration_recorded')
    await assert.rejects(()=>api.markTransactionCompleted(id),/Required close-out documents are missing|Post-registration tasks are still pending/i)
  }

  async function ensureFinancialCloseout(){
    const closeout=await api.fetchTransactionAttorneyCloseout(id)
    if(closeout.closeOutStatus==='closed'||closeout.close_out_status==='closed'){
      if(!scenario.nonResidentSeller||state.withholdingSimulatedPaid)return
      // Resume a disposable case that exposed the former financial-gate bypass.
      await api.saveTransactionAttorneyCloseout(id,{closeOutStatus:'in_progress'})
    }
    for(const doc of closeout.documents||[])if((doc.isRequired||doc.is_required)&&doc.status!=='uploaded'){
    await api.uploadTransactionAttorneyCloseoutDocument({transactionId:id,closeoutId:closeout.id||closeout.closeoutId,file:evidence(`closeout-${doc.key||doc.documentTypeKey||doc.document_type_key}`),
      documentTypeKey:doc.key||doc.documentTypeKey||doc.document_type_key,label:doc.label})
  }
    const closeoutInput={budgetedAmount:15000,actualBilledAmount:15000,
      invoiceReference:`STAGING-INVOICE-${runId}`,invoiceDate:today,statementDate:today,
      notes:'Controlled staging close-out only; no live invoice or payment.',markClosed:true}
    if(scenario.nonResidentSeller&&!state.withholdingSimulatedPaid){
      await assert.rejects(()=>api.saveTransactionAttorneyCloseout(id,closeoutInput),error=>/withholding remittance payment proof/i.test(error?.message||String(error)))
      assert.notEqual((await api.fetchTransactionAttorneyCloseout(id)).closeOutStatus,'closed')
      record('nonresident_closeout_without_remittance_blocked')
      const saved=await appClient.from('transactions').select('routing_profile_json').eq('id',id).single()
      if(saved.error)throw saved.error
      const decision=saved.data.routing_profile_json.transferTaxDecision
      await api.saveTransactionRoutingProfile({transactionId:id,transferTaxDecision:{...decision,
        nonResidentSellers:{...decision.nonResidentSellers,'seller-primary':{...decision.nonResidentSellers['seller-primary'],remittanceStatus:'paid',paymentReference:`STAGING-NO-PAYMENT-${runId}`}}},reason:'Record simulated staging remittance proof; no real payment.'})
      state.withholdingSimulatedPaid=true
      await supplyAndReviewEvidence()
      record('nonresident_remittance_simulated')
    }
    await api.saveTransactionAttorneyCloseout(id,closeoutInput)
    record('attorney_financial_closeout_closed')
  }

  function confirmations(model) {
    return Object.fromEntries(model.confirmationRows.map(row=>{
      const response={answer:'yes',note:`Controlled staging review ${runId}`}
      if(row.id==='agreement_conditions_review')return [row.id,{answer:'not_applicable',note:'Controlled cash fixture has no outstanding agreement conditions.',items:[]}]
      if(row.register){
        response.items=[Object.fromEntries(row.register.fields.map(field=>{
          const options=(field.options||[]).map(o=>typeof o==='string'?o:o.value)
          let value=field.type==='date'?(/valid|expir|deadline|due|follow/i.test(field.key)?future:today):
            field.type==='number'?(/outstanding|balance|shortfall/i.test(field.key)?'0':'2190000'):
            field.type==='select'?(['both','portal','fulfilled','resolved','low','cleared','yes'].find(v=>options.includes(v))||options[0]):
            `STAGING-${field.key}-${runId}`
          return [field.key,String(value)]
        }))]
      }
      return [row.id,response]
    }))
  }
  let iterations=0
  let cachedOperations=null
  async function readCurrentOperations(){
    // Facts and assignments stay fixed during this test's legal-task loop.
    // Keep normal full-workspace reads periodically, but avoid reloading its
    // entire history/notification feed after every command on the Nano DB.
    // Every save still uses the real service's fresh permission and RPC gates.
    if(!cachedOperations||iterations%5===0){
      cachedOperations=await lanes.getAttorneyWorkflowOperationsForTransaction(id,{initialize:!cachedOperations})
      return cachedOperations
    }
    const laneIds=cachedOperations.lanes.map(l=>l.id)
    const reads=await Promise.all([
      appClient.from('transaction_subprocess_steps').select('id,status,completed_at,comment,updated_at').in('subprocess_id',laneIds),
      appClient.from('attorney_task_confirmations').select('step_id,task_confirmations').in('subprocess_id',laneIds),
      appClient.from('transactions').select('id,routing_profile_json,registered_at,lifecycle_state,current_main_stage,stage').eq('id',id).single(),
    ])
    for(const result of reads)if(result.error)throw result.error
    const byId=new Map(reads[0].data.map(s=>[s.id,s])),answers=new Map(reads[1].data.map(s=>[s.step_id,s.task_confirmations]))
    cachedOperations={...cachedOperations,transaction:{...cachedOperations.transaction,...reads[2].data},
      lanes:cachedOperations.lanes.map(l=>({...l,steps:l.steps.map(step=>{
        const saved=byId.get(step.id)
        assert.ok(saved,'A planned task disappeared from the normal attorney read scope')
        return {...step,status:saved.status,completedAt:saved.completed_at,comment:saved.comment,updatedAt:saved.updated_at,taskConfirmations:answers.get(step.id)}
      })}))}
    return cachedOperations
  }
  const completedTasks=new Set()
  while(iterations++<250) {
    const operations=await readCurrentOperations()
    const requiredLanes=operations.workflowPlan.laneKeys
    let advanced=false
    const blocked=[]
    for(const laneKey of ['bond','cancellation','transfer'].filter(k=>requiredLanes.includes(k))){
    const lane=operations.lanes.find(l=>l.laneKey===laneKey)
    assert.ok(lane?.permissions?.canUpdateStage,'Accepted attorney cannot edit the transfer lane.')
    const docs=await loadDocs()
    const planned=new Set(planService.getMatterWorkflowPlanStepKeys(operations.workflowPlan,laneKey))
    const scenarioParties=operations.transaction.routing_profile_json?.scenarioProfile?.parties||[]
    const unrecordedFica=lane.steps.find(step=>['buyer_fica_review','seller_fica_review'].includes(step.stepKey)&&
      step.status==='completed'&&scenarioParties.filter(p=>step.stepKey.startsWith(p.role+'_')).some(p=>
        step.taskConfirmations?.[`rmcp_review:${p.id}`]?.answer!=='yes'))
    const unfinished=unrecordedFica||lane.steps.find(s=>(!planned.size||planned.has(s.stepKey||s.key||s.step_key))&&!['completed','completed_externally','not_applicable'].includes(s.status))
    if(!unfinished)continue
    const taskKey=unfinished.stepKey||unfinished.key||unfinished.step_key
    if(['post_registration_closeout_review','matter_closed'].includes(taskKey))await ensureCanonicalRegistration()
    if(taskKey==='post_registration_closeout_review'&&scenario.nonResidentSeller&&!state.withholdingSimulatedPaid)await ensureFinancialCloseout()
    if(taskKey==='matter_closed')await ensureFinancialCloseout()
    const view=presenter.buildTransferWorkspaceViewModel({workflow:{...operations,lane},workflowKey:laneKey,
      workflowLanes:operations.lanes,routingProfile:operations.transaction.routing_profile_json,
      documents:docs,requiredDocuments:operations.requiredDocuments||[],selectedTaskKey:taskKey})
    const task=view.selectedTask
    assert.equal(task.key,taskKey)
    for(const key of task.requiredDocumentKeys||task.requiredDocuments||[]) {
      if(docs.some(d=>d.document_type===key))continue
      await api.uploadDocument({transactionId:id,file:evidence(`attorney-${key}`),documentType:key,
        category:'Controlled staging attorney evidence',source:'attorney_workspace',attorneyLaneKey:laneKey})
    }
    await supplyAndReviewEvidence()
    const form=workbench.buildLegalTaskWorkbenchModel({task,taskContext:view.selectedTaskContext,
      workActions:view.workActions||[],workflowTasks:view.tasks,forceEditable:true,canUpdateTask:true})
    const packet={laneKey,stageKey:taskKey,taskConfirmations:confirmations(form)}
    // Answers are saved independently, exactly as the workbench does before completion.
    if(iterations===1)await lanes.updateAttorneyWorkflowStepStatus({transactionId:id,laneKey,stepId:unfinished.id,
      stepKey:taskKey,status:'in_progress',note:`Controlled staging review ${runId}`,
      visibility:'internal',workPacket:packet})
    try{await lanes.updateAttorneyWorkflowStepStatus({transactionId:id,laneKey,stepId:unfinished.id,
      stepKey:taskKey,status:'completed',note:`Controlled staging milestone ${runId}`,
      visibility:task.defaultVisibility||'professional_shared',workPacket:packet})
    }catch(error){
      if(/prerequisite|before|waiting|lodg|not ready|complete|required|confirm|outstanding|guarantee/i.test(error.message||'')){blocked.push({laneKey,taskKey,message:error.message});continue}
      throw error
    }
    completedTasks.add(laneKey+':'+taskKey)
    advanced=true
    record(`attorney_task:${laneKey}:${taskKey}`)
    if(taskKey==='registered') {
      await ensureCanonicalRegistration()
      record('registration_does_not_bypass_closeout')
    }
    }
    if(!advanced){assert.deepEqual(blocked,[],'Legal lanes did not converge: '+JSON.stringify(blocked));break}
  }
  assert.ok(iterations<250,'Legal workflows did not converge.')
  const registrationState=await appClient.from('transactions').select('stage,current_main_stage,lifecycle_state,registered_at').eq('id',id).single()
  if(registrationState.error)throw registrationState.error
  assert.ok(registrationState.data.registered_at,'Attorney registration did not reach canonical transaction state.')
  await ensureFinancialCloseout()
  const postRegistration=await appClient.from('transaction_checklist_items').select('id,label,status,priority').eq('transaction_id',id).eq('stage','registered')
  if(postRegistration.error)throw postRegistration.error
  for(const item of postRegistration.data.filter(r=>r.priority==='required'&&r.status!=='completed')){
    await api.updateTransactionChecklistItem({checklistItemId:item.id,status:'completed'})
  }
  // Finance approvals use a real organisation owner session, never a service-role write.
  const transaction=await admin.from('transactions').select('organisation_id').eq('id',id).single()
  if(transaction.error)throw transaction.error
  const organisationId=transaction.data.organisation_id
  const financeEmail=`finance.${runId}@example.test`
  let financeActor=await admin.from('profiles').select('id').eq('email',financeEmail).maybeSingle()
  if(financeActor.error)throw financeActor.error
  if(!financeActor.data&&state.fixtureFinanceUserIds?.length){
    const prior=await admin.auth.admin.getUserById(state.fixtureFinanceUserIds.at(-1))
    if(prior.error)throw prior.error
    assert.equal(prior.data.user.email,financeEmail)
    financeActor={data:{id:prior.data.user.id}}
  }
  if(!financeActor.data){
    const made=await admin.auth.admin.createUser({email:financeEmail,email_confirm:true,user_metadata:{full_name:'Controlled staging finance reviewer'}})
    if(made.error)throw made.error
    state.fixtureFinanceUserIds=[...(state.fixtureFinanceUserIds||[]),made.data.user.id]
    progress('fixture_finance_actor_created')
    financeActor={data:{id:made.data.user.id}}
  }
  const profile=await admin.from('profiles').upsert({id:financeActor.data.id,email:financeEmail,full_name:'Controlled staging finance reviewer',role:'developer'})
  if(profile.error)throw profile.error
  const membership=await admin.from('organisation_users').upsert({user_id:financeActor.data.id,email:financeEmail,organisation_id:organisationId,app_role:'developer',workspace_role:'owner',role:'owner',status:'active',membership_status:'active'},{onConflict:'organisation_id,email'})
  if(membership.error)throw membership.error
  const link=await admin.auth.admin.generateLink({type:'magiclink',email:financeEmail})
  if(link.error)throw link.error
  const finance=await appClient.auth.verifyOtp({type:'magiclink',token_hash:link.data.properties.hashed_token})
  if(finance.error)throw finance.error
  state.fixtureAuthSessions=[...(state.fixtureAuthSessions||[]),finance.data.session.access_token]
  const name=`STAGING-CLOSEOUT-${runId}`
  let structure=await appClient.from('commission_structures').select('id').eq('name',name).eq('organisation_id',organisationId).maybeSingle()
  if(structure.error)throw structure.error
  if(!structure.data){
    structure=await appClient.from('commission_structures').insert({organisation_id:organisationId,name,is_default:false,status:'draft',metadata:{fixtureTransactionId:id,source:'controlled_staging_closeout'}}).select('id').single()
    if(structure.error)throw structure.error
    state.commissionStructureIds=[...(state.commissionStructureIds||[]),structure.data.id]
    progress('fixture_commission_structure_created')
    const rules=await appClient.from('commission_structure_rules').insert([
      {commission_structure_id:structure.data.id,allocation_type:'selling_commission',participant_role:'selling_agent',scope:'internal',calculation_basis:'gross_commission',percentage:60},
      {commission_structure_id:structure.data.id,allocation_type:'agency_share',participant_role:'agency',scope:'agency',calculation_basis:'gross_commission',percentage:40}])
    if(rules.error)throw rules.error
    const activate=await appClient.rpc('bridge_activate_commission_structure',{p_commission_structure_id:structure.data.id,p_make_default:false})
    if(activate.error)throw activate.error
    assert.equal(activate.data.success,true,JSON.stringify(activate.data))
  }
  const snapshot=await appClient.rpc('bridge_upsert_transaction_commission_snapshot',{p_transaction_id:id,p_commission_structure_id:structure.data.id,p_sale_price:2190000,p_gross_commission_percentage:5,p_gross_commission_amount:109500,p_agent_split_percentage_snapshot:60,p_agency_split_percentage_snapshot:40,p_agent_commission_amount:65700,p_agency_commission_amount:43800})
  if(snapshot.error)throw snapshot.error
  const apply=await appClient.rpc('bridge_apply_transaction_conversion_commission_hook',{p_transaction_id:id})
  if(apply.error)throw apply.error
  assert.equal(apply.data.success,true,JSON.stringify(apply.data))
  const allocations=await appClient.from('transaction_commission_allocations').select('id,status,calculated_amount').eq('transaction_id',id).neq('status','cancelled')
  if(allocations.error)throw allocations.error
  assert.ok(allocations.data.length>=2)
  for(const allocation of allocations.data.filter(a=>!['paid','waived'].includes(a.status))){
    for(const action of ['approve','mark_paid']){
      const decision=await appClient.rpc('bridge_review_commission_allocation',{p_allocation_id:allocation.id,p_action:action,p_approved_amount:allocation.calculated_amount,p_reason:'Simulated staging finance approval only; no actual payment.',p_payment_reference:`STAGING-NO-PAYMENT-${runId}`})
      if(decision.error)throw decision.error
      assert.equal(decision.data.success,true,JSON.stringify(decision.data))
    }
  }
  record('finance_allocations_approved_and_simulated_paid')
  if(financeType!=='cash'){
    assert.ok(state.bondOriginatorSession,'A real assigned-originator session is required for commission closeout.')
    const originatorLogin=await appClient.auth.setSession(state.bondOriginatorSession)
    if(originatorLogin.error)throw originatorLogin.error
    const bondCloseout=await api.fetchTransactionBondCloseout(id)
    assert.ok(bondCloseout?.id,'The registered bond route must expose its originator closeout.')
    if(bondCloseout.closeOutStatus!=='closed'){
      for(const document of bondCloseout.documents.filter(d=>(d.isRequired||d.is_required)&&d.status!=='uploaded'))await api.uploadTransactionBondCloseoutDocument({transactionId:id,closeoutId:bondCloseout.id||bondCloseout.closeoutId,file:evidence(`bond-closeout-${document.key||document.documentTypeKey||document.document_type_key}`),documentTypeKey:document.key||document.documentTypeKey||document.document_type_key,label:document.label})
      await api.saveTransactionBondCloseout(id,{budgetedAmount:5000,actualPaidAmount:5000,payoutReference:`STAGING-NO-PAYMENT-${runId}`,payoutDate:today,statementDate:today,notes:'Simulated staging commission reconciliation; no actual payment.',markClosed:true})
    }
    assert.equal((await api.fetchTransactionBondCloseout(id)).closeOutStatus,'closed')
    record('bond_originator_financial_closeout_closed')
  }
  const restored=await appClient.auth.setSession(attorneySession)
  if(restored.error)throw restored.error
  await api.markTransactionCompleted(id)
  const completed=await appClient.from('transactions').select('lifecycle_state,completed_at,registered_at').eq('id',id).single()
  if(completed.error)throw completed.error
  assert.equal(completed.data.lifecycle_state,'completed')
  assert.ok(completed.data.completed_at&&completed.data.registered_at)
  record('transaction_registered_and_closed')
  if(scenario.key==='private_cash'){
    // Archive intentionally retires external partners. A current organisation
    // owner restores the record without reviving any retired grants.
    const ownerLogin=await appClient.auth.setSession(finance.data.session)
    if(ownerLogin.error)throw ownerLogin.error
    await assert.rejects(()=>api.unarchiveTransactionLifecycle(id),/not archived/i)
    await api.archiveTransactionLifecycle({transactionId:id,reason:'Controlled staging archive after completed closeout.'})
    const archived=await appClient.from('transactions').select('lifecycle_state,registered_at,completed_at,archived_at').eq('id',id).single()
    if(archived.error)throw archived.error
    assert.equal(archived.data.lifecycle_state,'archived');assert.ok(archived.data.archived_at)
    assert.equal(archived.data.registered_at,completed.data.registered_at)
    assert.equal(archived.data.completed_at,completed.data.completed_at)
    record('completed_matter_archived_without_losing_registration')
    await api.unarchiveTransactionLifecycle(id)
    const reopened=await appClient.from('transactions').select('lifecycle_state,registered_at,completed_at,archived_at').eq('id',id).single()
    if(reopened.error)throw reopened.error
    assert.equal(reopened.data.lifecycle_state,'completed');assert.equal(reopened.data.archived_at,null)
    assert.equal(reopened.data.registered_at,completed.data.registered_at)
    assert.equal(reopened.data.completed_at,completed.data.completed_at)
    record('archive_restored_to_completed_without_losing_evidence')
  }
  await assert.rejects(()=>api.cancelTransactionLifecycle({transactionId:id,reason:'Synthetic invalid post-registration cancellation'}),/Undo registration|reopen/)
  const invalidCancellation=await appClient.from('transactions').update({lifecycle_state:'cancelled',cancelled_reason:'Synthetic prohibited cancellation',cancelled_at:new Date().toISOString()}).eq('id',id).select('id')
  assert.ok(invalidCancellation.error?.code==='23514'||invalidCancellation.data?.length===0,'Direct writes must also preserve the registered sale.')
  const preserved=await appClient.from('transactions').select('lifecycle_state,registered_at,completed_at').eq('id',id).single()
  if(preserved.error)throw preserved.error
  assert.equal(preserved.data.lifecycle_state,'completed')
  assert.equal(preserved.data.registered_at,completed.data.registered_at)
  assert.equal(preserved.data.completed_at,completed.data.completed_at)
  record('registered_sale_cancellation_blocked')
  return {route:scenario.key||'cash_private_sale',journal,completedTaskCount:completedTasks.size,registrationVerified:true,closeoutVerified:true}
}
