import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';

export type OrganisationCapability='manage_team'|'manage_pricing'|'manage_finance'|'dispatch_jobs'|'view_team_schedule'|'view_own_jobs'|'update_own_job_progress'|'share_live_location'|'manage_payouts';

export async function requireOrganisationCapability(organisationId:string,capability:OrganisationCapability){
  const userDb=await getUserSupabase();if(!userDb)return null;
  const {data:{user}}=await userDb.auth.getUser();if(!user)return null;
  const {data:membership}=await userDb.from('organisation_members').select('role').eq('organisation_id',organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership)return null;
  const admin=getAdminSupabase();
  const {data:permission}=await admin.from('role_capabilities').select('allowed').eq('role',membership.role).eq('capability',capability).maybeSingle();
  if(!permission?.allowed)return null;
  return{user,userDb,role:membership.role};
}
