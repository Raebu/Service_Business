import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {educationDiscoveryClassification,educationProspectSourceRole} from '@/lib/education-partnerships';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Uses Apollo zero-credit People Search, which returns no email addresses.
 *  Results remain research-only, without any automatic outbound eligibility.
 */
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(process.env.ENABLE_EDUCATION_DISCOVERY!=='true')return NextResponse.json({enabled:false,discovered:0});
  const key=process.env.APOLLO_API_KEY;
  if(!key)return NextResponse.json({error:'Apollo discovery credentials are not configured'},{status:503});
  try{
    const response=await fetch('https://api.apollo.io/api/v1/mixed_people/api_search',{
      method:'POST',headers:{'x-api-key':key,'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({
        person_titles:['Head of Employer Engagement','Head of Careers and Employability',
          'Director of Partnerships','Director of Apprenticeships'],
        person_locations:['United Kingdom'],per_page:25,page:1
      }),signal:AbortSignal.timeout(12_000),cache:'no-store'
    });
    if(!response.ok)return NextResponse.json({error:'Apollo lookup unavailable',status:response.status},{status:503});
    const payload=await response.json() as {
      people?:Array<{id?:string;title?:string;
        organization?:{name?:string;primary_domain?:string;website_url?:string}}>
    };
    const db=getAdminSupabase();
    let researched=0,rejected=0;
    for(const person of (payload.people||[]).slice(0,25)){
      const name=person.organization?.name?.trim()||'';
      const title=person.title||'';
      if(!person.id||!educationProspectSourceRole(title)||!educationDiscoveryClassification(name)){
        rejected++;continue;
      }
      // Apollo searches provide suggestions, NOT verified email, permission or enrollment.
      const {error}=await db.from('growth_education_discovery').upsert({
        source_reference:`apollo:person:${person.id}`,institution_name:name.slice(0,180),
        institution_domain:person.organization?.primary_domain?.toLowerCase()||null,
        suggested_role:title.slice(0,160),
        source_url:'https://api.apollo.io/api/v1/mixed_people/api_search'
      },{onConflict:'source_reference',ignoreDuplicates:true});
      if(error)return NextResponse.json({error:'Failed to preserve research evidence',researched},{status:503});
      researched++;
    }
    return NextResponse.json({enabled:true,researched,rejected,
      verifiedEmails:0,outboundTriggered:false,manualVerificationRequired:true});
  }catch{return NextResponse.json({error:'University discovery failed'},{status:503});}
}
