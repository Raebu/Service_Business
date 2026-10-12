import {getUserSupabase} from '@/lib/supabase/server';

/** Only app_metadata set by privileged Supabase admins can grant this permission. */
export async function isAutonomyAdmin(){
 const client=await getUserSupabase();
 if(!client)return false;
 const {data:{user},error}=await client.auth.getUser();
 return !error&&user?.app_metadata?.service_business_autonomy_admin===true;
}
