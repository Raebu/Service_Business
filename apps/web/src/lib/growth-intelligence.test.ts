import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestGrowthAction,evidenceReminderStage} from './growth-intelligence';

test('supply gaps prioritise provider recruitment',()=>{
  const r=suggestGrowthAction({area:'SO',service_key:'EICR',demand_count:12,verified_provider_count:1,gap_score:70});
  assert.equal(r?.category,'supply');
  assert.equal(r?.reference,'supply:SO:EICR');
});
test('content suggestions require verified supply and real demand',()=>{
  assert.equal(suggestGrowthAction({area:'SO',service_key:'EICR',demand_count:5,verified_provider_count:4,gap_score:5})?.category,'content');
  assert.equal(suggestGrowthAction({area:'SO',service_key:'EICR',demand_count:0,verified_provider_count:5,gap_score:0}),null);
});
test('application reminders occur only after 3 and 7 days',()=>{
 const now=new Date('2026-10-12T12:00:00Z');
 assert.equal(evidenceReminderStage('2026-10-11T12:00:00Z',now),null);
 assert.equal(evidenceReminderStage('2026-10-08T12:00:00Z',now),'day3');
 assert.equal(evidenceReminderStage('2026-10-04T12:00:00Z',now),'day7');
 assert.equal(evidenceReminderStage('invalid',now),null);
});
