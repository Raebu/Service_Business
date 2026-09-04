'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProviderOfferActions({offerId,status}:{offerId:string;status:string}){
  const[busy,setBusy]=useState('');
  const[message,setMessage]=useState('');
  const router=useRouter();
  async function act(action:'accept'|'decline'|'complete'){
    setBusy(action);setMessage('');
    try{
      const response=await fetch(`/api/provider/offers/${offerId}/respond`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
      const data=await response.json();
      setMessage(data.message||data.error||'Unable to update the offer.');
      if(response.ok)router.refresh();
    }catch{setMessage('Unable to reach the job service.')}finally{setBusy('')}
  }
  return <div className='offer-controls'>{status==='offered'&&<><button className='button primary' disabled={Boolean(busy)} onClick={()=>act('accept')}>{busy==='accept'?'Accepting…':'Accept job'}</button><button className='button' disabled={Boolean(busy)} onClick={()=>act('decline')}>{busy==='decline'?'Declining…':'Decline'}</button></>}{status==='accepted'&&<button className='button primary' disabled={Boolean(busy)} onClick={()=>act('complete')}>{busy==='complete'?'Updating…':'Mark completed'}</button>}{message&&<span className='offer-message'>{message}</span>}</div>
}
