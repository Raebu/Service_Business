'use client';

import { useState } from 'react';

export function OpportunityControls({opportunityId,status}:{opportunityId:string;status:string}){
  const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
  async function setStatus(next:'open'|'paused'|'closed'){
    setBusy(true);setMessage('');
    try{const response=await fetch(`/api/provider/opportunities/${opportunityId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:next})});const data=await response.json().catch(()=>({}));setMessage(data.error||`Opportunity ${next}.`);if(response.ok)window.location.reload()}catch{setMessage('Unable to update opportunity.')}finally{setBusy(false)}
  }
  return <div className='mini-form'><div className='inline-actions'>{status!=='open'&&status!=='closed'&&<button type='button' className='button' disabled={busy} onClick={()=>void setStatus('open')}>Reopen</button>}{status==='open'&&<button type='button' className='button' disabled={busy} onClick={()=>void setStatus('paused')}>Pause</button>}{status!=='closed'&&<button type='button' className='button' disabled={busy} onClick={()=>void setStatus('closed')}>Close</button>}</div>{message&&<small>{message}</small>}</div>;
}
