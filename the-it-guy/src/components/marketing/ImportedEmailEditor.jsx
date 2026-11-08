import {useMemo,useState,useId} from 'react'
import {Code2,Monitor,Smartphone,Type,Image,Link2} from 'lucide-react'
import './ImportedEmailEditor.css'
const textElements=doc=>{
 const walker=doc.createTreeWalker(doc.body,4),nodes=[]
 while(walker.nextNode()){
  const node=walker.currentNode
  let parent=node.parentElement,hidden=false
  while(parent){if(parent.hidden||parent.style?.display==='none'||parent.style?.visibility==='hidden'){hidden=true;break}parent=parent.parentElement}
  if(!hidden&&node.textContent.trim()&&!node.parentElement.closest('script,style,noscript'))nodes.push(node)
  if(nodes.length===100)break
 }
 return nodes
}
const snippet=(value,fallback)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,55)||fallback

export default function ImportedEmailEditor({html,onChange,onEditHtml}) {
 const [tab,setTab]=useState('text'),[mobile,setMobile]=useState(false),[selection,setSelection]=useState({text:0,image:0,link:0})
 const fieldId=useId()
 const parsed=useMemo(()=>new DOMParser().parseFromString(html||'','text/html'),[html])
 const items={text:textElements(parsed),image:[...parsed.querySelectorAll('img')],link:[...parsed.querySelectorAll('a[href]')]}
 const index=Math.min(selection[tab],Math.max(0,items[tab].length-1)),element=items[tab][index]
 const edit=(attribute,value)=>{
  const copy=new DOMParser().parseFromString(html||'','text/html')
  const node=tab==='image'?copy.querySelectorAll('img')[index]:tab==='link'?copy.querySelectorAll('a[href]')[index]:textElements(copy)[index]
  if(!node)return
  if(attribute==='text')node.textContent=value
  else node.setAttribute(attribute,value)
  onChange(`<!doctype html>${copy.documentElement.outerHTML}`)
 }
 return <section className="imported-email-editor" aria-label="Imported email editor">
  <header className="ie-toolbar"><h2>Email editor</h2><div><div className="ie-device" role="group" aria-label="Preview size"><button type="button" aria-label="Desktop preview" aria-pressed={!mobile} onClick={()=>setMobile(false)}><Monitor size={16}/></button><button type="button" aria-label="Mobile preview" aria-pressed={mobile} onClick={()=>setMobile(true)}><Smartphone size={16}/></button></div><button className="ie-code" type="button" onClick={onEditHtml}><Code2 size={15}/>Edit HTML</button></div></header>
  <div className="ie-layout">
   <div className="ie-preview"><iframe title="Imported email visual preview" sandbox="" srcDoc={html} className={mobile?'is-mobile':''}/></div>
   <aside className="ie-inspector" aria-label="Edit imported content">
    <div className="ie-tabs" role="group" aria-label="Content type">{[['text','Text',Type],['image','Images',Image],['link','Links',Link2]].map(([key,label,Icon])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}><Icon size={15}/>{label}</button>)}</div>
    {element?<div className="ie-fields">
     <label htmlFor={`${fieldId}-section`}>{tab==='text'?'Text section':tab==='image'?'Image':'Link'}</label>
     <select id={`${fieldId}-section`} value={index} onChange={event=>setSelection(old=>({...old,[tab]:Number(event.target.value)}))}>{items[tab].map((node,i)=><option key={i} value={i}>{i+1}. {snippet(tab==='image'?node.alt:node.textContent,tab==='image'?'Image':'Section')}</option>)}</select>
     {tab==='text'&&<><label htmlFor={`${fieldId}-text`}>Content</label><textarea id={`${fieldId}-text`} aria-label={`Text ${index+1}`} value={element.textContent} onChange={event=>edit('text',event.target.value)} rows={9}/></>}
     {tab==='image'&&<><div className="ie-image-preview"><img src={element.getAttribute('src')||''} alt={element.alt||'Selected email image'}/></div><label htmlFor={`${fieldId}-url`}>Image URL</label><input id={`${fieldId}-url`} type="url" value={element.getAttribute('src')||''} onChange={event=>edit('src',event.target.value)}/><label htmlFor={`${fieldId}-alt`}>Image description</label><input id={`${fieldId}-alt`} value={element.alt||''} onChange={event=>edit('alt',event.target.value)}/></>}
     {tab==='link'&&<><label htmlFor={`${fieldId}-url`}>Destination URL</label><input id={`${fieldId}-url`} type="url" value={element.getAttribute('href')||''} onChange={event=>edit('href',event.target.value)}/></>}
    </div>:<p className="ie-empty" role="status">{tab==='image'?'No images in this email.':tab==='link'?'No links in this email.':'No editable text found.'}</p>}
   </aside>
  </div>
 </section>
}
