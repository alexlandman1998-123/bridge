import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
const require=createRequire(import.meta.url)
const dom=new JSDOM('<div id="root"></div>',{url:'https://test.invalid'})
globalThis.window=dom.window;globalThis.document=dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const {createRoot}=await import('react-dom/client')
let fail=false, calls=[], failSend=true
let fixture={transactionId:'matter',actorRole:'seller',audiences:['everyone','seller'],items:[{
 id:'m1',kind:'message',body:'<img src=x onerror=alert(1)>',authorName:'Seller',audience:'everyone',createdAt:'2026-09-08T12:00:00Z',
}]}
globalThis.__conversationTest={
 read:async()=>{if(fail)throw Error('revoked');return fixture},
 post:async options=>{calls.push(options);if(failSend)throw Error('timeout');return {id:options.commandId}},
}
const dataModule=text=>'data:text/javascript,'+encodeURIComponent(text)
const stub=dataModule('export const readMatterConversation=o=>globalThis.__conversationTest.read(o);export const postMatterMessage=o=>globalThis.__conversationTest.post(o)')
const hook=dataModule('export default function(){return {connectionState:"polling"}}')
let source=readFileSync(new URL('../src/components/transaction/MatterConversation.jsx',import.meta.url),'utf8')
 .replace("'react'",JSON.stringify(pathToFileURL(require.resolve('react')).href))
 .replace("'../../services/matterConversationService'",JSON.stringify(stub))
 .replace("'../../hooks/useTransactionLiveRefresh'",JSON.stringify(hook))
source=(await transform(source,{loader:'jsx',jsx:'automatic',format:'esm'})).code
 .replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
const {default:Conversation,MatterConversationAccess}=await import(dataModule(source))
const root=createRoot(document.getElementById('root'))
const render=(revision=0,token='seller-valid')=>root.render(React.createElement(MatterConversationAccess.Provider,{value:{token,sellerSession:'valid-session'}},React.createElement(Conversation,{transactionId:'matter',revision,requirePortal:true})))
const flush=async(fn=()=>{})=>act(async()=>{fn();await new Promise(r=>setTimeout(r,5))})
await flush(()=>render())
assert.equal(document.querySelectorAll('option').length,2)
assert.match(document.body.textContent,/Seller \+ professionals/)
assert.equal(document.querySelector('img'),null)
const textarea=document.querySelector('textarea')
await flush(()=>{
 Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'A seller reply')
 textarea.dispatchEvent(new window.Event('input',{bubbles:true}))
})
await flush(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
assert.equal(calls.length,1)
assert.equal(calls[0].token,'seller-valid')
assert.equal(calls[0].sellerSession,'valid-session')
assert.equal(calls[0].audience,'everyone')
assert.match(document.body.textContent,/Sending could not be confirmed/)
failSend=false
await flush(()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
assert.equal(calls[1].commandId,calls[0].commandId)
assert.equal(document.querySelector('textarea').value,'')
fixture={...fixture,audiences:[]}
await flush(()=>render(1))
assert.equal(document.querySelector('form'),null)
assert.match(document.body.textContent,/Read-only conversation/)
fail=true
await flush(()=>render(2))
assert.equal(document.querySelector('form'),null)
assert.doesNotMatch(document.body.textContent,/<img src/)
assert.match(document.body.textContent,/Conversation unavailable/)
fail=false
await flush(()=>render(3,''))
assert.equal(document.querySelector('form'),null)
assert.match(document.body.textContent,/Conversation unavailable/)
await flush(()=>root.unmount())
dom.window.close()
console.log('Conversation UI: server audiences, seller credentials, safe text rendering, idempotent retry, read-only and revoked access passed.')
