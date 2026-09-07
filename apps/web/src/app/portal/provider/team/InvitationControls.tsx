'use client';

import { useState } from 'react';

export function InvitationControls({engineerId}:{engineerId:string}){
  const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
  async function resend(){
    setBusy(true);setMessage('Resending invitation…');
    try{const response=await fetch(`/api/provider/engineers/${engineerId}/invitation`,{method:'POST'});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to resend invitation.')}catch{setMessage('Unable to resend invitation.')}finally{setBusy(false)}
  }
  async function revoke(){
    if(!window.confirm('Revoke this pending team invitation? The person will not be attached to this business unless invited again.'))return;
    setBusy(true);setMessage('Revoking invitation…');
    try{const response=await fetch(`/api/provider/engineers/${engineerId}/invitation`,{method:'DELETE'});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to revoke invitation.');if(response.ok)window.location.reload()}catch{setMessage('Unable to revoke invitation.')}finally{setBusy(false)}
  }
  return <div className='mini-form'><strong>Pending login invitation</strong><p className='form-help'>Resend the secure account invitation or revoke this unlinked team record. Revocation is blocked once a login or job history exists.</p><div className='inline-actions'><button className='button' type='button' disabled={busy} onClick={()=>void resend()}>Resend invitation</button><button className='button' type='button' disabled={busy} onClick={()=>void revoke()}>Revoke invitation</button></div>{message&&<small>{message}</small>}</div>;
}
