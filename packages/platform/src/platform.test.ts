import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAreaReadiness,canPubliclyClaimNationalCoverage,calculateProviderPrice,calculateTransparentQuote,checkSlotFeasibility } from './index';
import { rankProviders } from './matching';
import { assertBalancedJournal,marketplaceEconomics,reverseJournal } from './finance';

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

test('finance journal rejects negative, fractional and unsafe entries',()=>{
  const balanced=[
    {accountCode:'cash',direction:'debit' as const,amountPence:1000},
    {accountCode:'liability',direction:'credit' as const,amountPence:1000}
  ];
  assert.deepEqual(assertBalancedJournal(balanced),{debitPence:1000,creditPence:1000});
  for(const invalid of [-1,0,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>assertBalancedJournal([{...balanced[0],amountPence:invalid},balanced[1]]),/journal_invalid_line/);
  }
  assert.throws(()=>assertBalancedJournal([{...balanced[0],amountPence:Number.MAX_SAFE_INTEGER},balanced[0],{...balanced[1],amountPence:1}]),/journal_not_balanced/);
});

test('reversal preserves amount and balances while switching directions',()=>{
  const original={idempotencyKey:'charge:job1',sourceType:'charge',sourceId:'job1',currency:'GBP',lines:[
    {accountCode:'cash',direction:'debit' as const,amountPence:34500},
    {accountCode:'provider_liability',direction:'credit' as const,amountPence:30000},
    {accountCode:'fee_revenue',direction:'credit' as const,amountPence:4500}
  ]};
  const reversal=reverseJournal(original,'charge_refunded');
  assert.deepEqual(assertBalancedJournal(reversal.lines),{debitPence:34500,creditPence:34500});
  assert.equal(reversal.lines[0].direction,'credit');
  assert.equal(reversal.idempotencyKey,'reversal:charge:job1');
});

test('marketplace economics rejects malformed amounts and preserves losses',()=>{
  assert.equal(marketplaceEconomics(30000,4500,500,6000).netPlatformMarginPence,-2000);
  assert.throws(()=>marketplaceEconomics(30000,-1),/invalid_marketplace_economics/);
  assert.throws(()=>marketplaceEconomics(30000,4500,Number.NaN),/invalid_marketplace_economics/);
});

test('price calculations reject negative, unsafe and nonfinite inputs',()=>{
  assert.throws(()=>calculateProviderPrice({pricingMode:'fixed',fixedPricePence:2000,travelChargePence:-1}),/travel_charge/);
  assert.throws(()=>calculateProviderPrice({pricingMode:'fixed',fixedPricePence:-500}),/fixed_price/);
  assert.throws(()=>calculateProviderPrice({pricingMode:'hourly',hourlyPence:3000},Number.POSITIVE_INFINITY),/duration_required/);
  assert.throws(()=>calculateProviderPrice({pricingMode:'fixed',fixedPricePence:1000,emergencyMultiplier:Infinity},undefined,true),/invalid_emergency_multiplier/);
  assert.throws(()=>calculateTransparentQuote({providerPricePence:Number.MAX_SAFE_INTEGER,customerFeeBps:1500}),/platform_fee|customer_total/);
  assert.throws(()=>calculateTransparentQuote({providerPricePence:1000,minimumFeePence:2000,maximumFeePence:-1}),/maximum_fee/);
});

test('provider matching handles nonfinite and missing scores predictably',()=>{
  const [candidate]=rankProviders([{providerId:'p1',coversArea:true,serviceMatch:true,verificationActive:true,availableNow:true,qualityScore:NaN,acceptanceRate:Infinity,completionRate:.8,reworkRate:0,coveragePriority:NaN}]);
  assert.equal(Number.isFinite(candidate.score),true);
  assert.deepEqual(rankProviders([{providerId:'',coversArea:true,serviceMatch:true,verificationActive:true,availableNow:true,qualityScore:80,acceptanceRate:1,completionRate:1,reworkRate:0}]),[]);
});
