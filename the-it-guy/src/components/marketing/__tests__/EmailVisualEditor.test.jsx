// @vitest-environment jsdom
import React,{useState} from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import EmailVisualEditor from '../EmailVisualEditor'
import {createEmailDocument} from '../../../../../supabase/functions/_shared/emailDocument.js'
vi.mock('../EmailRichText',()=>({default:()=>null}))
vi.mock('../EmailCampaignImages',()=>({default:()=>null}))
afterEach(cleanup)
function Harness(){const[document,onChange]=useState(()=>createEmailDocument({name:'Sample agency'}));return <EmailVisualEditor document={document} onChange={onChange} templates={[]} listings={[]} contacts={[]} brand={{name:'Sample agency'}} context={{agencyName:'Sample agency'}} onManageBrand={()=>{}} onSaveTemplate={()=>{}} onPreviewTemplate={()=>{}}/>}
it('folds both panels independently without removing the email canvas',()=>{
 render(<Harness/>);const left=screen.getByRole('button',{name:'Collapse Content panel'}),right=screen.getByRole('button',{name:'Collapse Edit content panel'});const library=document.getElementById(left.getAttribute('aria-controls')),inspector=document.getElementById(right.getAttribute('aria-controls'));
 fireEvent.click(left);expect(library.hidden).toBe(true);expect(inspector.hidden).toBe(false);expect(screen.getByRole('button',{name:'Expand Content panel'}).getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(right);expect(inspector.hidden).toBe(true);expect(screen.getByRole('heading',{name:'Email preview'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Expand Content panel'}));expect(library.hidden).toBe(false);expect(inspector.hidden).toBe(true);
})
it('retains selected-block edits while the inspector is folded and restored',()=>{
 render(<Harness/>);fireEvent.change(screen.getByRole('textbox',{name:'Text',exact:true}),{target:{value:'Updated agency'}});fireEvent.click(screen.getByRole('button',{name:'Collapse Edit content panel'}));expect(screen.queryByRole('textbox',{name:'Text',exact:true})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Expand Edit content panel'}));expect(screen.getByRole('textbox',{name:'Text',exact:true}).value).toBe('Updated agency');
})
