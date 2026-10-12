import assert from 'node:assert/strict';
import test from 'node:test';
import { mayIndependentlyVerifyCompetency } from './competency-review';

test('a team manager cannot verify their own competency',()=>{
  assert.equal(mayIndependentlyVerifyCompetency('same-user','same-user'),false);
});

test('a separate team manager may review competency',()=>{
  assert.equal(mayIndependentlyVerifyCompetency('engineer-user','reviewer-user'),true);
});

test('a reviewer without identity is not authorised',()=>{
  assert.equal(mayIndependentlyVerifyCompetency('engineer-user',''),false);
});
