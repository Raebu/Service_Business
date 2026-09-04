'use client';
import { useState } from 'react';

export function ProviderStatusActions({providerId,state}:{providerId:string;state:string}){
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function change(next:'active'|'suspended'){
    const reason=window.prompt(next==='suspended'?'Reason for suspending this provider':'Reason for reactivating this provider');
    if(!reason)return;
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/providers/${providerId}/status`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({state:next,reason})});
    const data=await res.json().catch(()=>({}));setMessage(res.ok?`Provider ${next}.`:data.error||'Unable to update provider.');setBusy(false);
    if(res.ok)window.location.reload();
  }
  return <div className='inline-actions'>{state==='active'?<button className='button danger' disabled={busy} onClick={()=>change('suspended')}>Suspend</button>:<button className='button' disabled={busy} onClick={()=>change('active')}>Reactivate</button>}{message&&<small>{message}</small>}</div>;
}

export function ConvertBusinessAction({enquiryId}:{enquiryId:string}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function convert(){setBusy(true);const res=await fetch(`/api/admin/business/${enquiryId}/convert`,{method:'POST'});const data=await res.json().catch(()=>({}));setMessage(res.ok?'Converted to business account.':data.error||'Unable to convert.');setBusy(false);if(res.ok)window.location.reload()}
  return <div className='inline-actions'><button className='button' disabled={busy} onClick={convert}>{busy?'Converting…':'Create business account'}</button>{message&&<small>{message}</small>}</div>;
}

export function EvidenceActions({evidenceId}:{evidenceId:string}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function decide(status:'verified'|'rejected'){
    const reason=status==='rejected'?window.prompt('Reason for rejecting this evidence')||'':undefined;
    if(status==='rejected'&&!reason)return;
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/evidence/${evidenceId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status,reason})});
    const data=await res.json().catch(()=>({}));setMessage(res.ok?`Evidence ${status}.`:data.error||'Unable to update evidence.');setBusy(false);if(res.ok)window.location.reload();
  }
  async function openFile(){setBusy(true);const res=await fetch(`/api/admin/evidence/${evidenceId}`);const data=await res.json().catch(()=>({}));setBusy(false);if(res.ok&&data.url)window.open(data.url,'_blank','noopener,noreferrer');else setMessage(data.error||'No file available.');}
  return <div className='inline-actions'><button className='button' disabled={busy} onClick={openFile}>View file</button><button className='button' disabled={busy} onClick={()=>decide('verified')}>Verify</button><button className='button danger' disabled={busy} onClick={()=>decide('rejected')}>Reject</button>{message&&<small>{message}</small>}</div>;
}
