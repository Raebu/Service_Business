import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase/server';

export async function GET(request:Request){
  const url=new URL(request.url);
  const code=url.searchParams.get('code');
  const next=url.searchParams.get('next')||'/account';
  if(code){
    const supabase=await getUserSupabase();
    if(supabase){
      const {error}=await supabase.auth.exchangeCodeForSession(code);
      if(!error)return NextResponse.redirect(new URL(next,url.origin));
    }
  }
  return NextResponse.redirect(new URL('/account?error=signin',url.origin));
}
