import {createHmac,timingSafeEqual} from 'node:crypto';

export const outreachWorkstreams=['provider_recruitment','corporate_acquisition','academy_employer','education_partnerships'] as const;
export type OutreachWorkstream=typeof outreachWorkstreams[number];
export type CompanyType='corporate'|'individual'|'unknown';
export type LegalBasis='legitimate_interests'|'consent'|'soft_opt_in'|'unassessed';
export type ProspectEligibility={
  companyType:CompanyType;legalBasis:LegalBasis;consentAt:string|null;
  directEmail:string|null;domain:string|null;domainMatched:boolean;emailVerified:boolean;
  contactName:string|null;sourceUrl:string|null;privacyNoticeUrl:string|null;
  lawfulBasisEvidence:string|null;suppressed:boolean;
};
export function eligibleForOutreach(p:ProspectEligibility):boolean{
  if(p.suppressed||!p.emailVerified||!p.domainMatched||!p.contactName?.trim()
    ||!p.directEmail||!p.domain||!p.sourceUrl||!p.privacyNoticeUrl
    ||(p.lawfulBasisEvidence?.trim().length||0)<13)return false;
  const email=p.directEmail.trim().toLowerCase(),domain=p.domain.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.split('@')[1]!==domain)return false;
  if(/^(info|hello|contact|enquiries|enquiry|support|sales|office|admin)@/i.test(email))return false;
  if(p.companyType==='corporate')return p.legalBasis==='legitimate_interests'||p.legalBasis==='consent';
  if(p.companyType==='individual')return !!p.consentAt&&(p.legalBasis==='consent'||p.legalBasis==='soft_opt_in');
  return false;
}

export type GrowthTemplate={subject:string;message:string};
export type GrowthIdentity={contactName:string;organisationName:string;area:string;serviceKey:string;unsubscribeUrl:string};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]||char));
const placeholders=['contactName','organisationName','area','serviceKey','unsubscribeUrl'] as const;
export function renderGrowthEmail(template:GrowthTemplate,identity:GrowthIdentity){
  const interpolate=(raw:string)=>placeholders.reduce((value,key)=>value.replaceAll(`{{${key}}}`,identity[key]),raw);
  const subject=interpolate(template.subject).replace(/[\r\n]/g,' ').slice(0,180).trim();
  const message=interpolate(template.message).slice(0,7500).trim();
  if(!subject||!message||!identity.unsubscribeUrl.startsWith('https://'))throw new Error('invalid_growth_template');
  const ending=`\n\nThe Raeburn Group of Companies — Raeburn Services. If you do not want further emails, use: ${identity.unsubscribeUrl}`;
  const text=message+ending;
  const html=`<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(message)}</div><p style="font-size:12px">Raeburn Services · The Raeburn Group of Companies<br><a href="${escapeHtml(identity.unsubscribeUrl)}">Unsubscribe</a></p>`;
  return {subject,text,html};
}
export type ReplyClass='unsubscribe'|'not_interested'|'interested'|'question'|'review';
export function classifyGrowthReply(subject:string,body:string):ReplyClass{
  const s=(subject+'\n'+body).trim().toLowerCase().slice(0,10000);
  if(/\b(unsubscribe|remove me|stop emailing|do not contact|don't contact|no more emails|opt.?out)\b/.test(s))return 'unsubscribe';
  if(/\b(not interested|no thank you|no thanks|not for us|please leave us alone)\b/.test(s))return 'not_interested';
  if(/\b(interested|book a call|set up a meeting|sounds good|please call|tell me more)\b/.test(s))return 'interested';
  if(s.includes('?'))return 'question';
  return 'review';
}

/** Verify Resend/Svix raw body HMAC. Replay prevention also needs DB uniqueness. */
export function verifyResendSignature(raw:string,headers:{id:string|null;timestamp:string|null;signature:string|null},
  secret:string,nowSeconds=Math.floor(Date.now()/1000)):boolean{
  const {id,timestamp,signature}=headers;
  if(!id||!timestamp||!signature||!secret.startsWith('whsec_')||!/^[0-9]{10,12}$/.test(timestamp))return false;
  const seconds=Number(timestamp);
  if(!Number.isSafeInteger(seconds)||Math.abs(nowSeconds-seconds)>300)return false;
  const key=Buffer.from(secret.substring(6),'base64');
  if(key.length<16)return false;
  const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest();
  return signature.split(' ').some(part=>{
    const match=/^v1,([A-Za-z0-9+/=]+)$/.exec(part);
    if(!match)return false;
    const got=Buffer.from(match[1],'base64');
    return got.length===expected.length&&timingSafeEqual(got,expected);
  });
}
