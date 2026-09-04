'use client';

import { FormEvent,useState } from 'react';
import { electricalVertical } from '@service-business/electrical';

export function ProviderApplicationForm(){
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');
    const form=new FormData(event.currentTarget);
    const body={
      businessName:String(form.get('businessName')||''),
      contactName:String(form.get('contactName')||''),
      email:String(form.get('email')||''),
      phone:String(form.get('phone')||''),
      website:String(form.get('website')||''),
      companyNumber:String(form.get('companyNumber')||''),
      coverageAreas:String(form.get('coverageAreas')||'').split(',').map(v=>v.trim()).filter(Boolean),
      services:form.getAll('services').map(String),
      schemeDetails:String(form.get('schemeDetails')||''),
      insuranceExpiry:String(form.get('insuranceExpiry')||''),
      canTakeApprentice:form.get('canTakeApprentice')==='on'
    };
    try{
      const response=await fetch('/api/providers/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to submit the application.');
      if(response.ok)event.currentTarget.reset();
    }catch{setMessage('Unable to reach the application service. Please try again.')}finally{setBusy(false)}
  }
  return <form className='form-card' onSubmit={submit}>
    <h2>Apply to the founding network</h2>
    <div className='form-grid'>
      <label>Business / trading name<input name='businessName' required/></label>
      <label>Primary contact<input name='contactName' required/></label>
      <label>Email<input type='email' name='email' required/></label>
      <label>Phone<input name='phone' required/></label>
      <label>Website<input type='url' name='website' placeholder='https://'/></label>
      <label>Company number<input name='companyNumber'/></label>
    </div>
    <label>Coverage areas<input name='coverageAreas' required placeholder='SO, PO, GU'/><span className='field-help'>Comma-separated postcode areas or agreed coverage codes.</span></label>
    <fieldset><legend>Services you want to receive</legend><div className='check-grid'>{electricalVertical.services.map(service=><label className='check-row' key={service}><input type='checkbox' name='services' value={service}/><span>{service}</span></label>)}</div></fieldset>
    <label>Qualifications / competent-person scheme / relevant evidence<textarea name='schemeDetails' placeholder='Tell us the schemes, qualifications or references you can evidence.'/></label>
    <label>Public liability insurance expiry<input type='date' name='insuranceExpiry'/></label>
    <label className='check-row'><input type='checkbox' name='canTakeApprentice'/><span>I can take an apprentice, learner or work-experience placement</span></label>
    <button className='button primary' disabled={busy}>{busy?'Submitting…':'Submit electrical business application'}</button>
    {message&&<p className='form-message' role='status'>{message}</p>}
    <p className='form-help'>Submitting does not make a business verified. Work allocation and the public verification badge remain disabled until evidence review is complete.</p>
  </form>
}
