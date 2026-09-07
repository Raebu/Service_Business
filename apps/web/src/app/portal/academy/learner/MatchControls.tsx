'use client';

import { useState } from 'react';

export function LearnerMatchControls({matchId,status}:{matchId:string;status:string}){
  const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
  async function respond(action:'interested'|'reject'){
    setBusy(true);setMessage('');
    try{const response=await fetch(`/api/academy/matches/${matchId}/respond`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to update match.');if(response.ok)window.location.reload()}catch{setMessage('Unable to update match.')}finally{setBusy(false)}
  }
  if(['rejected','expired'].includes(status))return null;
  return <div className='mini-form'><div className='inline-actions'>{!['learner_interested','mutual'].includes(status)&&<button type='button' className='button primary' disabled={busy} onClick={()=>void respond('interested')}>I’m interested</button>}{status!=='mutual'&&<button type='button' className='button' disabled={busy} onClick={()=>void respond('reject')}>Not for me</button>}</div>{message&&<small>{message}</small>}</div>;
}
