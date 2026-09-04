export type VerificationBadgeStatus='active'|'suspended'|'expired'|'revoked';
export type VerificationEvidence={type:string;reference?:string;verifiedAt:string;expiresAt?:string};
export type ProviderVerification={providerId:string;publicSlug:string;businessName:string;status:VerificationBadgeStatus;verifiedAt:string;evidence:VerificationEvidence[]};

export function badgeIsDisplayable(record:ProviderVerification,at=new Date()):boolean{
  if(record.status!=='active')return false;
  return record.evidence.every(e=>!e.expiresAt||Date.parse(e.expiresAt)>at.getTime());
}

export function publicVerificationPath(record:ProviderVerification):string{
  return `/verify/${encodeURIComponent(record.publicSlug)}`;
}
