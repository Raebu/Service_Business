'use client';

import { FormEvent,useState } from 'react';

export function BusinessEnquiryForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const body=Object.fromEntries(form.entries());
    try{
      const response=await fetch('/api/business/enquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to submit the business enquiry.');
      if(response.ok)event.currentTarget.reset();
    }catch{setMessage('Unable to reach the business enquiry service. Please try again.')}finally{setBusy(false)}
  }
  return <form className='form-card' onSubmit={submit}>
    <h2>Talk to the business team</h2>
    <div className='form-grid'>
      <label>Organisation<input name='organisation' required/></label>
      <label>Contact name<input name='contactName' required/></label>
      <label>Email<input name='email' type='email' required/></label>
      <label>Phone<input name='phone'/></label>
      <label>Organisation type<select name='segment' defaultValue='letting_agent'><option value='landlord'>Landlord</option><option value='letting_agent'>Letting agent</option><option value='property_manager'>Property manager</option><option value='facilities'>Facilities management</option><option value='enterprise'>Enterprise / multi-site</option><option value='housing'>Housing organisation</option><option value='public_sector'>Public sector</option><option value='other'>Other</option></select></label>
      <label>Properties / sites<input name='sites' type='number' min='1' defaultValue='1' required/></label>
    </div>
    <label>What do you need?<textarea name='requirements' minLength={10} required placeholder='Coverage, compliance, EICRs, reactive work, emergency response, planned maintenance…'/></label>
    <button className='button primary' disabled={busy}>{busy?'Submitting…':'Start a business conversation'}</button>
    {message&&<p className='form-message' role='status'>{message}</p>}
  </form>
}
