'use client';

import { FormEvent,useState } from 'react';

export function AcademyInterestForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const body=Object.fromEntries(form.entries());
    try{
      const response=await fetch('/api/academy/interest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to submit the Academy registration.');
      if(response.ok)event.currentTarget.reset();
    }catch{setMessage('Unable to reach the Academy service. Please try again.')}finally{setBusy(false)}
  }
  return <form className='form-card' onSubmit={submit}>
    <h2>Join the Academy network</h2>
    <div className='form-grid'>
      <label>I am / we are<select name='audience' defaultValue='education_provider'><option value='education_provider'>College / university / training provider</option><option value='learner'>Learner / apprentice</option><option value='employer'>Electrical employer</option></select></label>
      <label>Organisation / name<input name='organisationOrName' required/></label>
      <label>Email<input name='email' type='email' required/></label>
      <label>Postcode<input name='postcode' required/></label>
    </div>
    <label>What would make this useful for you?<textarea name='details' minLength={10} required placeholder='Placements, apprenticeships, employer introductions, talks, mentoring, work experience…'/></label>
    <button className='button primary' disabled={busy}>{busy?'Submitting…':'Join the Academy pipeline'}</button>
    {message&&<p className='form-message' role='status'>{message}</p>}
  </form>
}
