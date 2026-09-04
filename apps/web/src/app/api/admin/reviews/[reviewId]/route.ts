import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({status:z.enum(['published','rejected'])});

export async function POST(request:Request,{params}:{params:Promise<{reviewId:string}>}){
  const admin=await getAdminSession();if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid review decision.'},{status:400});
  try{
    const {reviewId}=await params;const supabase=getAdminSupabase();const now=new Date().toISOString();
    const {data,error}=await supabase.from('reviews').update({moderation_status:parsed.data.status,published:parsed.data.status==='published',moderated_at:now,moderated_by:admin.user.id}).eq('id',reviewId).select('id,provider_id').maybeSingle();
    if(error||!data)return NextResponse.json({error:'Review not found or could not be moderated.'},{status:404});
    await supabase.rpc('refresh_provider_quality',{p_provider_id:data.provider_id});
    await supabase.from('audit_events').insert({actor_user_id:admin.user.id,event_type:`review.${parsed.data.status}`,entity_type:'review',entity_id:reviewId,metadata:{providerId:data.provider_id}});
    return NextResponse.json({ok:true,reviewId,status:parsed.data.status});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to moderate review.'},{status:500});
  }
}
