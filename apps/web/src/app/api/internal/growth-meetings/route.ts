import {NextResponse} from 'next/server';
import {z} from 'zod';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {outreachWorkstreams} from '@/lib/growth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const schema=z.object({
  prospectId:z.string().uuid().optional(),
  workstream:z.enum(outreachWorkstreams),
  contactName:z.string().trim().min(2).max(160),
  email:z.string().email().toLowerCase(),
  purpose:z.string().trim().min(10).max(1000),
  proposedStart:z.string().datetime({offset:true}).optional()
});

/** This registers a request, not a confirmed calendar booking. */
export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  try{
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Invalid meeting request'},{status:400});
    const p=parsed.data,db=getAdminSupabase();
    if(p.prospectId){
      const {data,error}=await db.from('growth_outreach_queue')
        .select('id,workstream').eq('id',p.prospectId).maybeSingle();
      if(error||!data||data.workstream!==p.workstream)
        return NextResponse.json({error:'Prospect could not be verified'},{status:409});
    }
    const {data:meeting,error}=await db.from('growth_meeting_requests').insert({
      prospect_id:p.prospectId||null,workstream:p.workstream,contact_name:p.contactName,
      email:p.email,purpose:p.purpose,proposed_start:p.proposedStart||null,status:'needs_review'
    }).select('id,status').single();
    if(error)return NextResponse.json({error:'Meeting request unavailable'},{status:503});
    return NextResponse.json({request:meeting,calendarBooked:false,humanApprovalRequired:true},{status:201});
  }catch{return NextResponse.json({error:'Meeting request failed'},{status:503});}
}
