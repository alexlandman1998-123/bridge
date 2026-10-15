import { expect, it } from 'vitest'
import { selectLandlordSignatory, updateLandlordPeople } from '../rentalLandlordSignatories.js'
import { landlordProfileCompletion, landlordPersonComplete } from '../rentalLandlordProfileLayout.js'
import { landlordProfileErrors } from '../rentalLandlordProfileRules.js'
import { normalizeLandlordProfile } from '../rentalLandlordWorkspaceModel.js'
import { publicRentalLandlordDiscovery, mergeRentalLandlordDiscovery } from '../rentalLandlordOnboardingModel.js'
const person={id:'director-1',name:'Director One',role:'Director',idNumber:'PASSPORT',email:'director@example.test',residentialAddress:'One Road',signingAuthority:false,notes:'Private person notes'}
const profile={type:'company',name:'Company',email:'owner@example.test',residentialAddress:'Registered Road',registrationNumber:'REG',authorityBasis:'Resolution',people:[person],notes:'Private notes'}
it('uses a stable person reference, copies signing details atomically and preserves private answers',()=>{
 const selected=selectLandlordSignatory(profile,person.id)
 expect(selected).toMatchObject({primarySignatoryId:person.id,authorisedSignatoryName:person.name,authorisedSignatoryCapacity:person.role,authorisedSignatoryIdNumber:person.idNumber,authorisedSignatoryEmail:person.email,notes:'Private notes',people:[{notes:'Private person notes',signingAuthority:true}]})
 expect(landlordProfileErrors(selected,{phase:'submission'})).toEqual([])
 expect(normalizeLandlordProfile(selected).primarySignatoryId).toBe(person.id)
})
it('keeps the selected person’s details aligned during edits and safely detaches removal or revoked authority',()=>{
 const selected=selectLandlordSignatory(profile,person.id)
 const edited=updateLandlordPeople(selected,[{...selected.people[0],name:'New Director',email:'new@example.test',role:'Trustee',idNumber:'NEW-ID'}])
 expect(edited).toMatchObject({primarySignatoryId:person.id,authorisedSignatoryName:'New Director',authorisedSignatoryEmail:'new@example.test',authorisedSignatoryCapacity:'Trustee',authorisedSignatoryIdNumber:'NEW-ID'})
 for(const people of [[],[{...edited.people[0],signingAuthority:false}]]) {
  const detached=updateLandlordPeople(edited,people)
  expect(detached.primarySignatoryId).toBe('');expect(detached.authorisedSignatoryName).toBe('')
  expect(detached.authorityBasis).toBe('Resolution')
 }
})
it('retains legacy manual signing details and round trips a selected person through the invited form',()=>{
 const selected=selectLandlordSignatory(profile,person.id)
 const manual=selectLandlordSignatory(selected,'')
 expect(manual.authorisedSignatoryName).toBe(person.name)
 const current={profile:selected,portfolio:[]}, projected=publicRentalLandlordDiscovery(current)
 expect(projected.profile.primarySignatoryId).toBe(person.id)
 const reopened=mergeRentalLandlordDiscovery(current,projected,{publicSource:true})
 expect(reopened.profile).toMatchObject({primarySignatoryId:person.id,notes:'Private notes',people:[{notes:'Private person notes'}]})
})
it('blocks stale or missing person references without affecting unlinked legacy signatories',()=>{
 const selected=selectLandlordSignatory(profile,person.id)
 expect(landlordProfileErrors({...selected,primarySignatoryId:'missing'})).toContain('Choose a current authorised person as the primary signatory, or enter separate signatory details.')
 expect(landlordProfileErrors({...selected,people:[{...selected.people[0],name:'Changed elsewhere'}]})).toContain('The selected signatory’s details changed. Reselect the person before saving.')
 expect(landlordProfileErrors({...selected,primarySignatoryId:''})).toEqual([])
})
it('separates submission completeness from optional answers and property readiness',()=>{
 const selected=selectLandlordSignatory(profile,person.id)
 const complete=landlordProfileCompletion(selected,{portfolio:[{address:'Property Road'}]})
 expect(complete.complete).toBe(true)
 expect(complete.sections.find(section=>section.id==='tax').status).toBe('optional')
 expect(complete.sections.find(section=>section.id==='notes').title).toBe('Internal notes')
 const incomplete=landlordProfileCompletion({...selected,registrationNumber:''},{portfolio:[{address:'Road'}]})
 expect(incomplete.sections.find(section=>section.id==='entity').status).toBe('incomplete')
 expect(landlordProfileCompletion(selected,{portfolio:[]}).profileComplete).toBe(true)
 expect(landlordProfileCompletion(selected,{portfolio:[]}).complete).toBe(false)
 expect(landlordProfileCompletion(selected,{publicSource:true}).sections.some(section=>section.id==='notes')).toBe(false)
})
it('counts each person’s required details while ignoring inapplicable ownership shares',()=>{
 expect(landlordPersonComplete(profile,person)).toBe(true)
 expect(landlordPersonComplete(profile,{...person,idNumber:''})).toBe(false)
 expect(landlordPersonComplete({...profile,type:'multiple_owners'},person)).toBe(false)
 expect(landlordPersonComplete({...profile,type:'multiple_owners'},{...person,ownershipShare:'0'})).toBe(true)
 expect(landlordPersonComplete({...profile,type:'trust'},{...person,ownershipShare:'irrelevant'})).toBe(true)
})
