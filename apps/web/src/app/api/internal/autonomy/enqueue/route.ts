import {NextResponse} from 'next/server';
import {z} from 'zod';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {workflowDomains} from '@/lib/autonomy';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const kindValues=Object.keys(workflowDomains) as [keyof typeof workflowDomains,...Array<keyof typeof workflowDomains>];
const schema=z.object({
 kind:z.enum(kindValues),
 idempotencyKey:z.string().min(5).max(180).regex(/^[A-Za-z0-9:._-]+$/),
 availableAt:z.string().datetime({offset:true}).optional()
}).strict();
export async function POST(request:Request){
 if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Invalid workflow request'},{status:400});
 if(parsed.data.availableAt&&Date.parse(parsed.data.availableAt)>Date.now()+90*86400000)
   return NextResponse.json({error:'Scheduling horizon exceeded'},{status:400});
 try{
  const db=getAdminSupabase();
  const {data,error}=await db.rpc('autonomy_enqueue',{
    p_kind:parsed.data.kind,p_idempotency_key:parsed.data.idempotencyKey,
    p_payload:{},p_available_at:parsed.data.availableAt||new Date().toISOString()
  });
  if(error||!data)return NextResponse.json({error:'Unable to enqueue workflow'},{status:503});
  return NextResponse.json({id:data,kind:parsed.data.kind,queued:true,
    liveExecutionTriggered:false},{status:202});
 }catch{return NextResponse.json({error:'Autonomy queue unavailable'},{status:503});}
}
