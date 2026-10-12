import test from 'node:test';
import assert from 'node:assert/strict';
import {isSlotFree} from './growth-calendar';

test('calendar avoids overlapping busy meetings',()=>{
 const busy=[{start:'2026-10-15T10:00:00Z',end:'2026-10-15T11:00:00Z'}];
 assert.equal(isSlotFree('2026-10-15T10:30:00Z','2026-10-15T11:30:00Z',busy),false);
 assert.equal(isSlotFree('2026-10-15T11:00:00Z','2026-10-15T11:30:00Z',busy),true);
 assert.equal(isSlotFree('2026-10-15T09:30:00Z','2026-10-15T10:00:00Z',busy),true);
});
test('calendar rejects invalid or backwards slots',()=>{
 assert.equal(isSlotFree('bad','2026-10-15T11:00:00Z',[]),false);
 assert.equal(isSlotFree('2026-10-15T11:00:00Z','2026-10-15T10:00:00Z',[]),false);
 assert.equal(isSlotFree('2026-10-15T11:00:00Z','2026-10-15T11:00:00Z',[]),false);
});
test('calendar fails closed on unparsable busy intervals',()=>{
 assert.equal(isSlotFree('2026-10-15T11:00:00Z','2026-10-15T11:30:00Z',[{start:'unknown',end:'bad'}]),false);
});
