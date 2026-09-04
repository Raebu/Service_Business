import { NextResponse } from 'next/server';
import { calculateAreaReadiness } from '@service-business/platform';
import { electricalVertical } from '@service-business/electrical';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';
import { approveProviderSchema,formatZodError } from '@/lib/schemas';

export async function POST(request:Request,{params}:{params:Promise<{applicationId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  try{
    const parsed=approveProviderSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Verification evidence is incomplete.',fields:formatZodError(parsed.error)},{status:400});
    const {applicationId}=await params;
    const supabase=getAdminSupabase();
    const {data:application,error:applicationError}=await supabase.from('provider_applications').select('id,coverage_areas,status').eq('id',applicationId).maybeSingle();
    if(applicationError||!application)return NextResponse.json({error:'Provider application not found.'},{status:404});
    const {data:providerId,error:approvalError}=await supabase.rpc('approve_provider_application',{p_application_id:applicationId,p_public_slug:parsed.data.publicSlug,p_evidence:parsed.data.evidence});
    if(approvalError)return NextResponse.json({error:'Provider approval failed.',detail:approvalError.message},{status:409});
    const areas:Array<{area:string;status:string;verifiedProviders:number}>=[];
    for(const rawArea of application.coverage_areas||[]){
      const area=String(rawArea).trim().toUpperCase();
      if(!area)continue;
      const {data:coverageRows}=await supabase.from('provider_coverage').select('provider_id,providers!inner(verification_state)').eq('area',area).eq('active',true).eq('providers.verification_state','active');
      const verifiedProviders=coverageRows?.length||0;
      const {data:existing}=await supabase.from('service_areas').select('fill_rate,median_match_minutes').eq('vertical_id',electricalVertical.id).eq('area',area).maybeSingle();
      const fillRate=Number(existing?.fill_rate||0);
      const median=Number(existing?.median_match_minutes||0);
      const readiness=calculateAreaReadiness(area,verifiedProviders,fillRate,median,electricalVertical.launchThresholds);
      const {error:areaError}=await supabase.from('service_areas').upsert({vertical_id:electricalVertical.id,area,status:readiness.status,verified_providers:verifiedProviders,fill_rate:fillRate,median_match_minutes:median,updated_at:new Date().toISOString()},{onConflict:'vertical_id,area'});
      if(!areaError)areas.push({area,status:readiness.status,verifiedProviders});
    }
    return NextResponse.json({providerId,verification:'active',areas,message:'Provider verified. Public verification can now be active; service areas remain launch-gated by supply and performance thresholds.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to complete provider verification.'},{status:500});
  }
}
