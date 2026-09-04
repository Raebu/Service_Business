'use client';
import { FormEvent, useState } from 'react';

export function EvidenceUploadForm({organisationId}:{organisationId:string}){
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);form.set('organisationId',organisationId);
    const response=await fetch('/api/provider/evidence',{method:'POST',body:form});
    const data=await response.json().catch(()=>({}));
    setMessage(response.ok?'Evidence uploaded for verification.':data.error||'Unable to upload evidence.');
    setBusy(false);if(response.ok)event.currentTarget.reset();
  }
  return <form className='mini-form' onSubmit={submit}><h3>Upload compliance evidence</h3><div className='form-grid'><label>Evidence type<select name='kind' defaultValue='insurance'><option value='business_identity'>Business identity</option><option value='qualification'>Qualification</option><option value='scheme_membership'>Scheme membership</option><option value='insurance'>Insurance</option><option value='other'>Other</option></select></label><label>Label<input name='label' required placeholder='Public liability insurance'/></label><label>Reference<input name='reference' placeholder='Policy or membership number'/></label><label>Expiry date<input name='expiresAt' type='date'/></label></div><label>Evidence file<input name='file' type='file' accept='.pdf,.jpg,.jpeg,.png,.webp' required/></label><button className='button' disabled={busy}>{busy?'Uploading…':'Upload evidence'}</button>{message&&<p className='form-message'>{message}</p>}</form>;
}
