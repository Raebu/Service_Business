import { NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateProviderPrice,calculateTransparentQuote } from '@service-business/platform';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({
  organisationId:z.string().uuid(),
  serviceKey:z.string().trim().min(2).max(120),
  pricingMode:z.enum(['fixed','hourly','diagnostic']),
  fixedPricePence:z.coerce.number().int().min(0).optional(),
  calloutPence:z.coerce.number().int().min(0).default(0),
  hourlyPence:z.coerce.number().int().min(0).optional(),
  minimumChargePence:z.coerce.number().int().min(0).default(0),
  estimatedDurationMinutes:z.coerce.number().int().positive().max(1440).optional(),
  emergencyMultiplier:z.coerce.number().min(1).max(5).default(1),
  travelChargePence:z.coerce.number().int().min(0).default(0)
}).superRefine((value,ctx)=>{
  if((value.pricingMode==='fixed'||value.pricingMode==='diagnostic')&&value.fixedPricePence==null)ctx.addIssue({code:'custom',path:['fixedPricePence'],message:'Fixed price is required.'});
  if(value.pricingMode==='hourly'&&value.hourlyPence==null)ctx.addIssue({code:'custom',path:['hourlyPence'],message:'Hourly rate is required.'});
});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Please check the pricing details.'},{status:400});
  const userSupabase=await getUserSupabase();if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',parsed.data.organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin','manager'].includes(membership.role))return NextResponse.json({error:'Business owner or manager access required.'},{status:403});
  try{
    const admin=getAdminSupabase();
    let {data:card}=await admin.from('provider_rate_cards').select('id,version').eq('organisation_id',parsed.data.organisationId).eq('active',true).order('version',{ascending:false}).limit(1).maybeSingle();
    if(!card){
      const created=await admin.from('provider_rate_cards').insert({organisation_id:parsed.data.organisationId,name:'Standard',currency:'GBP',version:1,active:true}).select('id,version').single();
      if(created.error||!created.data)return NextResponse.json({error:'Unable to create rate card.'},{status:500});card=created.data;
    }
    const travelRules=parsed.data.travelChargePence>0?[{type:'flat',amountPence:parsed.data.travelChargePence}]:[];
    const {data:item,error}=await admin.from('provider_rate_items').upsert({
      rate_card_id:card.id,
      service_key:parsed.data.serviceKey,
      pricing_mode:parsed.data.pricingMode,
      fixed_price_pence:parsed.data.fixedPricePence??null,
      callout_pence:parsed.data.calloutPence,
      hourly_pence:parsed.data.hourlyPence??null,
      minimum_charge_pence:parsed.data.minimumChargePence,
      estimated_duration_minutes:parsed.data.estimatedDurationMinutes??null,
      emergency_multiplier:parsed.data.emergencyMultiplier,
      travel_rules:travelRules,
      active:true
    },{onConflict:'rate_card_id,service_key'}).select('*').single();
    if(error)return NextResponse.json({error:'Unable to save rate.',detail:error.message},{status:500});
    const providerPrice=calculateProviderPrice({pricingMode:parsed.data.pricingMode,fixedPricePence:parsed.data.fixedPricePence,calloutPence:parsed.data.calloutPence,hourlyPence:parsed.data.hourlyPence,minimumChargePence:parsed.data.minimumChargePence,estimatedDurationMinutes:parsed.data.estimatedDurationMinutes,emergencyMultiplier:parsed.data.emergencyMultiplier,travelChargePence:parsed.data.travelChargePence},parsed.data.estimatedDurationMinutes,false);
    const {data:policy}=await admin.from('platform_pricing_policies').select('customer_fee_bps,minimum_fee_pence,maximum_fee_pence').eq('vertical_id','electrical').eq('active',true).maybeSingle();
    const quote=calculateTransparentQuote({providerPricePence:providerPrice,customerFeeBps:Number(policy?.customer_fee_bps??1500),minimumFeePence:policy?.minimum_fee_pence??null,maximumFeePence:policy?.maximum_fee_pence??null});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:'provider.rate_saved',entity_type:'rate_item',entity_id:item.id,metadata:{organisationId:parsed.data.organisationId,serviceKey:parsed.data.serviceKey,quote}});
    return NextResponse.json({item,exampleQuote:quote,message:'Rate saved. The electrician price remains untouched; the customer service fee is added separately.'},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to save pricing.'},{status:500});
  }
}
