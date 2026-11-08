// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import ImportedEmailEditor from '../ImportedEmailEditor'
afterEach(cleanup)
it('previews and edits imported content without replacing the layout or hosted images',()=>{
 const change=vi.fn(),code=vi.fn()
 const html='<html><body><table><tbody><tr><td><h1>Madison Place</h1><img src="https://assets.example/hero.png" alt="Home"></td></tr></tbody></table></body></html>'
 render(<ImportedEmailEditor html={html} onChange={change} onEditHtml={code}/>)
 expect(screen.getByTitle('Imported email visual preview').getAttribute('srcdoc')).toBe(html)
 expect(screen.getByTitle('Imported email visual preview').getAttribute('sandbox')).toBe('')
 fireEvent.change(screen.getByLabelText('Text 1'),{target:{value:'New Madison homes'}})
 expect(change.mock.calls[0][0]).toContain('New Madison homes')
 expect(change.mock.calls[0][0]).toContain('https://assets.example/hero.png')
 expect(change.mock.calls[0][0]).toContain('<table>')
 fireEvent.click(screen.getByRole('button',{name:'Edit HTML'}));expect(code).toHaveBeenCalled()
})
it('explains when the original HTML contains no images',()=>{
 render(<ImportedEmailEditor html='<p>Original email text</p>' onChange={vi.fn()} onEditHtml={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Images'}))
 expect(screen.getByRole('status').textContent).toContain('No images in this email.')
})
it('edits imported link destinations and image descriptions in separate panels',()=>{
 const change=vi.fn()
 render(<ImportedEmailEditor html='<p>Welcome</p><a href="https://example.com/old">Register</a><img src="https://example.com/image.png" alt="Home">' onChange={change} onEditHtml={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'Links'}))
 fireEvent.change(screen.getByLabelText('Destination URL'),{target:{value:'https://example.com/new'}})
 expect(change.mock.calls.at(-1)[0]).toContain('href="https://example.com/new"')
 expect(change.mock.calls.at(-1)[0]).toContain('image.png')
 fireEvent.click(screen.getByRole('button',{name:'Images'}))
 fireEvent.change(screen.getByLabelText('Image description'),{target:{value:'Garden home'}})
 expect(change.mock.calls.at(-1)[0]).toContain('alt="Garden home"')
 fireEvent.click(screen.getByRole('button',{name:'Mobile preview'}))
 expect(screen.getByTitle('Imported email visual preview').className).toBe('is-mobile')
})

it('edits text beside inline styling without discarding the styled span',()=>{
 const change=vi.fn()
 render(<ImportedEmailEditor html='<h1>More room for <span style="color:gold">what matters.</span></h1>' onChange={change} onEditHtml={vi.fn()}/>)
 fireEvent.change(screen.getByLabelText('Text 1'),{target:{value:'A new home for '}})
 expect(change.mock.calls[0][0]).toContain('A new home for <span style="color:gold">what matters.</span>')
})
