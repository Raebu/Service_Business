'use client';

import { FormEvent,useState } from 'react';
const pence=(value:FormDataEntryValue|null)=>Math.round(Number(value||0)*100);

export function InvoiceForm({organisationId,vatRegistered}:{organisationId:string;vatRegistered:boolean}){
  const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const[vatRate,setVatRate]=useState(vatRegistered?20:0);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage('');const f=new FormData(event.currentTarget);
    const body={organisationId,customerName:String(f.get('customerName')),customerAddress:String(f.get('customerAddress')||''),customerVatNumber:String(f.get('customerVatNumber')||'')||undefined,issueDate:String(f.get('issueDate')||'')||undefined,taxPoint:String(f.get('taxPoint')||'')||undefined,dueDate:String(f.get('dueDate')||'')||undefined,currency:'GBP',documentType:'invoice',lines:[{description:String(f.get('description')),quantity:Number(f.get('quantity')||1),unitNetPence:pence(f.get('unitNet')),vatRate,taxCode:String(f.get('taxCode')||'')||undefined}]};
    const r=await fetch('/api/provider/finance/invoices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));setMessage(d.message||d.error||'Unable to issue invoice.');setBusy(false);if(r.ok){event.currentTarget.reset();setTimeout(()=>window.location.reload(),800)}
  }
  return <form className='form-card' onSubmit={submit}><h2>Issue invoice</h2><p className='form-help'>Issued financial fields are immutable. Correct an issued document with a credit note rather than editing history.</p><div className='form-grid'><label>Customer name<input name='customerName' required/></label><label>Customer VAT number<input name='customerVatNumber'/></label><label>Issue date<input type='date' name='issueDate'/></label><label>Tax point<input type='date' name='taxPoint'/></label><label>Due date<input type='date' name='dueDate'/></label><label>Quantity<input type='number' name='quantity' min='0.001' step='0.001' defaultValue='1' required/></label><label>Unit net (£)<input type='number' name='unitNet' min='0' step='0.01' required/></label><label>VAT rate (%)<input type='number' min='0' max='100' step='0.001' value={vatRate} onChange={e=>setVatRate(Number(e.target.value))} disabled={!vatRegistered}/></label><label>Tax code<input name='taxCode' placeholder='Optional'/></label></div><label>Customer address<textarea name='customerAddress'/></label><label>Line description<input name='description' required placeholder='Electrical services'/></label><button className='button primary' disabled={busy}>{busy?'Issuing…':'Issue immutable invoice'}</button>{message&&<p className='form-message'>{message}</p>}</form>;
}
