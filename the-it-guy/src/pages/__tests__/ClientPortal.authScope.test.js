import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source=readFileSync(new URL('../ClientPortal.jsx',import.meta.url),'utf8')
for(const changed of [false,true]) test(`seller authentication ${changed?'cannot navigate or install its session in another portal':'installs the current scoped session'}`,async()=>{
 const begin=source.indexOf('  const handleSellerPortalPasswordSubmit = useCallback(')+'  const handleSellerPortalPasswordSubmit = useCallback('.length
 const end=source.indexOf('}, [loadPortal,',begin)+1
 let resolve;const waiting=new Promise(done=>{resolve=done}),updates=[]
 const scope={token:'seller-a',portalDataWorkspace:'selling',sellerPortalAccessToken:'',portalLoadScopeRef:{current:'seller-a:selling:'},sellerPortalPasswordForm:{password:'password123'},sellerPortalAuth:{passwordSet:true},verifySellerPortalPassword:()=>waiting,
  getStoredSellerPortalAccessToken:()=>'',setSellerPortalPasswordSaving:()=>updates.push('busy'),setSellerPortalRecoveryRequesting:()=>updates.push('recovery'),setSellerPortalPasswordFeedback:()=>updates.push('feedback'),setLoading:()=>updates.push('loading'),setSellerPortalAccessToken:()=>updates.push('session'),setSellerPortalAuth:()=>updates.push('auth'),setSellerPortalPasswordForm:()=>updates.push('form'),setError:()=>updates.push('error'),clearSellerPortalAccessToken:()=>updates.push('clear'),navigate:()=>updates.push('navigate'),loadPortal:()=>updates.push('load')}
 const action=Function('scope',`with(scope){return (${source.slice(begin,end)})}`)(scope)
 const done=action({preventDefault(){}});updates.length=0
 if(changed)scope.portalLoadScopeRef.current='seller-b:selling:'
 resolve({accessToken:'fixture-session'});await done
 if(changed)assert.deepEqual(updates,[])
 else{assert.ok(updates.includes('session'));assert.ok(updates.includes('load'))}
})
