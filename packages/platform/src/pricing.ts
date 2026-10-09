export type PricingMode='fixed'|'hourly'|'diagnostic';

export type RateItem={
  pricingMode:PricingMode;
  fixedPricePence?:number|null;
  calloutPence?:number;
  hourlyPence?:number|null;
  minimumChargePence?:number;
  estimatedDurationMinutes?:number|null;
  emergencyMultiplier?:number;
  travelChargePence?:number;
};

export type TransparentQuote={
  providerPricePence:number;
  platformFeePence:number;
  customerTotalPence:number;
  providerReceivesPence:number;
  customerFeeBps:number;
  currency:'GBP';
};

function assertMoney(value:number,name:string){
  if(!Number.isSafeInteger(value)||value<0)throw new Error(`${name}_must_be_non_negative_pence`);
}

export function calculateProviderPrice(rate:RateItem,durationMinutes?:number,emergency=false):number{
  const callout=rate.calloutPence??0;
  const minimum=rate.minimumChargePence??0;
  const travel=rate.travelChargePence??0;
  for(const [name,amount] of [['callout',callout],['minimum_charge',minimum],['travel_charge',travel]] as const)assertMoney(amount,name);
  let work=0;
  if(rate.pricingMode==='fixed'||rate.pricingMode==='diagnostic'){
    if(rate.fixedPricePence==null)throw new Error('fixed_price_required');
    assertMoney(rate.fixedPricePence,'fixed_price');
    work=rate.fixedPricePence;
  }else{
    if(rate.hourlyPence==null)throw new Error('hourly_price_required');
    const minutes=durationMinutes??rate.estimatedDurationMinutes;
    assertMoney(rate.hourlyPence,'hourly_price');
    if(!Number.isSafeInteger(minutes)||!minutes||minutes<=0)throw new Error('duration_required');
    work=Math.ceil(rate.hourlyPence*minutes/60);
  }
  let subtotal=Math.max(minimum,callout+work+travel);
  if(emergency){const multiplier=rate.emergencyMultiplier??1;if(!Number.isFinite(multiplier)||multiplier<=0)throw new Error('invalid_emergency_multiplier');subtotal=Math.round(subtotal*multiplier);}
  assertMoney(subtotal,'provider_price');
  return subtotal;
}

export function calculateTransparentQuote(input:{
  providerPricePence:number;
  customerFeeBps?:number;
  minimumFeePence?:number|null;
  maximumFeePence?:number|null;
}):TransparentQuote{
  const providerPricePence=input.providerPricePence;
  const customerFeeBps=input.customerFeeBps??1500;
  assertMoney(providerPricePence,'provider_price');
  if(!Number.isSafeInteger(customerFeeBps)||customerFeeBps<0||customerFeeBps>10000)throw new Error('invalid_customer_fee_bps');
  let fee=Math.round(providerPricePence*customerFeeBps/10000);
  if(input.minimumFeePence!=null){assertMoney(input.minimumFeePence,'minimum_fee');fee=Math.max(fee,input.minimumFeePence)}
  if(input.maximumFeePence!=null){assertMoney(input.maximumFeePence,'maximum_fee');fee=Math.min(fee,input.maximumFeePence)}
  assertMoney(fee,'platform_fee');
  const customerTotalPence=providerPricePence+fee;
  assertMoney(customerTotalPence,'customer_total');
  return{
    providerPricePence,
    platformFeePence:fee,
    customerTotalPence,
    providerReceivesPence:providerPricePence,
    customerFeeBps,
    currency:'GBP'
  };
}
