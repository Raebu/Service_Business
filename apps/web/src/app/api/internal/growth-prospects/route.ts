import {NextResponse} from 'next/server';
import {z} from 'zod';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {outreachWorkstreams} from '@/lib/growth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const item=z.object({
  workstream:z.enum(outreachWorkstreams),
  organisationName:z.string().min(2).max(180),
  domain:z.string().toLowerCase().trim().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
  sourceReference:z.string().trim().min(5).max(250),
  sourceUrl:z.string().url().max(800),
  contactName:z.string().trim().max(160).optional(),
  contactRole:z.string().trim().max(120).optional(),
  directEmail:z.string().email().toLowerCase().optional(),
  area:z.string().trim().max(12).optional(),
  serviceKey:z.string().trim().max(120).optional()
});
const inputSchema=z.object({prospects:z.array(item).min(1).max(25)});

/** Import qualified research candidates only. Verification, legality and approval happen separately. */
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  try{
    const parsed=inputSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Invalid prospect batch'},{status:400});
    const db=getAdminSupabase();
    const outcomes:Array<{sourceReference:string;status:'created'|'duplicate'|'rejected'}>=[];
    for(const p of parsed.data.prospects){
      if(p.directEmail && (p.directEmail.split('@')[1]!==p.domain||
        /^(info|hello|contact|enquiries|enquiry|support|sales|office|admin)@/i.test(p.directEmail))){
        outcomes.push({sourceReference:p.sourceReference,status:'rejected'});continue;
      }
      const {data:existing,error:findError}=await db.from('growth_outreach_queue')
        .select('id').eq('workstream',p.workstream).eq('source_reference',p.sourceReference).limit(1).maybeSingle();
      if(findError)return NextResponse.json({error:'Unable to deduplicate prospects'},{status:503});
      if(existing){outcomes.push({sourceReference:p.sourceReference,status:'duplicate'});continue;}
      const {error}=await db.from('growth_outreach_queue').insert({
        workstream:p.workstream,organisation_name:p.organisationName,domain:p.domain,
        source_reference:p.sourceReference,source_url:p.sourceUrl,
        contact_name:p.contactName||null,contact_role:p.contactRole||null,
        direct_email:p.directEmail||null,area:p.area||null,service_key:p.serviceKey||null,
        status:'discovered',email_verified:false,domain_matched:false,
        company_type:'unknown',lawful_basis:'unassessed',
        notes:'Candidate only. Contact verification, GDPR assessment and approved campaign required.'
      });
      if(error)return NextResponse.json({error:'Unable to store prospect'},{status:503});
      outcomes.push({sourceReference:p.sourceReference,status:'created'});
    }
    return NextResponse.json({imported:outcomes.filter(x=>x.status==='created').length,
      duplicates:outcomes.filter(x=>x.status==='duplicate').length,
      rejected:outcomes.filter(x=>x.status==='rejected').length,outcomes});
  }catch{return NextResponse.json({error:'Unable to import prospects'},{status:503});}
}
