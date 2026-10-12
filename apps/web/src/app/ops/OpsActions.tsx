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

export function FinanceExceptionActions({exceptionId}:{exceptionId:string}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function finalise(status:'resolved'|'ignored'){
    const reason=window.prompt(status==='resolved'?'Resolution reason / evidence':'Why is this exception safe to ignore?');
    if(!reason||reason.trim().length<3)return;
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/finance/reconciliation-exceptions/${exceptionId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status,reason})});
    const data=await res.json().catch(()=>({}));setMessage(res.ok?(data.message||'Finance exception updated.'):data.error||'Unable to update finance exception.');setBusy(false);if(res.ok)window.location.reload();
  }
  return <div className='inline-actions'><button className='button' disabled={busy} onClick={()=>finalise('resolved')}>Mark resolved</button><button className='button danger' disabled={busy} onClick={()=>finalise('ignored')}>Ignore with reason</button>{message&&<small>{message}</small>}</div>;
}


export function CaseActions({caseId,status,policies}:{caseId:string;status:string;policies:Array<{code:string;label:string;action:string}>}){
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  async function resolveCase(){
    const resolution=window.prompt('Resolution details');
    if(!resolution||resolution.trim().length<8)return;
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/cases/${caseId}/resolve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resolution})});
    const data=await res.json().catch(()=>({}));
    setMessage(res.ok?'Case resolved.':data.error||'Unable to resolve case.');
    setBusy(false);
    if(res.ok)window.location.reload();
  }
  async function automate(){
    if(!policies.length)return;
    const choices=policies.map(policy=>`${policy.code} — ${policy.label}`).join('\n');
    const policyCode=window.prompt(`Choose an approved recovery policy by code:\n\n${choices}`,policies[0].code);
    if(!policyCode)return;
    const selected=policies.find(policy=>policy.code===policyCode.trim());
    if(!selected){setMessage('Choose one of the listed recovery policy codes.');return;}
    let refundPence:number|undefined;
    if(selected.action==='refund_partial'){
      const pounds=window.prompt('Partial refund amount in pounds, e.g. 25.00');
      if(!pounds)return;
      const parsed=Math.round(Number(pounds)*100);
      if(!Number.isFinite(parsed)||parsed<=0){setMessage('Enter a valid positive refund amount.');return;}
      refundPence=parsed;
    }
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/cases/${caseId}/automate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({policyCode:selected.code,...(refundPence?{refundPence}:{})})});
    const data=await res.json().catch(()=>({}));
    setMessage(res.ok?`Recovery queued: ${data.action||selected.action}.`:data.error||'Unable to queue recovery automation.');
    setBusy(false);
    if(res.ok)window.location.reload();
  }
  async function evidence(){
    setBusy(true);setMessage('');
    const res=await fetch(`/api/admin/cases/${caseId}/evidence-bundle`,{cache:'no-store'});
    if(!res.ok){const data=await res.json().catch(()=>({}));setMessage(data.error||'Unable to generate evidence bundle.');setBusy(false);return;}
    const data=await res.json();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download=`case-${caseId}-evidence.json`;link.click();
    URL.revokeObjectURL(url);setBusy(false);
  }
  const closed=status==='resolved'||status==='closed';
  return <div className='inline-actions'><button className='button' disabled={busy} onClick={evidence}>Evidence bundle</button>{!closed&&policies.length>0&&<button className='button' disabled={busy} onClick={automate}>Queue approved recovery</button>}{!closed&&<button className='button' disabled={busy} onClick={resolveCase}>Resolve case</button>}{message&&<small>{message}</small>}</div>;
}
