import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getUserSupabase(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return null;
  const cookieStore=await cookies();
  return createServerClient(url,key,{cookies:{getAll(){return cookieStore.getAll()},setAll(items){try{for(const item of items)cookieStore.set(item.name,item.value,item.options)}catch{}}}});
}
