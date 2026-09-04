import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/admin';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

const schema=z.object({state:z.enum(['active','suspended','expired','revoked']),reason:z.string().trim().min(5).max(1000)});

export async function POST(request:Request,{params}:{params:Promise<{providerId:string}>}){
  const admin=await getAdminSession();
  if(!admin)return NextResponse.json({error:'Admin access required.'},{status:403});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'A valid provider state and reason are required.'},{status:400});
  try{
    const {providerId}=await params;
    const supabase=getAdminSupabase();
    const {error}=await supabase.rpc('set_provider_status',{p_provider_id:providerId,p_new_state:parsed.data.state,p_reason:parsed.data.reason,p_actor_user_id:admin.user.id});
    if(error)return NextResponse.json({error:'Unable to change provider status.',detail:error.message},{status:409});
    return NextResponse.json({ok:true,providerId,state:parsed.data.state});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to change provider status.'},{status:500});
  }
}
