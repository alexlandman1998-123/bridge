// @vitest-environment jsdom
import React,{useState} from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import EmailRichText from '../EmailRichText'
afterEach(()=>{cleanup();vi.restoreAllMocks()})
function Harness(){const[block,set]=useState({id:'text',text:'Hello world'});return <><EmailRichText block={block} onChange={patch=>set(old=>({...old,...patch}))}/><output>{block.richText}</output></>}
function select(node,start,end){const range=document.createRange();range.setStart(node.firstChild,start);range.setEnd(node.firstChild,end);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);fireEvent.mouseUp(node)}
it('bolds, italicises and links the selected text while preserving surrounding text',()=>{
 render(<Harness/>);const input=screen.getByRole('textbox',{name:'Rich text'});select(input,0,5);fireEvent.click(screen.getByRole('button',{name:'Bold selected text'}));expect(input.innerHTML).toContain('<strong>Hello</strong>');expect(input.textContent).toBe('Hello world');
 const range=document.createRange();range.selectNodeContents(input);window.getSelection().removeAllRanges();window.getSelection().addRange(range);fireEvent.mouseUp(input);fireEvent.click(screen.getByRole('button',{name:'Italic selected text'}));expect(input.innerHTML).toContain('<em>');vi.spyOn(window,'prompt').mockReturnValue('https://example.test');fireEvent.click(screen.getByRole('button',{name:'Link selected text'}));expect(input.querySelector('a')?.getAttribute('href')).toBe('https://example.test');
})
it('inserts merge fields and plain-text paste without accepting pasted HTML',()=>{
 render(<Harness/>);const input=screen.getByRole('textbox',{name:'Rich text'});select(input,6,11);fireEvent.change(screen.getByRole('combobox',{name:'Personalise'}),{target:{value:'first_name'}});expect(input.textContent).toBe('Hello {{first_name}}');fireEvent.paste(input,{clipboardData:{getData:()=>'<script>bad()</script>'}});expect(input.querySelector('script')).toBeNull();expect(input.textContent).toContain('<script>bad()</script>');
})
it('reflects external undo/redo while focused and sanitises unsafe typed markup',()=>{
 const change=vi.fn();const view=render(<EmailRichText block={{id:'text',text:'Original'}} onChange={change}/>);const input=screen.getByRole('textbox',{name:'Rich text'});input.focus();input.innerHTML='Edited';fireEvent.input(input);expect(change).toHaveBeenCalledWith({richText:'Edited',text:'Edited'});view.rerender(<EmailRichText block={{id:'text',text:'Original'}} onChange={change}/>);
 // An external version can have the same text prop as before: change its rich snapshot.
 view.rerender(<EmailRichText block={{id:'text',text:'Restored',richText:'<b>Restored</b>'}} onChange={change}/>);expect(input.innerHTML).toBe('<b>Restored</b>');input.innerHTML='<p onclick="bad()">Safe</p><img src=x onerror=bad()>';fireEvent.input(input);expect(change.mock.calls.at(-1)[0].richText).toBe('<p>Safe</p>');
})

it('sanitises saved rich text before putting it into the live editing surface',()=>{
 render(<EmailRichText block={{id:'unsafe',text:'Safe',richText:'<p onclick="bad()">Safe</p><img src=x onerror="bad()"><script>bad()</script>'}} onChange={()=>{}}/>);const input=screen.getByRole('textbox',{name:'Rich text'});expect(input.innerHTML).toBe('<p>Safe</p>');expect(input.querySelector('img,script')).toBeNull();
})
