import { NextResponse } from 'next/server';
import { getAdminSupabase, SupabaseConfigurationError } from '@/lib/supabase/admin';

export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  try{
    const {slug}=await params;
    const supabase=getAdminSupabase();
    const {data,error}=await supabase.from('public_provider_verification').select('*').eq('public_slug',slug).maybeSingle();
    if(error)return NextResponse.json({error:'Unable to load verification.'},{status:500});
    if(!data)return NextResponse.json({error:'Verification record not found.'},{status:404});
    const nextExpiry=data.next_evidence_expiry?Date.parse(data.next_evidence_expiry):null;
    const active=data.verification_state==='active'&&(!nextExpiry||nextExpiry>Date.now());
    return NextResponse.json({...data,active});
  }catch(error){
    if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Verification is not connected to the production database yet.'},{status:503});
    return NextResponse.json({error:'Unable to load verification.'},{status:500});
  }
}
