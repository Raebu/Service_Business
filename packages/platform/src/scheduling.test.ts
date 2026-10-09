import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSlotFeasibility,normaliseScheduleRequest} from './scheduling';

const baseline={
 requestedStart:new Date('2026-09-15T14:00:00Z'),
 durationMinutes:60,
 workingWindow:{start:new Date('2026-09-15T08:00:00Z'),end:new Date('2026-09-15T18:00:00Z')},
 busy:[]
};

test('invalid durations are rejected',()=>{
 for(const durationMinutes of [NaN,Infinity,-1,0,0.5]){
  assert.throws(()=>checkSlotFeasibility({...baseline,durationMinutes}),/invalid_duration/);
 }
});

test('invalid travel buffers are rejected',()=>{
 for(const travelBeforeMinutes of [-1,Infinity,0.25]){
  assert.throws(()=>checkSlotFeasibility({...baseline,travelBeforeMinutes}),/invalid_travel_before/);
 }
});

test('invalid date and occupied intervals are rejected',()=>{
 assert.throws(()=>checkSlotFeasibility({...baseline,requestedStart:new Date('invalid')}),/invalid_requested_start/);
 assert.throws(()=>checkSlotFeasibility({...baseline,busy:[{start:new Date('2026-09-15T14:00:00Z'),end:new Date('2026-09-15T13:00:00Z')}]}),/invalid_schedule_interval/);
 assert.throws(()=>checkSlotFeasibility({...baseline,workingWindow:{start:new Date('2026-09-15T18:00:00Z'),end:new Date('2026-09-15T08:00:00Z')}}),/invalid_schedule_interval/);
});

test('normalised schedule rejects invalid date',()=>{
 assert.throws(()=>normaliseScheduleRequest({mode:'exact',start:new Date('invalid')}),/invalid_scheduled_start/);
});
