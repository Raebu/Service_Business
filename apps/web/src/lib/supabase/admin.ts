import { createClient } from '@supabase/supabase-js';

export class SupabaseConfigurationError extends Error{
  constructor(){super('Supabase server credentials are not configured.');this.name='SupabaseConfigurationError'}
}

export function getAdminSupabase(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new SupabaseConfigurationError();
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
