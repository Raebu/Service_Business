import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

const lineSchema=z.object({description:z.string().trim().min(2).max(500),quantity:z.coerce.number().positive().max(100000).default(1),unitNetPence:z.coerce.number().int().min(0),vatRate:z.coerce.number().min(0).max(100).default(0),taxCode:z.string().trim().max(40).optional()});
const schema=z.object({organisationId:z.string().uuid(),jobId:z.string().uuid().optional(),customerOrganisationId:z.string().uuid().optional(),customerName:z.string().trim().min(2).max(200),customerAddress:z.string().trim().max(1000).optional(),customerVatNumber:z.string().trim().max(40).optional(),issueDate:z.string().date().optional(),taxPoint:z.string().date().optional(),dueDate:z.string().date().optional(),currency:z.string().regex(/^[A-Z]{3}$/).default('GBP'),documentType:z.enum(['invoice','credit_note']).default('invoice'),relatedInvoiceId:z.string().uuid().optional(),lines:z.array(lineSchema).min(1).max(100)});

export async function POST(request:Request){
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:'Please check the invoice details.'},{status:400});
  const userSupabase=await getUserSupabase();if(!userSupabase)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:{user}}=await userSupabase.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',parsed.data.organisationId).eq('user_id',user.id).maybeSingle();
  if(!membership||!['owner','admin','manager'].includes(membership.role))return NextResponse.json({error:'Business owner or finance manager access required.'},{status:403});
  try{
    const admin=getAdminSupabase();
    const {data:profile}=await admin.from('accounting_profiles').select('vat_registered,vat_number').eq('organisation_id',parsed.data.organisationId).maybeSingle();
    const vatRegistered=Boolean(profile?.vat_registered);
    if(!vatRegistered&&parsed.data.lines.some(line=>line.vatRate>0))return NextResponse.json({error:'VAT cannot be charged because this accounting profile is not marked VAT registered.'},{status:409});
    if(vatRegistered&&!profile?.vat_number)return NextResponse.json({error:'A VAT number is required before issuing VAT invoices.'},{status:409});
    if(parsed.data.documentType==='credit_note'&&!parsed.data.relatedInvoiceId)return NextResponse.json({error:'A credit note must reference the original invoice.'},{status:400});
    if(parsed.data.relatedInvoiceId){
      const {data:related}=await admin.from('invoices').select('id,organisation_id').eq('id',parsed.data.relatedInvoiceId).maybeSingle();
      if(!related||related.organisation_id!==parsed.data.organisationId)return NextResponse.json({error:'Related invoice not found for this business.'},{status:404});
    }
    const calculated=parsed.data.lines.map((line,index)=>{
      const net=Math.round(line.unitNetPence*line.quantity);
      const vat=vatRegistered?Math.round(net*line.vatRate/100):0;
      return{line_number:index+1,description:line.description,quantity:line.quantity,unit_net_pence:line.unitNetPence,net_pence:net,vat_rate:vatRegistered?line.vatRate:0,vat_pence:vat,gross_pence:net+vat,tax_code:line.taxCode||null};
    });
    const net=calculated.reduce((sum,line)=>sum+line.net_pence,0);const vat=calculated.reduce((sum,line)=>sum+line.vat_pence,0);const gross=net+vat;
    const prefix=parsed.data.documentType==='credit_note'?'CRN':'INV';
    const {data:number,error:numberError}=await admin.rpc('allocate_invoice_number',{p_organisation_id:parsed.data.organisationId,p_prefix:prefix});
    if(numberError||!number)return NextResponse.json({error:'Unable to allocate invoice number.'},{status:500});
    const now=new Date().toISOString();const issueDate=parsed.data.issueDate||now.slice(0,10);const taxPoint=parsed.data.taxPoint||issueDate;
    const {data:invoice,error:invoiceError}=await admin.from('invoices').insert({organisation_id:parsed.data.organisationId,job_id:parsed.data.jobId??null,customer_organisation_id:parsed.data.customerOrganisationId??null,invoice_number:number,document_type:parsed.data.documentType,related_invoice_id:parsed.data.relatedInvoiceId??null,issue_date:issueDate,tax_point:taxPoint,due_date:parsed.data.dueDate??null,currency:parsed.data.currency,net_pence:net,vat_pence:vat,gross_pence:gross,vat_number:vatRegistered?profile?.vat_number:null,customer_name:parsed.data.customerName,customer_address:parsed.data.customerAddress||null,customer_vat_number:parsed.data.customerVatNumber||null,status:'issued',immutable_issued_at:now,metadata:{createdBy:user.id}}).select('id,invoice_number').single();
    if(invoiceError||!invoice)return NextResponse.json({error:'Unable to issue invoice.',detail:invoiceError?.message},{status:500});
    const {error:lineError}=await admin.from('invoice_lines').insert(calculated.map(line=>({...line,invoice_id:invoice.id})));
    if(lineError){await admin.from('invoices').delete().eq('id',invoice.id);return NextResponse.json({error:'Unable to save invoice lines.',detail:lineError.message},{status:500})}
    const debitAccount=parsed.data.documentType==='credit_note'?'provider_service_revenue':'accounts_receivable';
    const creditAccount=parsed.data.documentType==='credit_note'?'accounts_receivable':'provider_service_revenue';
    const journalLines:Array<Record<string,unknown>>=[{accountCode:debitAccount,direction:'debit',amountPence:net,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null},{accountCode:creditAccount,direction:'credit',amountPence:net,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null}];
    if(vat>0){
      if(parsed.data.documentType==='credit_note'){journalLines.push({accountCode:'vat_output',direction:'debit',amountPence:vat,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null},{accountCode:'accounts_receivable',direction:'credit',amountPence:vat,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null});}
      else{journalLines.push({accountCode:'accounts_receivable',direction:'debit',amountPence:vat,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null},{accountCode:'vat_output',direction:'credit',amountPence:vat,organisationId:parsed.data.organisationId,jobId:parsed.data.jobId||null});}
    }
    await admin.rpc('post_finance_journal',{p_idempotency_key:`invoice:${invoice.id}`,p_source_type:parsed.data.documentType,p_source_id:invoice.id,p_currency:parsed.data.currency,p_lines:journalLines,p_metadata:{invoiceNumber:invoice.invoice_number,taxPoint,vatRegistered,vatPence:vat}});
    await admin.from('audit_events').insert({actor_user_id:user.id,event_type:`finance.${parsed.data.documentType}_issued`,entity_type:'invoice',entity_id:invoice.id,metadata:{invoiceNumber:invoice.invoice_number,organisationId:parsed.data.organisationId,netPence:net,vatPence:vat,grossPence:gross}});
    return NextResponse.json({id:invoice.id,invoiceNumber:invoice.invoice_number,netPence:net,vatPence:vat,grossPence:gross,message:`${parsed.data.documentType==='credit_note'?'Credit note':'Invoice'} issued and posted to the finance journal.`},{status:201});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});
    return NextResponse.json({error:'Unable to issue invoice.'},{status:500});
  }
}
