import assert from 'node:assert/strict';
import test from 'node:test';
import { jobAcceptsEngineerProgress } from './job-progress-guard';

test('terminal and disputed jobs reject engineer progress',()=>{
  for(const status of ['completed','cancelled','disputed'])assert.equal(jobAcceptsEngineerProgress(status),false);
});
test('active and scheduled jobs permit progress',()=>{
  for(const status of ['accepted','scheduled','in_progress'])assert.equal(jobAcceptsEngineerProgress(status),true);
});
