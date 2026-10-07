// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RentalApplicationDocuments from '../../../modules/rentals/shared/applications/RentalApplicationDocuments.jsx'
import RentalApplicationDocumentReviewPanel from '../../../modules/rentals/shared/applications/RentalApplicationDocumentReviewPanel.jsx'
import { recordRentalApplicationReview } from '../../../services/rentals/rentalApplicationRepository.js'
vi.mock('../../../services/rentals/rentalApplicationRepository.js',()=>({recordRentalApplicationReview:vi.fn().mockResolvedValue({}),getRentalApplicationDocumentUrl:vi.fn()}))
afterEach(cleanup)
const requirements = [{id:'r',subjectId:'primary',purpose:'proof_of_income',scopeKey:'application',required:true,active:true,mode:'active',generation:1,state:'received',documentId:'b'}]
const data = { income:{monthlyIncome:10000},documentLinks:['a','b'].map((documentId)=>({documentId,subjectId:'primary',purpose:'proof_of_income',requirementId:'r',generation:1})) }
const documents = ['a','b'].map((id)=>({id,name:`${id}.pdf`,file_name:`${id}.pdf`,status:'uploaded',intake_bundle_id:'pack'}))
it('shows every current pack file and passes multiple selection as one pack',()=>{
 const upload = vi.fn(), open = vi.fn()
 render(<RentalApplicationDocuments data={data} documents={documents} requirements={requirements} onUpload={upload} onUploadMany={upload} onOpen={open} />)
 expect(screen.getAllByRole('button',{name:/Open .*pdf/})).toHaveLength(2)
 const input=screen.getByLabelText('Upload Primary applicant income evidence')
 expect(input.multiple).toBe(true)
 const files=[new File(['one'],'one.pdf',{type:'application/pdf'}),new File(['two'],'two.pdf',{type:'application/pdf'})]
 fireEvent.change(input,{target:{files}})
 expect(upload.mock.calls[0][0]).toEqual(files)
 fireEvent.click(screen.getByRole('button',{name:'Open a.pdf'}))
 expect(open).toHaveBeenCalledWith(documents[0])
})
it('lets agents review each pack member separately',async()=>{
 const onSaved=vi.fn().mockResolvedValue(undefined)
 render(<RentalApplicationDocumentReviewPanel application={{id:'app',version:5,status:'submitted',data,requirements,documents}} onSaved={onSaved} />)
 expect(screen.getAllByRole('button',{name:'Accept'})).toHaveLength(2)
 fireEvent.change(screen.getByLabelText('Primary applicant income evidence: a.pdf review note'),{target:{value:'Readable evidence'}})
 fireEvent.click(screen.getAllByRole('button',{name:'Accept'})[0])
 await waitFor(()=>expect(onSaved).toHaveBeenCalled())
 expect(recordRentalApplicationReview).toHaveBeenCalledWith({applicationId:'app',expectedVersion:5,command:'review_document',payload:{documentId:'a',status:'accepted',note:'Readable evidence'}})
})
