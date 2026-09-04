'use client';

import { FormEvent,useState } from 'react';

export function BookingForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  const[scheduleMode,setScheduleMode]=useState<'asap'|'exact'|'window'|'flexible'>('asap');
  const[latitude,setLatitude]=useState('');
  const[longitude,setLongitude]=useState('');
  const[locationMessage,setLocationMessage]=useState('');

  function useLocation(){
    if(!navigator.geolocation){setLocationMessage('Live location is not supported by this browser. Your address and postcode are enough to continue.');return}
    setLocationMessage('Getting your location…');
    navigator.geolocation.getCurrentPosition(position=>{
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
      setLocationMessage('Location added. We will use it for travel-time matching, not expose raw coordinates to providers before booking.');
    },()=>setLocationMessage('Location was not shared. Your address and postcode are enough to continue.'),{enableHighAccuracy:false,timeout:8000,maximumAge:300000});
  }

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const body=Object.fromEntries(form.entries()) as Record<string,string>;
    if(body.requestedStart)body.requestedStart=new Date(body.requestedStart).toISOString();
    if(body.requestedEnd)body.requestedEnd=new Date(body.requestedEnd).toISOString();
    try{
      const response=await fetch('/api/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to submit the request.');
      if(response.ok&&response.status===201){event.currentTarget.reset();setScheduleMode('asap');setLatitude('');setLongitude('');}
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
    <input type='hidden' name='latitude' value={latitude}/><input type='hidden' name='longitude' value={longitude}/>
    <div className='inline-actions'><button className='button' type='button' onClick={useLocation}>Use my current location</button>{locationMessage&&<small>{locationMessage}</small>}</div>
    <label>What needs doing?<textarea name='description' required minLength={8}/></label>
    <div className='form-grid'>
      <label>Urgency<select name='urgency' defaultValue='routine'><option value='routine'>Routine</option><option value='soon'>Within a few days</option><option value='urgent'>Urgent</option><option value='emergency'>Emergency</option></select></label>
      <label>When do you want the electrician?<select name='scheduleMode' value={scheduleMode} onChange={event=>setScheduleMode(event.target.value as typeof scheduleMode)}><option value='asap'>As soon as possible</option><option value='exact'>Exact date & time</option><option value='window'>Arrival window</option><option value='flexible'>Flexible time range</option></select></label>
    </div>
    {scheduleMode!=='asap'&&<div className='form-grid'>
      <label>{scheduleMode==='exact'?'Appointment time':'Window starts'}<input type='datetime-local' name='requestedStart' required/></label>
      {(scheduleMode==='window'||scheduleMode==='flexible')&&<label>Window ends<input type='datetime-local' name='requestedEnd' required/></label>}
    </div>}
    <label>Anything else about timing?<input name='preferredWindow' placeholder='e.g. school run means not before 09:30'/></label>
    <button className='button primary' disabled={busy}>{busy?'Checking coverage…':'Check coverage & request work'}</button>
    {message&&<p className='form-message' role='status'>{message}</p>}
    <p className='form-help'>For planned work we match the requested slot against engineer calendars, estimated job duration and travel time. For ASAP work, location can improve ETA ranking. A job only enters matching where verified provider coverage has reached the live threshold.</p>
  </form>;
}
