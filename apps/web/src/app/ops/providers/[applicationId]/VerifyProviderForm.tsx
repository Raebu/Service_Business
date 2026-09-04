'use client';
import { FormEvent, useMemo, useState } from 'react';

type EvidenceDraft={kind:'business_identity'|'qualification'|'scheme_membership'|'insurance'|'other';label:string;reference:string;expiresAt:string};
const seed:EvidenceDraft[]=[
  {kind:'business_identity',label:'Business identity',reference:'',expiresAt:''},
  {kind:'insurance',label:'Public liability insurance',reference:'',expiresAt:''},
  {kind:'scheme_membership',label:'Scheme membership / qualification',reference:'',expiresAt:''}
];

export function VerifyProviderForm({applicationId,suggestedSlug}:{applicationId:string;suggestedSlug:string}){
  const [slug,setSlug]=useState(suggestedSlug);const [evidence,setEvidence]=useState(seed);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const valid=useMemo(()=>slug.length>=3&&evidence.every(e=>e.label.trim().length>=2),[slug,evidence]);
  function patch(index:number,key:keyof EvidenceDraft,value:string){setEvidence(current=>current.map((item,i)=>i===index?{...item,[key]:value}:item))}
  async function submit(event:FormEvent){event.preventDefault();if(!valid)return;setBusy(true);setMessage('');
    const response=await fetch(`/api/admin/providers/${applicationId}/verify`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publicSlug:slug,evidence})});
    const data=await response.json().catch(()=>({}));setMessage(response.ok?'Provider verified and coverage recalculated.':data.error||'Unable to verify provider.');setBusy(false);if(response.ok)setTimeout(()=>{window.location.href='/ops'},600);
  }
  return <form className='form-card' onSubmit={submit}><h2>Verification decision</h2><label>Public profile slug<input value={slug} onChange={e=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))}/></label>{evidence.map((item,index)=><fieldset key={item.kind}><legend>{item.kind.replaceAll('_',' ')}</legend><div className='form-grid'><label>Label<input value={item.label} onChange={e=>patch(index,'label',e.target.value)}/></label><label>Reference<input value={item.reference} onChange={e=>patch(index,'reference',e.target.value)} placeholder='Policy, scheme or document reference'/></label><label>Expiry date<input type='date' value={item.expiresAt} onChange={e=>patch(index,'expiresAt',e.target.value)}/></label></div></fieldset>)}<button className='button primary' disabled={busy||!valid}>{busy?'Verifying…':'Verify provider'}</button>{message&&<p className='form-message'>{message}</p>}</form>;
}
