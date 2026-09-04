'use client';

import { FormEvent,useState } from 'react';

export function TeamManager({organisationId}:{organisationId:string}){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const body=Object.fromEntries(new FormData(event.currentTarget).entries());
    const response=await fetch('/api/provider/engineers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,organisationId})});
    const data=await response.json().catch(()=>({}));
    setMessage(data.message||data.error||'Unable to add engineer.');setBusy(false);
    if(response.ok){event.currentTarget.reset();window.location.reload();}
  }
  return <form className='form-card' onSubmit={submit}>
    <h2>Add a person</h2>
    <p className='form-help'>Each person gets their own identity. If the email already has an account it is linked immediately; otherwise it links automatically when they first sign in.</p>
    <div className='form-grid'><label>Name<input name='displayName' required/></label><label>Email<input name='email' type='email' required/></label><label>Phone<input name='phone'/></label><label>Role<select name='employmentRole' defaultValue='engineer'><option value='owner'>Owner</option><option value='engineer'>Engineer</option><option value='dispatcher'>Dispatcher</option><option value='apprentice'>Apprentice</option><option value='trainee'>Trainee</option></select></label></div>
    <button className='button primary' disabled={busy}>{busy?'Adding…':'Add to business'}</button>{message&&<p className='form-message'>{message}</p>}
  </form>;
}

export function CompetencyForm({engineerId}:{engineerId:string}){
  const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');const body=Object.fromEntries(new FormData(event.currentTarget).entries());
    if(body.expiresAt)body.expiresAt=new Date(String(body.expiresAt)).toISOString();
    const response=await fetch(`/api/provider/engineers/${engineerId}/competencies`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to save competency.');setBusy(false);if(response.ok)window.location.reload();
  }
  return <form className='mini-form' onSubmit={submit}><div className='form-grid'><label>Service / skill<input name='serviceKey' required placeholder='e.g. fault-finding'/></label><label>Current level<select name='competencyLevel' defaultValue='supervised'><option value='observer'>Observer</option><option value='supervised'>Supervised</option><option value='competent'>Competent</option><option value='advanced'>Advanced</option></select></label><label>Evidence reference<input name='evidenceReference' placeholder='Certificate, scheme, portfolio reference'/></label><label>Expiry, if any<input type='datetime-local' name='expiresAt'/></label></div><button className='button' disabled={busy}>{busy?'Saving…':'Submit competency'}</button>{message&&<small>{message}</small>}</form>;
}

export function AvailabilityForm({engineerId}:{engineerId:string}){
  const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const[autoAccept,setAutoAccept]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');const form=new FormData(event.currentTarget);
    const body={dayOfWeek:Number(form.get('dayOfWeek')),startTime:String(form.get('startTime')),endTime:String(form.get('endTime')),timezone:'Europe/London',autoAccept,minimumJobPence:Math.round(Number(form.get('minimumJob')||0)*100),maximumDurationMinutes:Number(form.get('maximumDurationMinutes')||0)||undefined,maximumTravelMinutes:Number(form.get('maximumTravelMinutes')||0)||undefined};
    const response=await fetch(`/api/provider/engineers/${engineerId}/availability`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));setMessage(data.message||data.error||'Unable to save availability.');setBusy(false);if(response.ok)window.location.reload();
  }
  return <form className='mini-form' onSubmit={submit}><div className='form-grid'><label>Day<select name='dayOfWeek' defaultValue='1'><option value='1'>Monday</option><option value='2'>Tuesday</option><option value='3'>Wednesday</option><option value='4'>Thursday</option><option value='5'>Friday</option><option value='6'>Saturday</option><option value='0'>Sunday</option></select></label><label>Start<input type='time' name='startTime' required defaultValue='08:00'/></label><label>End<input type='time' name='endTime' required defaultValue='17:00'/></label><label>Minimum job (£)<input type='number' name='minimumJob' min='0' step='0.01' defaultValue='0'/></label><label>Max job duration (min)<input type='number' name='maximumDurationMinutes' min='1' placeholder='e.g. 180'/></label><label>Max travel time (min)<input type='number' name='maximumTravelMinutes' min='1' placeholder='e.g. 30'/></label></div><label className='check-row'><input type='checkbox' checked={autoAccept} onChange={e=>setAutoAccept(e.target.checked)}/> Auto-accept eligible jobs inside this rule</label><button className='button' disabled={busy}>{busy?'Saving…':'Add availability rule'}</button>{message&&<small>{message}</small>}</form>;
}
