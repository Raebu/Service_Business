import {NextResponse} from 'next/server';
import {z} from 'zod';
import {isAutonomyAdmin} from '@/lib/autonomy-admin';
import {getAdminSupabase} from '@/lib/supabase/admin';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({
 domain:z.enum(['operations','communications','growth','partnerships','finance','assurance']),
 enabled:z.boolean(),
 confirmation:z.string().optional()
}).strict();
export async function POST(request:Request){
 if(!await isAutonomyAdmin())return NextResponse.json({error:'Forbidden'},{status:403});
 const input=schema.safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid control operation'},{status:400});
 const {domain,enabled,confirmation}=input.data;
 if(enabled&&confirmation!==`ENABLE_${domain.toUpperCase()}`)
   return NextResponse.json({error:'Explicit enable confirmation required'},{status:400});
 // Enabling a domain never overrides per-worker deployment flags or marketing controls.
 try{
  const db=getAdminSupabase();
  const {data,error}=await db.from('autonomy_controls').update({
    enabled,updated_at:new Date().toISOString()
  }).eq('domain',domain).select('domain,enabled').single();
  if(error)return NextResponse.json({error:'Unable to change control'},{status:503});
  return NextResponse.json({control:data,
    kernelActive:process.env.AUTONOMY_KERNEL_ENABLED==='true',
    otherFeatureGatesPreserved:true});
 }catch{return NextResponse.json({error:'Control update unavailable'},{status:503});}
}
