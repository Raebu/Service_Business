'use client';

import { useMemo,useState } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import { ConnectAccountManagement,ConnectAccountOnboarding,ConnectComponentsProvider,ConnectNotificationBanner } from '@stripe/react-connect-js';

export function StripeOnboarding({organisationId}:{organisationId:string}){
  const[message,setMessage]=useState('');
  const publishableKey=process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY||'';
  const connectInstance=useMemo(()=>loadConnectAndInitialize({
    publishableKey,
    fetchClientSecret:async()=>{
      const response=await fetch('/api/provider/stripe/account-session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({organisationId})});
      const data=await response.json();
      if(!response.ok||!data.clientSecret)throw new Error(data.error||'Unable to start payment onboarding.');
      return data.clientSecret as string;
    }
  }),[organisationId,publishableKey]);

  async function sync(){
    setMessage('Checking payout readiness…');
    const response=await fetch('/api/provider/stripe/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({organisationId})});
    const data=await response.json().catch(()=>({}));
    setMessage(response.ok?(data.transfersActive?'Payment onboarding complete. This business can receive settlements.':'Onboarding saved. Stripe still requires information before transfers can be enabled.'):(data.error||'Unable to check payment status.'));
  }

  if(!publishableKey)return <p className='note'>Stripe publishable-key configuration is required before embedded onboarding can be displayed.</p>;
  return <div className='portal-card'>
    <h2>Payments & verification</h2>
    <p>Complete Stripe verification and ongoing account requirements here without a separate provider dashboard. Outstanding compliance actions appear automatically.</p>
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <ConnectNotificationBanner/>
      <ConnectAccountOnboarding onExit={sync}/>
      <details><summary>Manage payment account details</summary><ConnectAccountManagement/></details>
    </ConnectComponentsProvider>
    {message&&<p className='form-message' role='status'>{message}</p>}
    <button className='button' type='button' onClick={sync}>Refresh payout status</button>
  </div>;
}
