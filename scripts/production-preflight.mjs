#!/usr/bin/env node
/**
 * Read-only deployment preflight. Never invokes payment, booking, or cron mutations.
 * Usage: node scripts/production-preflight.mjs https://your-preview.example
 */
const raw=process.argv[2];
if(!raw){console.error('Usage: node scripts/production-preflight.mjs https://deployment-host');process.exit(2)}
let base;
try{
 base=new URL(raw);
 if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/'){
  throw new Error('use a bare deployment origin');
 }
 if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('HTTPS required for non-local hosts');
}catch(e){console.error('Invalid origin:',e.message);process.exit(2)}
const timeoutMs=10000;
async function check(path,validate){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(new URL(path,base),{redirect:'manual',signal:controller.signal,headers:{accept:'application/json'}});
  return await validate(response);
 }catch(e){return {ok:false,detail:e.name==='AbortError'?'timed out':e.message}}
 finally{clearTimeout(timer)}
}
const tests=[
 ['health configuration', '/api/health',async response=>{
  let data;try{data=await response.json()}catch{return {ok:false,detail:'invalid JSON'}}
  // Only non-secret configuration labels are printed.
  const missing=Array.isArray(data.missingRequired)?data.missingRequired.filter(x=>typeof x==='string'):[];
  const ok=response.status===200&&data.ready===true&&data.status==='ready'&&data.capabilities?.auth===true&&data.capabilities?.database===true&&data.capabilities?.payments===true&&data.capabilities?.workers===true;
  return {ok,detail:ok?'configuration gate passed':`status=${response.status}; missing=${missing.join(', ')||'none reported'}; capabilities not all ready`};
 }],
 ['public homepage','/',async response=>({ok:response.status===200,detail:`HTTP ${response.status}`})],
 ['fair pricing','/fair-pricing',async response=>({ok:response.status===200,detail:`HTTP ${response.status}`})],
 ['provider application','/electricians',async response=>({ok:response.status===200,detail:`HTTP ${response.status}`})],
 ['booking page','/book',async response=>({ok:response.status===200,detail:`HTTP ${response.status}`})]
];
let failed=0;
for(const [name,path,validate] of tests){
 const result=await check(path,validate);
 console.log(`${result.ok?'PASS':'FAIL'} ${name}: ${result.detail}`);
 if(!result.ok)failed++;
}
console.log('\nThis is a read-only surface/configuration check, NOT payment, migration, auth, role, webhook, dispatch or domain-cutover approval.');
if(failed){console.error(`${failed} preflight check(s) failed. Do not cut over.`);process.exitCode=1}
else console.log('Basic preflight passed. Complete the separate manual and test-mode launch gates before cutover.');
