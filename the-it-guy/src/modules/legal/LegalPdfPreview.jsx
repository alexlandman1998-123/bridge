import {useEffect,useRef,useState} from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
/** Render verified bytes locally; no document URLs, scripts or signing integrations. */
export default function LegalPdfPreview({blob}) {
 const [pdf,setPdf]=useState(null),[pageNumber,setPageNumber]=useState(1),[error,setError]=useState(''),[width,setWidth]=useState(680),[painted,setPainted]=useState(0);
 const canvas=useRef(null),container=useRef(null);
 useEffect(()=>{
  let active=true,loading;
  blob.arrayBuffer().then(bytes=>{if(!active)return;loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});return loading.promise;}).then(document=>{if(active&&document)setPdf(document);}).catch(()=>{if(active)setError('Preview could not be loaded. Download this version to view it.');});
  return()=>{active=false;loading?.destroy().catch(()=>{});};
 },[blob]);
 useEffect(()=>{
  if(!container.current)return;
  const observer=new ResizeObserver(entries=>setWidth(Math.max(1,Math.min(680,Math.floor(entries[0].contentRect.width)))));
  observer.observe(container.current);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!pdf||!canvas.current)return;
  let active=true,render;
  pdf.getPage(pageNumber).then(page=>{
   if(!active||!canvas.current)return;
   const viewport=page.getViewport({scale:width/page.getViewport({scale:1}).width}),ratio=Math.min(window.devicePixelRatio||1,2);
   canvas.current.width=Math.floor(viewport.width*ratio);canvas.current.height=Math.floor(viewport.height*ratio);
   canvas.current.style.width=viewport.width+'px';canvas.current.style.height=viewport.height+'px';
   render=page.render({canvasContext:canvas.current.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});return render.promise;
  }).then(()=>{if(active)setPainted(pageNumber);}).catch(e=>{if(active&&e.name!=='RenderingCancelledException')setError('Preview could not be rendered. Download this version to view it.');});
  return()=>{active=false;render?.cancel();};
 },[pdf,pageNumber,width]);
 return <div ref={container} className="min-w-0 space-y-3" aria-label="Document preview">
  {error?<p role="alert" className="text-sm text-red-700">{error}</p>:null}
  {!pdf?<p role="status" className="text-sm text-slate-500">Loading preview…</p>:<div className="flex items-center justify-between gap-3 text-sm"><button disabled={pageNumber===1} className="underline disabled:opacity-40" onClick={()=>setPageNumber(n=>n-1)}>Previous page</button><span>Page {pageNumber} of {pdf.numPages}</span><button disabled={pageNumber===pdf.numPages} className="underline disabled:opacity-40" onClick={()=>setPageNumber(n=>n+1)}>Next page</button></div>}
  <canvas ref={canvas} role="img" aria-label={`PDF page ${pageNumber}`} data-rendered={painted===pageNumber?'true':'false'} className="mx-auto max-w-full rounded-lg border border-slate-200 bg-white"/>
 </div>;
}
