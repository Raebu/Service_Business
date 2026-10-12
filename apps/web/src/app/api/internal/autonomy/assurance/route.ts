import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** A deliberately read-only assurance pass; no money or customer messages. */
export async function POST(request:Request){
 if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
 try{
  const db=getAdminSupabase();
  const [workflows,incidents,receipts,unknownEmails,exceptions,providers,areas]=await Promise.all([
    db.from('autonomy_workflows').select('id',{count:'exact',head:true}).eq('status','dead'),
    db.from('autonomy_incidents').select('id',{count:'exact',head:true}).eq('status','open'),
    db.from('stripe_event_receipts').select('event_id',{count:'exact',head:true}).eq('processing_status','failed'),
    db.from('growth_outreach_attempts').select('id',{count:'exact',head:true}).eq('status','unknown'),
    db.from('finance_reconciliation_exceptions').select('id',{count:'exact',head:true}),
    db.from('providers').select('id',{count:'exact',head:true}),
    db.from('service_areas').select('id',{count:'exact',head:true})
  ]);
  if([workflows,incidents,receipts,unknownEmails,exceptions,providers,areas].some(r=>r.error))
    return NextResponse.json({error:'Assurance source unavailable'},{status:503});
  const findings={
    deadWorkflows:workflows.count||0,openIncidents:incidents.count||0,
    failedStripeReceipts:receipts.count||0,
    unknownEmailDeliveries:unknownEmails.count||0,
    reconciliationExceptions:exceptions.count||0,
    registeredProviders:providers.count||0,serviceAreas:areas.count||0
  };
  const problems=findings.deadWorkflows+findings.failedStripeReceipts+
    findings.unknownEmailDeliveries+findings.reconciliationExceptions;
  if(problems){
    const {error}=await db.from('autonomy_incidents').upsert({
      fingerprint:'assurance:unreconciled_state',
      severity:'high',category:'assurance',
      summary:'One or more workflows, financial receipts or mail deliveries require review',
      status:'open',last_seen_at:new Date().toISOString()
    },{onConflict:'fingerprint'});
    if(error)return NextResponse.json({error:'Could not record assurance incident'},{status:503});
  }
  return NextResponse.json({ok:problems===0,findings,
    supplyReady:findings.registeredProviders>0&&findings.serviceAreas>0,
    productionPaymentVerified:false, // never inferred from configuration or receipts count
    requiresHumanReview:problems>0},{status:problems?503:200,headers:{'cache-control':'no-store'}});
 }catch{return NextResponse.json({error:'Assurance unavailable'},{status:503});}
}
