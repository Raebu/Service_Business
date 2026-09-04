import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAreaReadiness,canPubliclyClaimNationalCoverage,calculateProviderPrice,calculateTransparentQuote,checkSlotFeasibility } from './index';
import { rankProviders } from './matching';

const thresholds={minimumVerifiedBusinesses:100,minimumProvidersPerLiveArea:3,minimumFillRate:.95,maximumMedianMatchMinutes:15};

test('coverage remains closed with no verified providers',()=>{
  assert.equal(calculateAreaReadiness('SO',0,1,0,thresholds).status,'closed');
});

test('coverage recruits until minimum provider depth is met',()=>{
  assert.equal(calculateAreaReadiness('SO',2,1,5,thresholds).status,'recruiting');
});

test('coverage does not go live when service metrics miss target',()=>{
  assert.equal(calculateAreaReadiness('SO',3,.8,10,thresholds).status,'ready');
  assert.equal(calculateAreaReadiness('SO',3,.99,20,thresholds).status,'ready');
});

test('national claim requires business threshold and every measured area live',()=>{
  const live=calculateAreaReadiness('SO',5,.99,8,thresholds);
  const notLive=calculateAreaReadiness('PO',2,.99,8,thresholds);
  assert.equal(canPubliclyClaimNationalCoverage(100,thresholds,[live]),true);
  assert.equal(canPubliclyClaimNationalCoverage(99,thresholds,[live]),false);
  assert.equal(canPubliclyClaimNationalCoverage(100,thresholds,[live,notLive]),false);
});

test('matching excludes unverified, uncovered and already-tried providers',()=>{
  const ranked=rankProviders([
    {providerId:'best',coversArea:true,serviceMatch:true,verificationActive:true,availableNow:true,qualityScore:96,acceptanceRate:.95,completionRate:.99,reworkRate:.01},
    {providerId:'tried',coversArea:true,serviceMatch:true,verificationActive:true,availableNow:true,qualityScore:99,acceptanceRate:1,completionRate:1,reworkRate:0},
    {providerId:'unverified',coversArea:true,serviceMatch:true,verificationActive:false,availableNow:true,qualityScore:100,acceptanceRate:1,completionRate:1,reworkRate:0},
    {providerId:'wrong-area',coversArea:false,serviceMatch:true,verificationActive:true,availableNow:true,qualityScore:100,acceptanceRate:1,completionRate:1,reworkRate:0}
  ],['tried']);
  assert.deepEqual(ranked.map(item=>item.providerId),['best']);
});

test('transparent pricing charges customer once and preserves provider price',()=>{
  const quote=calculateTransparentQuote({providerPricePence:30000,customerFeeBps:1500});
  assert.equal(quote.platformFeePence,4500);
  assert.equal(quote.customerTotalPence,34500);
  assert.equal(quote.providerReceivesPence,30000);
});

test('provider hourly rate uses integer pence and minimum charge',()=>{
  const price=calculateProviderPrice({pricingMode:'hourly',hourlyPence:6000,calloutPence:2500,minimumChargePence:8000},30);
  assert.equal(price,8000);
});

test('scheduled slot includes travel and buffer when checking conflicts',()=>{
  const day=new Date('2026-09-15T08:00:00Z');
  const result=checkSlotFeasibility({
    requestedStart:new Date('2026-09-15T14:00:00Z'),
    durationMinutes:90,
    workingWindow:{start:day,end:new Date('2026-09-15T18:00:00Z')},
    busy:[{start:new Date('2026-09-15T12:00:00Z'),end:new Date('2026-09-15T13:00:00Z')}],
    travelBeforeMinutes:20,
    travelAfterMinutes:15,
    bufferMinutes:10
  });
  assert.equal(result.feasible,true);
  assert.equal(result.serviceEnd.toISOString(),'2026-09-15T15:30:00.000Z');
});

test('scheduled slot is rejected when travel buffer overlaps another booking',()=>{
  const result=checkSlotFeasibility({
    requestedStart:new Date('2026-09-15T14:00:00Z'),
    durationMinutes:60,
    workingWindow:{start:new Date('2026-09-15T08:00:00Z'),end:new Date('2026-09-15T18:00:00Z')},
    busy:[{start:new Date('2026-09-15T13:35:00Z'),end:new Date('2026-09-15T13:50:00Z')}],
    travelBeforeMinutes:20,
    bufferMinutes:10
  });
  assert.equal(result.feasible,false);
  assert.equal(result.reason,'conflict');
});
