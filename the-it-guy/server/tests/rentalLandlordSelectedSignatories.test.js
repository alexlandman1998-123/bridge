import {rentalLandlordDiscovery} from '../../src/services/rentals/rentalLandlordOnboardingModel.js'
import {beforeAll,afterAll,expect,it} from 'vitest'
import {rentalLandlordProfileDatabase,seedRentalLandlordProfile,org,actor} from './fixtures/rentalLandlordProfileDatabase.js'
import {selectLandlordSignatory,updateLandlordPeople} from '../../src/services/rentals/rentalLandlordSignatories.js'
import {landlordProfileErrors} from '../../src/services/rentals/rentalLandlordProfileRules.js'
import {rentalLandlordRequirementDefinitions} from '../../src/services/rentals/rentalOnboardingRequirementModel.js'
let db
beforeAll(async()=>{db=await rentalLandlordProfileDatabase({selectedSignatories:true})},30000)
afterAll(async()=>{await db?.close()})
const person={id:'signer',name:'Director',role:'Director',idNumber:'PASSPORT',nationality:'South African',email:'director@example.test',phone:'0821234567',residentialAddress:'One Road',signingAuthority:false}
const profile={type:'company',name:'Company',email:'company@example.test',registrationNumber:'REG',residentialAddress:'Registered Road',authorityBasis:'RES',people:[person]}
const selected=selectLandlordSignatory(profile,person.id)
const scenarios=[profile,selected,{...selected,primarySignatoryId:'missing'},{...selected,people:[{...selected.people[0],signingAuthority:false}]},{...selected,authorisedSignatoryName:'Stale name'},updateLandlordPeople(selected,[{...selected.people[0],name:'Updated signer',capacity:'Authorised representative'}]),selectLandlordSignatory(selected,''),{...selected,type:'individual',hasRepresentative:'no',primarySignatoryId:'unavailable'},selectLandlordSignatory({...profile,type:'foreign_owner',legalStructure:'company',country:'Canada'},person.id)]
it.each(scenarios.map((p,index)=>[index,p]))('keeps browser and database person-reference validation identical (%s)',async(_,p)=>{
 for(const phase of ['draft','submission']) expect((await db.query('select rental_private.landlord_profile_errors($1,$2) errors',[JSON.stringify(p),phase])).rows[0].errors).toEqual(landlordProfileErrors(p,{phase}))
})
const canonical=rows=>rows.map(row=>({subject:row.subjectId??row.subject_id,scope:row.scopeKey??row.scope_key,purpose:row.purpose,required:row.required,fingerprint:row.fingerprint})).sort((a,b)=>JSON.stringify([a.subject,a.scope,a.purpose]).localeCompare(JSON.stringify([b.subject,b.scope,b.purpose])))
it.each([profile,selected,scenarios[8]])('keeps legacy and selected-signatory evidence definitions identical to SQL',async p=>{
 const data={profile:p,portfolio:[{id:'property',address:'Road'}]}
 expect(canonical((await db.query('select * from rental_private.landlord_definitions($1)',[JSON.stringify(data)])).rows)).toEqual(canonical(rentalLandlordRequirementDefinitions(data)))
})
it('saves and reopens the exact person reference and refuses a stale copy before any writes',async()=>{
 const seed=await seedRentalLandlordProfile(db)
 const savedProfile=selectLandlordSignatory({...seed.profile,people:[person]},person.id)
 const command=async(p,version)=>(await db.query("select rental_landlord_onboarding_command($1,$2,'save',$3,$4,'agent',$5) result",[seed.id,version,JSON.stringify({profile:p}),JSON.stringify({organisation_id:org}),actor])).rows[0].result
 const result=await command(savedProfile,seed.snapshot.version)
 const snapshot=(await db.query('select rental_landlord_onboarding_snapshot($1,$2) value',[seed.id,JSON.stringify({organisation_id:org})])).rows[0].value
 expect(rentalLandlordDiscovery(snapshot.payload).profile).toMatchObject({primarySignatoryId:person.id,authorisedSignatoryName:person.name,authorisedSignatoryEmail:person.email})
 const after=(await db.query('select * from rental_landlord_onboarding where lead_id=$1',[seed.id])).rows[0]
 await expect(command({...savedProfile,people:[{...savedProfile.people[0],name:'Changed elsewhere'}]},result.version)).rejects.toThrow('selected signatory’s details changed')
 expect((await db.query('select * from rental_landlord_onboarding where lead_id=$1',[seed.id])).rows[0]).toEqual(after)
 expect((await db.query('select name from agency_client_profiles where id=$1',[seed.client.id])).rows[0].name).toBe(seed.profile.name)
 const updated=updateLandlordPeople(savedProfile,[{...savedProfile.people[0],name:'Updated signer'}])
 await command(updated,result.version)
 const reopened=(await db.query('select rental_landlord_onboarding_snapshot($1,$2) value',[seed.id,JSON.stringify({organisation_id:org})])).rows[0].value
 expect(rentalLandlordDiscovery(reopened.payload).profile.authorisedSignatoryName).toBe('Updated signer')
})
it('keeps the new private helpers inaccessible to application roles',async()=>{
 const actual=(await db.query("select has_function_privilege('authenticated','rental_private.landlord_profile_errors(jsonb,text)','execute') allowed,has_function_privilege('service_role','rental_private.landlord_profile_errors_before_selected_signatories(jsonb,text)','execute') bypass")).rows[0]
 expect(actual).toEqual({allowed:false,bypass:false})
})
