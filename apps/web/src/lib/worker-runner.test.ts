import test from 'node:test';
import assert from 'node:assert/strict';
import {runInternalWorkers} from './worker-runner';

const source=new Request('https://service-business.example/api/cron/daily-intelligence');

test('worker uses internal bearer credentials and maps the proper route',async()=>{
  const out=await runInternalWorkers(source,[{
    path:'/api/internal/check',
    run:async req=>{
      assert.equal(new URL(req.url).pathname,'/api/internal/check');
      assert.equal(req.method,'POST');
      assert.equal(req.headers.get('authorization'),'Bearer local-test-secret');
      return Response.json({ok:true},{status:200});
    }
  }],'local-test-secret');
  assert.deepEqual(out,[{path:'/api/internal/check',ok:true,status:200,detail:undefined}]);
});

test('a 207 partial worker result fails the parent cycle',async()=>{
  const result=await runInternalWorkers(source,[{path:'/api/internal/check',run:async()=>new Response('partial failure',{status:207})}],'secret');
  assert.equal(result[0].ok,false);
  assert.equal(result[0].status,207);
});

test('HTTP failures and exceptions do not disclose sensitive worker internals',async()=>{
  const results=await runInternalWorkers(source,[
    {path:'/api/internal/payments',run:async()=>new Response('customer email / secret',{status:500})},
    {path:'/api/internal/reconciliation',run:async()=>{throw Error('database password revealed')}}
  ],'secret');
  assert.deepEqual(results.map(x=>x.ok),[false,false]);
  assert.equal(results[0].status,500);
  assert.equal(results[1].status,0);
  assert.doesNotMatch(JSON.stringify(results),/customer email|secret|database password/);
});
