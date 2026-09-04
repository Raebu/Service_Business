export type VerticalId=string;
export type ActorRole='customer'|'provider'|'business'|'education'|'admin';
export type OrganisationKind='provider_business'|'business_client'|'education_provider';
export type ProviderApplicationStatus='draft'|'submitted'|'screening'|'evidence_required'|'verified'|'rejected'|'suspended';
export type EvidenceKind='business_identity'|'qualification'|'scheme_membership'|'insurance'|'other';
export type JobStatus='coverage_waitlist'|'safety_escalation'|'new'|'offered'|'accepted'|'scheduled'|'in_progress'|'completed'|'cancelled'|'disputed';
export type BusinessSegment='landlord'|'letting_agent'|'property_manager'|'facilities'|'enterprise'|'housing'|'public_sector'|'other';
export type AcademyAudience='education_provider'|'learner'|'employer';

export type ProviderApplication={
  id?:string;
  verticalId:VerticalId;
  businessName:string;
  contactName:string;
  email:string;
  phone:string;
  website?:string;
  companyNumber?:string;
  coverageAreas:string[];
  services:string[];
  schemeDetails?:string;
  insuranceExpiry?:string;
  canTakeApprentice:boolean;
  status:ProviderApplicationStatus;
  createdAt?:string;
};

export type ProviderEvidence={
  id?:string;
  providerId:string;
  kind:EvidenceKind;
  label:string;
  reference?:string;
  storagePath?:string;
  verifiedAt?:string;
  expiresAt?:string;
  status:'pending'|'verified'|'rejected'|'expired';
};

export type BusinessEnquiry={
  id?:string;
  verticalId:VerticalId;
  organisation:string;
  contactName:string;
  email:string;
  phone?:string;
  segment:BusinessSegment;
  sites:number;
  requirements:string;
  createdAt?:string;
};

export type AcademyInterest={
  id?:string;
  verticalId:VerticalId;
  audience:AcademyAudience;
  organisationOrName:string;
  email:string;
  postcode:string;
  details:string;
  createdAt?:string;
};

export type CustomerJobIntake={
  id?:string;
  verticalId:VerticalId;
  customerName:string;
  email:string;
  phone:string;
  postcode:string;
  address:string;
  description:string;
  urgency:'routine'|'soon'|'urgent'|'emergency';
  preferredWindow?:string;
  serviceKey?:string;
  status:JobStatus;
  createdAt?:string;
};

export function normaliseUkPostcode(value:string):string{
  return value.trim().toUpperCase().replace(/\s+/g,' ');
}

export function postcodeArea(value:string):string{
  const postcode=normaliseUkPostcode(value);
  const outward=postcode.split(' ')[0]||postcode;
  const match=outward.match(/^[A-Z]{1,2}/);
  return match?.[0]||outward;
}
