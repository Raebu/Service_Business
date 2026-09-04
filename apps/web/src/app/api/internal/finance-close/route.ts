import { NextResponse } from 'next/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const BATCH=25;

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const supabase=getAdminSupabase();
    const today=new Date().toISOString().slice(0,10);
    const {data:periods,error}=await supabase.from('finance_periods').select('id,organisation_id,period_type,starts_on,ends_on,status').eq('status','review').lte('ends_on',today).order('ends_on',{ascending:true}).limit(BATCH);
    if(error)return NextResponse.json({error:'Unable to load finance close queue.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const period of periods||[]){
      const {error:lockError}=await supabase.rpc('lock_finance_period',{p_period_id:period.id});
      if(lockError){
        results.push({periodId:period.id,organisationId:period.organisation_id,status:'blocked',reason:lockError.message});
        continue;
      }
      await supabase.from('audit_events').insert({event_type:'finance.period_locked',entity_type:'finance_period',entity_id:period.id,metadata:{organisationId:period.organisation_id,periodType:period.period_type,startsOn:period.starts_on,endsOn:period.ends_on,mode:'autonomous'}});
      results.push({periodId:period.id,organisationId:period.organisation_id,status:'locked'});
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Finance close worker failed.'},{status:500});
  }
}
