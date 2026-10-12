import {NextResponse} from 'next/server';
import {z} from 'zod';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {educationInstitutionTypes,partnershipInterests,qualifyEducationCandidate} from '@/lib/education-partnerships';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const input=z.object({
  candidates:z.array(z.object({
    name:z.string().trim().min(3).max(180),
    domain:z.string().trim().toLowerCase().max(180),
    institutionType:z.enum(educationInstitutionTypes),
    sourceReference:z.string().min(5).max(250),
    sourceUrl:z.string().url().max(800),
    interests:z.array(z.enum(partnershipInterests)).max(10),
    region:z.string().trim().max(150).optional()
  })).min(1).max(25)
});
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  const parsed=input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success||parsed.data.candidates.some(p=>!qualifyEducationCandidate(p)))
    return NextResponse.json({error:'Institution research data is incomplete'},{status:400});
  try{
    const db=getAdminSupabase();
    const imported:string[]=[];
    for(const p of parsed.data.candidates){
      const {data,error}=await db.rpc('import_education_partnership_candidate',{
        p_name:p.name,p_domain:p.domain,p_source_reference:p.sourceReference,
        p_source_url:p.sourceUrl,p_type:p.institutionType,
        p_interests:p.interests,p_region:p.region||null
      });
      if(error||!data)return NextResponse.json({error:'Candidate import requires reconciliation',imported:imported.length},{status:503});
      imported.push(data);
    }
    return NextResponse.json({researchRecords:imported.length,
      sendEligible:0,outboundTriggered:false,reviewRequired:true},{status:201});
  }catch{return NextResponse.json({error:'Institution intake failed'},{status:503});}
}
