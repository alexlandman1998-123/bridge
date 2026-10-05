import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRentalChecklistIssues, describeRentalPortalRequirement, getRentalPortalReadiness } from '../rentalListingReadinessPresentation.js'
test('explains exactly which local fields are missing and uses their editor steps', () => {
 const issues=buildRentalChecklistIssues({row:{address:'1 Main Road',landlordName:'Owner'},readinessItems:[{key:'property',complete:false},{key:'landlord',complete:false},{key:'marketing',complete:false,detail:'Awaiting approval'},{key:'syndication',complete:false}]})
 assert.deepEqual(issues[0].missing.map(item=>item.label),['Monthly rent','Available from'])
 assert.deepEqual(issues[0].missing.map(item=>item.action.step),['terms','terms'])
 assert.equal(issues[1].missing[0].label,'Landlord phone or email')
 assert.equal(issues[2].action.step,'landlord'); assert.match(issues[3].detail,/publication step, not a missing listing field/)
})
test('separates portal mapping, data and photo preparation issues with targeted fixes',()=>{
 assert.equal(describeRentalPortalRequirement('missing_property24_agent_id','property24').action.path,'/settings/syndication/property24')
 assert.equal(describeRentalPortalRequirement('missing_private_property_branch_guid','private_property').category,'Portal setup')
 assert.equal(describeRentalPortalRequirement('missing_expiry_date','property24').action.kind,'expiry')
 assert.equal(describeRentalPortalRequirement('missing_rental_monthly_rent','private_property').action.step,'terms')
 assert.equal(describeRentalPortalRequirement('minimum_three_listing_image_urls_required','private_property').action.step,'marketing')
 assert.equal(describeRentalPortalRequirement('private_property_activated_address_changed','private_property').action.kind,'settings')
})
test('extracts and deduplicates Private Property requirements from readiness and checks',()=>{
 const result=getRentalPortalReadiness('private_property',{ready:false,readiness:{ready:false,blockers:['missing_description'],checks:[{blockers:['missing_description','missing_private_property_agent_id']}],preview:{dataBlockers:['missing_description']}}})
 assert.equal(result.ready,false); assert.equal(result.state,'Needs attention'); assert.equal(result.issues.length,2)
})
test('does not treat warnings as blockers or infer readiness from a complete local checklist',()=>{
 const result=getRentalPortalReadiness('property24',{report:{preview:{canSubmit:true,qualityWarnings:['missing_marketing_title'],dataBlockers:[],technicalBlockers:[]}}})
 assert.equal(result.ready,true); assert.equal(result.warnings.length,1)
 assert.equal(getRentalPortalReadiness('private_property',null).state,'Not checked')
 assert.equal(getRentalPortalReadiness('private_property',{}).state,'Readiness not confirmed')
})
test('fails closed on contradictory readiness, failed photo bytes and request errors',()=>{
 assert.equal(getRentalPortalReadiness('property24',{report:{preview:{canSubmit:true,dataBlockers:['missing_description']}}}).ready,false)
 const result=getRentalPortalReadiness('property24',{report:{preview:{canSubmit:true,imageByteLoad:{summary:{loaded:2,failed:1}}}}})
 assert.equal(result.ready,false); assert.equal(result.imagesLoaded,2); assert.equal(result.issues[0].category,'Photos')
 assert.equal(getRentalPortalReadiness('private_property',{ready:true,readiness:{ready:false}}).ready,false)
 assert.equal(getRentalPortalReadiness('private_property',{ready:true},{error:'Connection failed'}).state,'Check failed')
})
test('retains unknown and structured portal requirements without inventing an editor target',()=>{
 const issue=describeRentalPortalRequirement({code:'unexpected_portal_rule',message:'Portal requires manual account review'},'private_property')
 assert.equal(issue.label,'Portal requires manual account review'); assert.equal(issue.action,null)
})
test('opens actual basic and feature controls for field-specific requirements',()=>{
 assert.equal(describeRentalPortalRequirement('missing_bedrooms_attribute','private_property').action.step,'property')
 assert.equal(describeRentalPortalRequirement('missing_pets_allowed_value','property24').action.step,'features')
 const invalid=describeRentalPortalRequirement('invalid_rental_field:propertyFeatures.bedrooms','property24')
 assert.equal(invalid.label,'Enter a valid bedrooms'); assert.equal(invalid.action.step,'property')
 assert.equal(describeRentalPortalRequirement('invalid_rental_field:unknown_field','property24').action,null)
})
