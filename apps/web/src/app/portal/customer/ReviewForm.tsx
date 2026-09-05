'use client';

import { useState } from 'react';

export function ReviewForm({jobId}:{jobId:string}){
  const[rating,setRating]=useState(0);const[review,setReview]=useState('');const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const[done,setDone]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();if(!rating){setMessage('Choose a rating from 1 to 5.');return}setBusy(true);setMessage('Submitting your verified review…');const response=await fetch('/api/reviews/booking',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,rating,review:review.trim()||undefined})});const data=await response.json().catch(()=>({}));setBusy(false);if(response.ok){setDone(true);setMessage(data.message||'Thank you. Your review has been received.')}else setMessage(data.error||'Unable to submit review.');}
  if(done)return <div className='note' role='status'>{message}</div>;
  return <form onSubmit={submit} className='stack'>
    <div><strong>Rate this completed job</strong><div className='button-row' role='radiogroup' aria-label='Rating'>{[1,2,3,4,5].map(value=><button key={value} type='button' className={rating===value?'button':'button secondary'} aria-pressed={rating===value} onClick={()=>setRating(value)}>{value} ★</button>)}</div></div>
    <label><span>What went well or could have been better? <small>(optional)</small></span><textarea value={review} maxLength={3000} rows={4} onChange={event=>setReview(event.target.value)} placeholder='Share useful feedback about the work, communication and overall experience.'/></label>
    <div className='button-row'><button className='button' disabled={busy||!rating} type='submit'>{busy?'Submitting…':'Submit verified review'}</button><span className='note'>{review.length}/3000</span></div>
    {message&&<p className='form-message' role='status'>{message}</p>}
  </form>;
}
