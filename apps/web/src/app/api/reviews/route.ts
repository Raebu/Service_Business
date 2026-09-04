import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';

const schema=z.object({jobId:z.string().uuid(),rating:z.number().int().min(1).max(5),review:z.string().trim().max(3000).optional()});

export async function POST(request:Request){
  const supabase=await getUserSupabase();
  if(!supabase)return NextResponse.json({error:'Authentication is not configured.'},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'A completed job and rating from 1 to 5 are required.'},{status:400});
  const {data:job}=await supabase.from('jobs').select('id,status,matched_provider_id,customer_user_id').eq('id',parsed.data.jobId).maybeSingle();
  if(!job||job.customer_user_id!==user.id)return NextResponse.json({error:'Job not found.'},{status:404});
  if(job.status!=='completed'||!job.matched_provider_id)return NextResponse.json({error:'Reviews can only be left after a completed matched job.'},{status:409});
  const {data,error}=await supabase.from('reviews').insert({job_id:job.id,provider_id:job.matched_provider_id,customer_user_id:user.id,rating:parsed.data.rating,review:parsed.data.review||null,published:false}).select('id').single();
  if(error)return NextResponse.json({error:'Unable to save review.',detail:error.message},{status:409});
  return NextResponse.json({ok:true,reviewId:data.id,message:'Thanks. Your review has been received and will be checked before publication.'});
}
