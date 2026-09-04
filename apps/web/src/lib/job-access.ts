import { createHash,timingSafeEqual } from 'node:crypto';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getUserSupabase } from '@/lib/supabase/server';

const digest=(token:string)=>createHash('sha256').update(token).digest();

export async function customerMayAccessJob(jobId:string,token?:string|null){
  const admin=getAdminSupabase();
  const {data:job}=await admin.from('jobs').select('id,customer_user_id,customer_access_token_hash').eq('id',jobId).maybeSingle();
  if(!job)return false;
  const userSupabase=await getUserSupabase();
  if(userSupabase){
    const {data:{user}}=await userSupabase.auth.getUser();
    if(user&&job.customer_user_id===user.id)return true;
  }
  if(!token||!job.customer_access_token_hash)return false;
  const supplied=digest(token);
  const expected=Buffer.from(job.customer_access_token_hash,'hex');
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
