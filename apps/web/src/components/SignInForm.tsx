'use client';

import { FormEvent,useState } from 'react';
import { getBrowserSupabase } from '@/lib/supabase/browser';

export function SignInForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const email=String(form.get('email')||'').trim();
    const supabase=getBrowserSupabase();
    if(!supabase){setMessage('Account sign-in is not connected to the production authentication service yet.');setBusy(false);return}
    const redirectTo=`${window.location.origin}/auth/callback`;
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
    setMessage(error?error.message:'Check your email for a secure sign-in link.');
    setBusy(false);
  }
  return <form className='form-card account-signin' onSubmit={submit}><h2>Sign in securely</h2><p>Use the email associated with your customer, electrical business or corporate account.</p><label>Email<input type='email' name='email' required autoComplete='email'/></label><button className='button primary' disabled={busy}>{busy?'Sending…':'Email me a secure sign-in link'}</button>{message&&<p className='form-message' role='status'>{message}</p>}<p className='form-help'>No password is required. Your account type determines which workspace and records you can access.</p></form>
}
