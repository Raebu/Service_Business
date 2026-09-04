'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SignOutButton(){
  const[busy,setBusy]=useState(false);
  const router=useRouter();
  async function signOut(){
    setBusy(true);
    const supabase=getBrowserSupabase();
    if(supabase)await supabase.auth.signOut();
    router.refresh();
    setBusy(false);
  }
  return <button className='button' onClick={signOut} disabled={busy}>{busy?'Signing out…':'Sign out'}</button>
}
