import {NextResponse} from 'next/server';
import {getUserSupabase} from '@/lib/supabase/server';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Human-only campaign approval. Supabase app_metadata is admin-managed;
 *  client-modifiable profile.default_role and user_metadata never grant approval.
 */
export async function POST(_request:Request,{params}:{params:Promise<{campaignId:string}>}){
  const supabase=await getUserSupabase();
  if(!supabase)return NextResponse.json({error:'Authentication required'},{status:401});
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
  if(user.app_metadata?.service_business_growth_admin!==true)
    return NextResponse.json({error:'Growth administrator permission required'},{status:403});
  const {campaignId}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(campaignId))return NextResponse.json({error:'Invalid campaign'},{status:400});
  try{
    const db=getAdminSupabase();
    const {data,error}=await db.from('growth_campaigns')
      .update({status:'approved',approved_at:new Date().toISOString(),approved_by:user.id})
      .eq('id',campaignId).in('status',['draft','paused'])
      .select('id,workstream,status').maybeSingle();
    if(error)return NextResponse.json({error:'Unable to approve campaign'},{status:503});
    if(!data)return NextResponse.json({error:'Campaign is missing or not eligible for approval'},{status:409});
    return NextResponse.json({campaign:data,approvedByAuthenticatedAdmin:true,
      sendingActivated:false,marketingReviewResponsibility:'human'});
  }catch{return NextResponse.json({error:'Approval unavailable'},{status:503});}
}
