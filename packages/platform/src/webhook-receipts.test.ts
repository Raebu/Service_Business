import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stripeReceiptDecision} from './webhook-receipts';

test('terminal receipts are acknowledged once, without reapplying payment effects',()=>{
  assert.equal(stripeReceiptDecision('processed','2026-01-01T00:00:00Z',0),'ack');
  assert.equal(stripeReceiptDecision('ignored','2026-01-01T00:00:00Z',0),'ack');
});
test('failed receipt is reclaimed for retry',()=>{
  assert.equal(stripeReceiptDecision('failed','2026-01-01T00:00:00Z',0),'claim');
});
test('in-flight receipt is not silently accepted or double processed',()=>{
  const now=Date.parse('2026-01-01T12:00:00Z');
  assert.equal(stripeReceiptDecision('processing',new Date(now-10_000).toISOString(),now),'retry');
  assert.equal(stripeReceiptDecision('processing',new Date(now-300_000).toISOString(),now),'claim');
});
test('invalid timestamps never permit early reclaim',()=>{
  assert.equal(stripeReceiptDecision('processing','not-a-date',Date.now()),'retry');
});
