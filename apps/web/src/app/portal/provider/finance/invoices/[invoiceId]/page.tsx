import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { PrintButton } from '@/components/PrintButton';

export const dynamic='force-dynamic';
const money=(pence:number,currency='GBP')=>new Intl.NumberFormat('en-GB',{style:'currency',currency}).format(Number(pence||0)/100);

export default async function InvoiceDocumentPage({params,searchParams}:{params:Promise<{invoiceId:string}>;searchParams:Promise<{organisation?:string}>}){
  const {invoiceId}=await params;const {organisation}=await searchParams;if(!organisation)redirect('/account');
  const userSupabase=await getUserSupabase();if(!userSupabase)redirect('/account');const {data:{user}}=await userSupabase.auth.getUser();if(!user)redirect('/account');
  const {data:membership}=await userSupabase.from('organisation_members').select('role').eq('organisation_id',organisation).eq('user_id',user.id).maybeSingle();if(!membership)redirect('/account');
  const admin=getAdminSupabase();
  const [{data:invoice},{data:org},{data:lines}]=await Promise.all([
    admin.from('invoices').select('*').eq('id',invoiceId).eq('organisation_id',organisation).maybeSingle(),
    admin.from('organisations').select('name').eq('id',organisation).maybeSingle(),
    admin.from('invoice_lines').select('line_number,description,quantity,unit_net_pence,net_pence,vat_rate,vat_pence,gross_pence,tax_code').eq('invoice_id',invoiceId).order('line_number')
  ]);
  if(!invoice)redirect(`/portal/provider/finance?organisation=${organisation}`);
  return <section className='page invoice-document'><div className='actions no-print'><Link className='button' href={`/portal/provider/finance?organisation=${organisation}`}>Back to finance</Link><PrintButton/></div><div className='invoice-sheet'><header><div><span className='eyebrow'>{invoice.document_type==='credit_note'?'Credit note':'Invoice'}</span><h1>{invoice.invoice_number}</h1></div><div><strong>{org?.name||'Electrical business'}</strong>{invoice.vat_number&&<span>VAT {invoice.vat_number}</span>}</div></header><div className='invoice-meta'><div><strong>Customer</strong><span>{invoice.customer_name}</span>{invoice.customer_address&&<span>{invoice.customer_address}</span>}{invoice.customer_vat_number&&<span>VAT {invoice.customer_vat_number}</span>}</div><div><strong>Issue date</strong><span>{invoice.issue_date}</span><strong>Tax point</strong><span>{invoice.tax_point}</span>{invoice.due_date&&<><strong>Due date</strong><span>{invoice.due_date}</span></>}</div></div><div className='invoice-table'><div className='invoice-row invoice-head'><span>Description</span><span>Qty</span><span>Net</span><span>VAT</span><span>Gross</span></div>{(lines||[]).map(line=><div className='invoice-row' key={line.line_number}><span>{line.description}</span><span>{Number(line.quantity)}</span><span>{money(line.net_pence,invoice.currency)}</span><span>{Number(line.vat_rate).toFixed(1)}% · {money(line.vat_pence,invoice.currency)}</span><span>{money(line.gross_pence,invoice.currency)}</span></div>)}</div><div className='invoice-totals'><div><span>Net</span><strong>{money(invoice.net_pence,invoice.currency)}</strong></div><div><span>VAT</span><strong>{money(invoice.vat_pence,invoice.currency)}</strong></div><div><span>Total</span><strong>{money(invoice.gross_pence,invoice.currency)}</strong></div></div><p className='form-help'>Issued {invoice.immutable_issued_at?new Date(invoice.immutable_issued_at).toLocaleString('en-GB'):'—'} · retained until {invoice.retention_until}. Financial fields on issued documents are immutable; corrections are made using credit notes.</p></div></section>;
}
