import test from 'node:test';
import assert from 'node:assert/strict';
import {jobIntakeSchema} from './schemas';

const booking={
  customerName:'Example Customer',email:'example@example.test',phone:'07000000000',
  postcode:'SO50 9AA',address:'1 Example Road, Eastleigh',description:'Please replace a faulty electrical socket.',
  urgency:'routine' as const, scheduleMode:'asap' as const
};

test('electrical booking accepts a defined service',()=>{
  const parsed=jobIntakeSchema.safeParse({...booking,serviceKey:'Sockets & lighting'});
  assert.equal(parsed.success,true);
});

test('booking can infer the service when no explicit service is supplied',()=>{
  const parsed=jobIntakeSchema.safeParse(booking);
  assert.equal(parsed.success,true);
});

test('booking refuses unimplemented trades and arbitrary service strings',()=>{
  for(const serviceKey of ['Plumbing','Gas boiler service','random unverified trade']){
    const parsed=jobIntakeSchema.safeParse({...booking,serviceKey});
    assert.equal(parsed.success,false);
    if(!parsed.success)assert.ok(parsed.error.issues.some(i=>i.path.includes('serviceKey')));
  }
});

test('booking refuses an appointment window without its end',()=>{
  const parsed=jobIntakeSchema.safeParse({
    ...booking,scheduleMode:'window',requestedStart:'2026-10-15T12:00:00+01:00'
  });
  assert.equal(parsed.success,false);
  if(!parsed.success)assert.ok(parsed.error.issues.some(i=>i.path.includes('requestedEnd')));
});

test('booking refuses only one coordinate',()=>{
  const parsed=jobIntakeSchema.safeParse({...booking,latitude:50.95});
  assert.equal(parsed.success,false);
});
