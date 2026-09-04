'use client';

import { FormEvent,useState } from 'react';

export function BookingForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const body=Object.fromEntries(form.entries());
    try{
      const response=await fetch('/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to submit the request.');
      if(response.ok&&response.status===201)event.currentTarget.reset();
    }catch{setMessage('Unable to reach the booking service. Please try again.')}finally{setBusy(false)}
  }
  return <form className='form-card' onSubmit={submit}>
    <h2>Request electrical work</h2>
    <div className='form-grid'>
      <label>Name<input name='customerName' required/></label>
      <label>Email<input type='email' name='email' required/></label>
      <label>Phone<input name='phone' required/></label>
      <label>Postcode<input name='postcode' required placeholder='SO50 4FQ'/></label>
    </div>
    <label>Property address<input name='address' required/></label>
    <label>What needs doing?<textarea name='description' required minLength={8}/></label>
    <div className='form-grid'>
      <label>Urgency<select name='urgency' defaultValue='routine'><option value='routine'>Routine</option><option value='soon'>Within a few days</option><option value='urgent'>Urgent</option><option value='emergency'>Emergency</option></select></label>
      <label>Preferred window<input name='preferredWindow' placeholder='e.g. weekday mornings'/></label>
    </div>
    <button className='button primary' disabled={busy}>{busy?'Checking coverage…':'Check coverage & request work'}</button>
    {message&&<p className='form-message' role='status'>{message}</p>}
    <p className='form-help'>A job only enters matching where verified provider coverage has reached the live threshold. Hazard descriptions are safety-escalated rather than diagnosed online.</p>
  </form>
}
