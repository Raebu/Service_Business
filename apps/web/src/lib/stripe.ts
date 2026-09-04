import Stripe from 'stripe';

export class StripeConfigurationError extends Error{
  constructor(){super('Stripe server credentials are not configured.');this.name='StripeConfigurationError'}
}

let stripeClient:Stripe|null=null;
export function getStripeClient(){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key)throw new StripeConfigurationError();
  if(!stripeClient)stripeClient=new Stripe(key,{maxNetworkRetries:2});
  return stripeClient;
}

export const STRIPE_INTEGRATION_IDENTIFIER='service_business_qmrvktpa';

export async function createRecipientConnectedAccount(input:{email:string;displayName:string;country?:string;entityType?:'company'|'individual'}){
  const stripe=getStripeClient();
  return stripe.v2.core.accounts.create({
    contact_email:input.email,
    display_name:input.displayName,
    dashboard:'none',
    identity:{country:(input.country||'gb').toLowerCase(),entity_type:input.entityType||'company'},
    defaults:{currency:'gbp',responsibilities:{fees_collector:'application',losses_collector:'application'}},
    configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{requested:true}}}}},
    include:['configuration.recipient','identity','requirements','defaults']
  });
}

export function transferGroupForJob(jobId:string){
  return `JOB_${jobId.replace(/-/g,'').slice(0,28)}`;
}
