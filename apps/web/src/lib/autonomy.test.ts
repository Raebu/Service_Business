import test from 'node:test';
import assert from 'node:assert/strict';
import {actionRisk,canRunWorkflow,excludedFromAutonomy,isRunSuccess,
 isWorkflowKind,retryBackoffSeconds,workflowDomains,sameOriginAdminRequest} from './autonomy';

test('all allowed workflow kinds have a bounded domain and action risk',()=>{
  for(const kind of Object.keys(workflowDomains)){
    assert.equal(isWorkflowKind(kind),true);
    assert.ok(actionRisk[kind as keyof typeof actionRisk]);
  }
  assert.equal(isWorkflowKind('refund'),false);
  assert.equal(isWorkflowKind('arbitrary_shell_command'),false);
});
test('autonomy remains disabled unless both kernel and activity gate are enabled',()=>{
  assert.equal(canRunWorkflow('dispatch',{}),false);
  assert.equal(canRunWorkflow('dispatch',{AUTONOMY_KERNEL_ENABLED:'true'}),false);
  assert.equal(canRunWorkflow('growth_outreach',{
    AUTONOMY_KERNEL_ENABLED:'true',ENABLE_OPERATIONAL_CYCLE:'true'
  }),false);
  assert.equal(canRunWorkflow('growth_outreach',{
    AUTONOMY_KERNEL_ENABLED:'true',ENABLE_AUTONOMOUS_OUTREACH:'true'
  }),true);
});
test('excluded financial and regulatory authorisations cannot execute',()=>{
 for(const name of excludedFromAutonomy){
   assert.equal(isWorkflowKind(name),false);
   assert.equal(canRunWorkflow(name,{AUTONOMY_KERNEL_ENABLED:'true'}),false);
 }
});
test('backoff grows and stops at the 60-minute limit',()=>{
 assert.deepEqual([1,2,3,4,5,6].map(retryBackoffSeconds),[30,90,270,810,2430,3600]);
});
test('partial success is treated as failure',()=>{
 assert.equal(isRunSuccess(200),true);
 assert.equal(isRunSuccess(207),false);
 assert.equal(isRunSuccess(401),false);
 assert.equal(isRunSuccess(503),false);
});

test('browser control mutations are same-origin only',()=>{
 assert.equal(sameOriginAdminRequest('https://service-business-ten.vercel.app',
    'https://service-business-ten.vercel.app/api/autonomy/admin/controls'),true);
 assert.equal(sameOriginAdminRequest('https://attacker.example',
    'https://service-business-ten.vercel.app/api/autonomy/admin/controls'),false);
 assert.equal(sameOriginAdminRequest(null,
    'https://service-business-ten.vercel.app/api/autonomy/admin/controls'),false);
});

test('sensitive finance tasks have two independent activation gates',()=>{
 const base={AUTONOMY_KERNEL_ENABLED:'true',ENABLE_DAILY_AUTONOMY:'true'};
 assert.equal(canRunWorkflow('finance_close',base),false);
 assert.equal(canRunWorkflow('reserves',base),false);
 assert.equal(canRunWorkflow('finance_close',{...base,ENABLE_AUTOMATED_FINANCE_CLOSE:'true'}),true);
 assert.equal(canRunWorkflow('reserves',{...base,ENABLE_AUTOMATED_RESERVE_RELEASE:'true'}),true);
 assert.equal(canRunWorkflow('reserves',{...base,ENABLE_AUTOMATED_FINANCE_CLOSE:'true'}),false);
});
