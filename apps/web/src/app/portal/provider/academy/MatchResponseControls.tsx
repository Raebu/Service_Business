'use client';

import { useState } from 'react';

export function MatchResponseControls({matchId,status}:{matchId:string;status:string}){
  const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
  async function respond(action:'interested'|'reject'){
    setBusy(true);setMessage('');
    try{const response=await fetch(`/api/academy/matches/${matchId}/respond`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to update match.');if(response.ok)window.location.reload()}catch{setMessage('Unable to update match.')}finally{setBusy(false)}
  }
  if(['rejected','expired'].includes(status))return null;
  return <div className='mini-form'><div className='inline-actions'>{!['employer_interested','mutual'].includes(status)&&<button className='button primary' type='button' disabled={busy} onClick={()=>void respond('interested')}>Interested</button>} {status!=='mutual'&&<button className='button' type='button' disabled={busy} onClick={()=>void respond('reject')}>Decline match</button>}</div>{message&&<small>{message}</small>}</div>;
}
