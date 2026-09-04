'use client';

import { useEffect,useState } from 'react';

type StatusResponse={
  status:string;
  serviceKey:string|null;
  quote:null|{providerPricePence:number;platformFeePence:number;customerTotalPence:number;providerReceivesPence:number;currency:string};
  paymentStatus:string;
  readyToPay:boolean;
  provider:null|{name:string;publicSlug:string};
  engineer:null|{displayName:string};
  schedule:{mode:string;start:string|null;end:string|null};
  error?:string;
};

const money=(pence:number,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(pence/100);

export function CustomerBookingProgress({jobId,token}:{jobId:string;token:string}){
  const[data,setData]=useState<StatusResponse|null>(null);
  const[message,setMessage]=useState('Matching you with an eligible electrician…');
  const[busy,setBusy]=useState(false);

  useEffect(()=>{
    let cancelled=false;
    async function poll(){
      try{
        const response=await fetch(`/api/jobs/${jobId}/status?token=${encodeURIComponent(token)}`,{cache:'no-store'});
        const next=await response.json();
        if(!cancelled&&response.ok){setData(next);setMessage(next.readyToPay?'Your electrician has accepted. Review the price breakdown and pay securely.':next.paymentStatus==='paid'?'Payment received. Your booking is confirmed.':'Matching you with an eligible electrician…');}
      }catch{if(!cancelled)setMessage('We are still processing your request. You can retry this page shortly.')}
    }
    void poll();
    const timer=window.setInterval(poll,5000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[jobId,token]);

  async function checkout(){
    setBusy(true);setMessage('Opening secure payment…');
    try{
      const response=await fetch(`/api/jobs/${jobId}/checkout`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
      const result=await response.json();
      if(response.ok&&result.checkoutUrl){window.location.assign(result.checkoutUrl);return}
      setMessage(result.error||'Secure payment is not ready yet.');
    }catch{setMessage('Unable to open secure payment. Please try again.')}finally{setBusy(false)}
  }

  return <section className='form-card booking-progress' aria-live='polite'>
    <span className='eyebrow'>Booking {jobId.slice(0,8).toUpperCase()}</span>
    <h2>{data?.serviceKey||'Electrical work'}</h2>
    <p className='form-message'>{message}</p>
    {data?.provider&&<p><strong>Matched business:</strong> {data.provider.name}{data.engineer?` · ${data.engineer.displayName}`:''}</p>}
    {data?.quote&&<div className='quote-breakdown'>
      <div><span>Electrician's agreed price</span><strong>{money(data.quote.providerPricePence,data.quote.currency)}</strong></div>
      <div><span>National Electrician Hub service fee</span><strong>{money(data.quote.platformFeePence,data.quote.currency)}</strong></div>
      <div><span>Total you pay</span><strong>{money(data.quote.customerTotalPence,data.quote.currency)}</strong></div>
      <div><span>Electrician receives</span><strong>{money(data.quote.providerReceivesPence,data.quote.currency)}</strong></div>
    </div>}
    {data?.quote&&<p className='form-help'>The electrician sets the underlying work price. National Electrician Hub adds one separately disclosed customer service fee. We do not deduct a second marketplace commission from the electrician's agreed price.</p>}
    {data?.readyToPay&&<button className='button primary' type='button' onClick={checkout} disabled={busy}>{busy?'Opening payment…':`Pay ${money(data.quote!.customerTotalPence,data.quote!.currency)} securely`}</button>}
    {data?.paymentStatus==='paid'&&<p className='note'>Paid. Provider settlement remains subject to completion and service-clearance controls.</p>}
  </section>;
}
