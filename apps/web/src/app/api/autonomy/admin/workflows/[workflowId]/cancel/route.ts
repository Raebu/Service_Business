import {NextResponse} from 'next/server';
import {isAutonomyAdmin} from '@/lib/autonomy-admin';
import {getAdminSupabase} from '@/lib/supabase/admin';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(_request:Request,{params}:{params:Promise<{workflowId:string}>}){
 if(!await isAutonomyAdmin())return NextResponse.json({error:'Forbidden'},{status:403});
 const {workflowId}=await params;
 if(!uuid.test(workflowId))return NextResponse.json({error:'Invalid workflow ID'},{status:400});
 try{
  const db=getAdminSupabase();
  const {data,error}=await db.rpc('autonomy_cancel',{p_id:workflowId});
  if(error)return NextResponse.json({error:'Workflow cancellation unavailable'},{status:503});
  if(!data)return NextResponse.json({error:'Only queued, unclaimed work can be cancelled'},{status:409});
  return NextResponse.json({cancelled:true,id:workflowId});
 }catch{return NextResponse.json({error:'Cancellation unavailable'},{status:503});}
}
