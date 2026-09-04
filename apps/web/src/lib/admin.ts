import { getUserSupabase } from '@/lib/supabase/server';

export async function getAdminSession(){
  const supabase=await getUserSupabase();
  if(!supabase)return null;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data:profile}=await supabase.from('profiles').select('default_role').eq('id',user.id).maybeSingle();
  if(profile?.default_role!=='admin')return null;
  return {user,supabase};
}
