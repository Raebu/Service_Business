export type StripeReceiptStatus='processing'|'processed'|'failed'|'ignored';
export type StripeReceiptDecision='ack'|'claim'|'retry';

// Never acknowledge an unfinished delivery: Stripe must be allowed to retry it.
export function stripeReceiptDecision(
  status:StripeReceiptStatus,
  receivedAt:string,
  nowMs:number,
  staleAfterMs=5*60*1000
):StripeReceiptDecision{
  if(status==='processed'||status==='ignored')return 'ack';
  if(status==='failed')return 'claim';
  const received=Date.parse(receivedAt);
  if(Number.isFinite(received)&&Number.isFinite(nowMs)&&nowMs-received>=staleAfterMs)return 'claim';
  return 'retry';
}
