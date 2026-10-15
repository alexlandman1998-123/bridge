// @vitest-environment jsdom
import {useState} from 'react'
import {afterEach,expect,it} from 'vitest'
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react'
import Editor from '../../../modules/rentals/shared/applications/RentalLandlordProfileEditor.jsx'
afterEach(cleanup)
const person={id:'director',name:'Director One',role:'Director',idNumber:'ID',email:'director@example.test',residentialAddress:'Road',signingAuthority:false}
const profile={type:'company',name:'Company',email:'owner@example.test',residentialAddress:'Registered Road',registrationNumber:'REG',authorityBasis:'Resolution',people:[person]}
function Form({initial=profile,disabled=false,submitted=false}) {
 const [value,setValue]=useState(initial)
 return <><Editor profile={value} portfolio={[{address:'Property Road'}]} onChange={setValue} disabled={disabled} submitted={submitted} saveState="saved"/><output aria-label="Captured profile">{JSON.stringify(value)}</output></>
}
const captured=()=>JSON.parse(screen.getByLabelText('Captured profile').textContent)
const open=title=>fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${title}`)}))
it('starts with compact grouped sections and exposes person details only when requested',()=>{
 render(<Form/>);expect(screen.getByLabelText('Full name / entity name')).toBeTruthy()
 expect(screen.queryByRole('textbox',{name:'Person 1 Full name'})).toBeNull()
 open('Owners & representatives');expect(screen.getByRole('button',{name:'Edit person 1: Director One'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Edit person 1: Director One'}))
 expect(screen.getByRole('textbox',{name:'Person 1 Full name'}).value).toBe('Director One')
 fireEvent.click(screen.getByRole('button',{name:'Close person 1: Director One'}))
 expect(screen.queryByRole('textbox',{name:'Person 1 Full name'})).toBeNull()
})
it('selects a captured signatory, then keeps later person edits aligned without duplicate fields',()=>{
 render(<Form/>);open('Signatories & authority')
 fireEvent.change(screen.getByLabelText('Primary signatory'),{target:{value:'director'}})
 expect(captured()).toMatchObject({primarySignatoryId:'director',authorisedSignatoryName:'Director One',authorisedSignatoryEmail:'director@example.test',people:[{signingAuthority:true}]})
 expect(screen.queryByLabelText('Signatory email')).toBeNull()
 expect(screen.getByText('Details ready for submission')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Edit selected person'}))
 fireEvent.change(screen.getByRole('textbox',{name:'Person 1 Full name'}),{target:{value:'Renamed Director'}})
 fireEvent.change(screen.getByRole('textbox',{name:'Person 1 Email'}),{target:{value:'renamed@example.test'}})
 expect(captured()).toMatchObject({primarySignatoryId:'director',authorisedSignatoryName:'Renamed Director',authorisedSignatoryEmail:'renamed@example.test'})
})
it('clears a deleted primary person and reports the missing signing details',()=>{
 render(<Form/>);open('Signatories & authority');fireEvent.change(screen.getByLabelText('Primary signatory'),{target:{value:'director'}})
 open('Owners & representatives');fireEvent.click(screen.getByRole('button',{name:'Remove person 1'}))
 expect(captured()).toMatchObject({primarySignatoryId:'',authorisedSignatoryName:'',people:[]})
 expect(screen.getByText('Draft — complete the highlighted sections before submitting')).toBeTruthy()
 expect(screen.getByLabelText('Signatory email').value).toBe('')
})
it('opens a new draft person immediately and retains its reference when sections are toggled',()=>{
 render(<Form/>);open('Owners & representatives');fireEvent.click(screen.getByRole('button',{name:'Add person'}))
 const id=captured().people[1].id
 fireEvent.change(screen.getByRole('textbox',{name:'Person 2 Full name'}),{target:{value:'New person'}})
 open('Owners & representatives');open('Owners & representatives')
 expect(screen.getByRole('textbox',{name:'Person 2 Full name'}).value).toBe('New person')
 expect(captured().people[1].id).toBe(id)
})
it('keeps read-only submitted sections browsable while all editing controls stay disabled',()=>{
 render(<Form disabled submitted/>);expect(screen.getByText('Submitted for review')).toBeTruthy()
 open('Owners & representatives');fireEvent.click(screen.getByRole('button',{name:'View person 1: Director One'}))
 expect(screen.getByRole('textbox',{name:'Person 1 Full name'}).disabled).toBe(true)
 expect(screen.getByRole('button',{name:'Add person'}).disabled).toBe(true)
 open('Entity details');expect(within(screen.getByRole('region',{name:'Entity details'})).getByLabelText('Company / trust registration number').disabled).toBe(true)
})
