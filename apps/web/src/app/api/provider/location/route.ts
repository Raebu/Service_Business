import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const updateSchema=z.object({
  engineerId:z.string().uuid(),
  latitude:z.coerce.number().min(-90).max(90),
  longitude:z.coerce.number().min(-180).max(180),
  accuracyMeters:z.coerce.number().min(0).max(10000).optional(),
  ttlSeconds:z.coerce.number().int().min(60).max(900).default(300)
});
const stopSchema=z.object({engineerId:z.string().uuid()});

async function authorisedEngineer(engineerId:string){
  const supabase=await getUserSupabase();if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return null;
  const {data:engineer}=await supabase.from('engineers').select('id,organisation_id,user_id').eq('id',engineerId).maybeSingle();
  if(!engineer)return null;
  if(engineer.user_id===user.id)return{user,engineer};
  const {data:membership}=await supabase.from('organisation_members').select('role').eq('organisation_id',engineer.organisation_id).eq('user_id',user.id).maybeSingle();
  if(membership&&['owner','admin','manager','dispatcher'].includes(membership.role))return{user,engineer};
  return null;
}

export async function POST(request:Request){
  const parsed=updateSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Invalid location update.'},{status:400});
  const auth=await authorisedEngineer(parsed.data.engineerId);if(!auth)return NextResponse.json({error:'Engineer access required.'},{status:403});
  try{
    const admin=getAdminSupabase();
    let {data:session}=await admin.from('engineer_location_sessions').select('id').eq('engineer_id',parsed.data.engineerId).eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle();
    if(!session){
      const created=await admin.from('engineer_location_sessions').insert({engineer_id:parsed.data.engineerId,started_by:auth.user.id,status:'active'}).select('id').single();
      if(created.error||!created.data)return NextResponse.json({error:'Unable to start location sharing.'},{status:500});session=created.data;
    }
    const now=new Date();const expires=new Date(now.getTime()+parsed.data.ttlSeconds*1000);
    const {error}=await admin.from('engineer_live_locations').upsert({engineer_id:parsed.data.engineerId,session_id:session.id,latitude:parsed.data.latitude,longitude:parsed.data.longitude,accuracy_meters:parsed.data.accuracyMeters??null,captured_at:now.toISOString(),expires_at:expires.toISOString(),updated_at:now.toISOString()},{onConflict:'engineer_id'});
    if(error)return NextResponse.json({error:'Unable to update live location.'},{status:500});
    await admin.from('engineers').update({live_latitude:parsed.data.latitude,live_longitude:parsed.data.longitude,location_updated_at:now.toISOString(),available_now:true,updated_at:now.toISOString()}).eq('id',parsed.data.engineerId);
    return NextResponse.json({active:true,expiresAt:expires.toISOString(),message:'Live location is active only for this availability session.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to update live location.'},{status:500});
  }
}

export async function DELETE(request:Request){
  const parsed=stopSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid location request.'},{status:400});
  const auth=await authorisedEngineer(parsed.data.engineerId);if(!auth)return NextResponse.json({error:'Engineer access required.'},{status:403});
  try{
    const admin=getAdminSupabase();const now=new Date().toISOString();
    await admin.from('engineer_location_sessions').update({status:'ended',ended_at:now}).eq('engineer_id',parsed.data.engineerId).eq('status','active');
    await admin.from('engineer_live_locations').delete().eq('engineer_id',parsed.data.engineerId);
    await admin.from('engineers').update({live_latitude:null,live_longitude:null,location_updated_at:null,available_now:false,updated_at:now}).eq('id',parsed.data.engineerId);
    return NextResponse.json({active:false,message:'Live location sharing stopped and the latest precise location was deleted.'});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to stop location sharing.'},{status:500});
  }
}
