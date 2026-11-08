import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source=readFileSync(new URL('../ClientPortal.jsx',import.meta.url),'utf8')
for(const [handler,next,submit] of [['handleSubmitIssue','handleSubmitAlteration','submitClientIssue'],['handleSubmitAlteration','handleSubmitReview','submitAlterationRequest']]) {
 for(const changedScope of [false,true]) test(`${handler}: async completion ${changedScope?'cannot reset another portal':'retains the actual form after React clears currentTarget'}`,async()=>{
  const begin=source.indexOf(`  async function ${handler}(`),end=source.indexOf(`  async function ${next}(`,begin)
  let finish;const pendingSave=new Promise(resolve=>{finish=resolve}),errors=[],mutations=[]
  const scope={token:'portal-a',portalDataWorkspace:'buyer',sellerPortalAccessToken:'',portalLoadScopeRef:{current:'portal-a:buyer:'},ensurePortalSectionEnabled:()=>true,isDemoMode:false,
   issueForm:{description:'Issue'},alterationForm:{title:'Alteration'},ISSUE_CATEGORIES:['General'],
   setSaving:()=>{},setError:error=>{if(error)errors.push(error)},setIssueForm:()=>mutations.push('form'),setAlterationForm:()=>mutations.push('form'),
   [submit]:()=>pendingSave,loadPortal:()=>mutations.push('reload')}
  const form={reset:()=>mutations.push('reset')},event={preventDefault(){},currentTarget:form}
  const action=Function('scope',`with(scope){return (${source.slice(begin,end).trim()})}`)(scope)
  const done=action(event);event.currentTarget=null
  if(changedScope)scope.portalLoadScopeRef.current='portal-b:buyer:'
  finish();await done
  assert.deepEqual(errors,[])
  assert.deepEqual(mutations,changedScope?[]:['form','reset','reload'])
 })
}
