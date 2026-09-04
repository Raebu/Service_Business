import { NextResponse } from 'next/server';
import { getUserSupabase } from '@/lib/supabase/server';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';

export async function GET(_request:Request,{params}:{params:Promise<{caseId:string}>}){
 const {caseId}=await params;const userDb=await getUserSupabase();if(!userDb)return NextResponse.json({error:'Sign in required.'},{status:401});const {data:{user}}=await userDb.auth.getUser();if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 try{const admin=getAdminSupabase();const {data:setup}=await admin.from('business_setup_cases').select('id,user_id,applicant_name,email,desired_structure,company_name_choice,status,explicit_filing_consent,qualification_summary,hmrc_setup_status,insurance_status,banking_status,payments_status').eq('id',caseId).maybeSingle();if(!setup||setup.user_id!==user.id)return NextResponse.json({error:'Setup case not found.'},{status:404});
 const limited=setup.desired_structure==='limited_company';const checklist=[
 {key:'structure',label:'Confirm operating structure',status:setup.desired_structure==='undecided'?'action':'ready',detail:setup.desired_structure},
 {key:'identity',label:limited?'Prepare Companies House identity/incorporation details':'Prepare sole-trader identity and trading details',status:'action',approvalRequired:true},
 {key:'tax',label:limited?'Prepare company/tax registration steps':'Prepare HMRC sole-trader registration steps',status:setup.hmrc_setup_status||'not_started',approvalRequired:true},
 {key:'insurance',label:'Public liability and relevant trade insurance',status:setup.insurance_status||'not_started'},
 {key:'banking',label:'Dedicated business banking/payment details',status:setup.banking_status||'not_started'},
 {key:'payments',label:'National Electrician Hub Stripe payout onboarding',status:setup.payments_status||'not_started'},
 {key:'pricing',label:'Create provider-owned rate card',status:'action'},
 {key:'coverage',label:'Choose service areas and travel rules',status:'action'},
 {key:'compliance',label:'Upload qualification/scheme/insurance evidence',status:'action'},
 {key:'finance',label:'Enable digital ledger, invoicing, expenses and mileage',status:'action'}];
 return NextResponse.json({caseId:setup.id,applicantName:setup.applicant_name,structure:setup.desired_structure,companyNameChoice:setup.company_name_choice,filingConsentRecorded:Boolean(setup.explicit_filing_consent),externalFilingSubmitted:false,checklist,guardrails:['No Companies House or HMRC filing is submitted by generating this plan.','Every external filing requires a separate exact-document approval checkpoint.','Tax and legal consequences depend on individual circumstances; professional advice may be appropriate.']});
 }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Unable to create operating plan.'},{status:500})}
}
