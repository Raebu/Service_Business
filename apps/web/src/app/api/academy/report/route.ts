import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const esc=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;

export async function GET(request:Request){
  const url=new URL(request.url);const organisation=url.searchParams.get('organisation');
  if(!organisation)return NextResponse.json({error:'organisation is required'},{status:400});
  const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const [{data:membership},{data:org}]=await Promise.all([
    userDb.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle(),
    userDb.from('organisations').select('id,kind').eq('id',organisation).maybeSingle()
  ]);
  if(!membership||org?.kind!=='education_provider')return NextResponse.json({error:'Access denied.'},{status:403});
  try{
    const admin=getAdminSupabase();
    const {data:learners,error:learnerError}=await admin.from('learners').select('id,display_name,email,postcode,age_band,travel_radius_km,current_stage,desired_skills,status').eq('education_organisation_id',organisation).order('display_name');
    if(learnerError)return NextResponse.json({error:'Unable to load learners.'},{status:500});
    const learnerIds=(learners||[]).map(l=>l.id);
    const [{data:placements},{data:consents},{data:events}]=learnerIds.length?await Promise.all([
      admin.from('placements').select('id,learner_id,provider_id,placement_type,status,starts_on,ends_on,completed_hours,agreed_hours').in('learner_id',learnerIds),
      admin.from('learner_consents').select('learner_id,consent_type,granted,captured_at,withdrawn_at').in('learner_id',learnerIds).order('captured_at',{ascending:false}),
      admin.from('competency_events').select('learner_id,skill_key,hours,observed_level,supervisor_verified,occurred_on').in('learner_id',learnerIds)
    ]):[{data:[]},{data:[]},{data:[]}];
    const providerIds=[...new Set((placements||[]).map(p=>p.provider_id).filter(Boolean))];
    const {data:providers}=providerIds.length?await admin.from('providers').select('id,organisation_id').in('id',providerIds):{data:[]};
    const orgIds=[...new Set((providers||[]).map(p=>p.organisation_id).filter(Boolean))];
    const {data:providerOrgs}=orgIds.length?await admin.from('organisations').select('id,name').in('id',orgIds):{data:[]};
    const providerMap=new Map((providers||[]).map(p=>[p.id,p]));const orgMap=new Map((providerOrgs||[]).map(o=>[o.id,o]));
    const currentConsent=(learnerId:string,type:string)=>{const row=(consents||[]).find(c=>c.learner_id===learnerId&&c.consent_type===type);return Boolean(row?.granted&&!row.withdrawn_at)};
    const header=['learner_name','email','postcode','age_band','stage','status','travel_radius_km','desired_skills','placement_status','placement_type','employer','starts_on','ends_on','agreed_hours','completed_hours','verified_competencies','verified_competency_hours','placement_matching_consent','employer_sharing_consent','evidence_recording_consent','guardian_approval'];
    const rows=[header.join(',')];
    for(const learner of learners||[]){
      const placement=(placements||[]).filter(p=>p.learner_id===learner.id).sort((a,b)=>String(b.starts_on||'').localeCompare(String(a.starts_on||'')))[0];
      const provider=placement?providerMap.get(placement.provider_id):undefined;const employer=provider?orgMap.get(provider.organisation_id)?.name:'';
      const verified=(events||[]).filter(e=>e.learner_id===learner.id&&e.supervisor_verified===true);
      const skills=[...new Set(verified.map(e=>e.skill_key).filter(Boolean))];const verifiedHours=verified.reduce((sum,e)=>sum+Number(e.hours||0),0);
      rows.push([learner.display_name,learner.email,learner.postcode,learner.age_band,learner.current_stage,learner.status,learner.travel_radius_km,(learner.desired_skills||[]).join('; '),placement?.status||'',placement?.placement_type||'',employer,placement?.starts_on||'',placement?.ends_on||'',placement?.agreed_hours||'',placement?.completed_hours||0,skills.join('; '),verifiedHours.toFixed(1),currentConsent(learner.id,'placement_matching'),currentConsent(learner.id,'employer_sharing'),currentConsent(learner.id,'evidence_recording'),currentConsent(learner.id,'guardian_approval')].map(esc).join(','));
    }
    return new NextResponse(rows.join('\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="academy-placement-report-${organisation}.csv"`,'cache-control':'no-store'}});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to generate Academy report.'},{status:500});
  }
}
