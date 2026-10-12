import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {canRunWorkflow,isRunSuccess,isWorkflowKind} from '@/lib/autonomy';
import {handlers} from '@/lib/autonomy-handlers';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Each tick claims at most one workflow to stay within serverless execution limits.
 *  RPC lease_token prevents a stale attempt committing someone else's result.
 */
export async function POST(request:Request){
 if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
 if(process.env.AUTONOMY_KERNEL_ENABLED!=='true')
   return NextResponse.json({enabled:false,claimed:0},{headers:{'cache-control':'no-store'}});
 try{
  const db=getAdminSupabase();
  const {data:claimed,error}=await db.rpc('autonomy_claim',{p_limit:1});
  if(error)return NextResponse.json({error:'Unable to lease workflow'},{status:503});
  if(!claimed?.length)return NextResponse.json({enabled:true,claimed:0});
  const item=claimed[0] as {id:string;kind:string;lease_token:string;attempt:number;domain:string};
  let success=false,errorCode:string|null=null;
  if(!isWorkflowKind(item.kind)||!canRunWorkflow(item.kind,process.env)){
    errorCode='execution_policy_denied';
  }else{
    try{
      const handler=handlers[item.kind];
      const next=new Request(new URL(handler.path,request.url),{
        method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}
      });
      const response=await handler.run(next);
      success=isRunSuccess(response.status);
      if(!success)errorCode=`worker_http_${response.status}`;
    }catch{
      // Never persist details from a provider/customer request in job audit metadata.
      errorCode='worker_exception';
    }
  }
  const {data:finished,error:finishError}=await db.rpc('autonomy_finish',{
    p_id:item.id,p_lease_token:item.lease_token,p_success:success,
    p_error_code:errorCode
  });
  if(finishError||finished!==true)
    return NextResponse.json({error:'Execution result could not be reconciled',workflowId:item.id},{status:503});
  return NextResponse.json({enabled:true,claimed:1,
    workflowId:item.id,kind:item.kind,attempt:item.attempt,
    succeeded:success,errorCode:success?null:errorCode
  },{status:success?200:503,headers:{'cache-control':'no-store'}});
 }catch{return NextResponse.json({error:'Autonomy worker unavailable'},{status:503});}
}
