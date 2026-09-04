import { z } from 'zod';

const postcode=z.string().trim().min(2).max(12).transform(v=>v.toUpperCase().replace(/\s+/g,' '));
const email=z.string().trim().toLowerCase().email();
const phone=z.string().trim().min(7).max(30);

export const providerApplicationSchema=z.object({
  businessName:z.string().trim().min(2).max(160),
  contactName:z.string().trim().min(2).max(120),
  email,
  phone,
  website:z.string().trim().url().optional().or(z.literal('')),
  companyNumber:z.string().trim().max(30).optional().or(z.literal('')),
  coverageAreas:z.array(z.string().trim().min(1).max(12)).min(1).max(40),
  services:z.array(z.string().trim().min(1).max(80)).min(1).max(30),
  schemeDetails:z.string().trim().max(1000).optional().or(z.literal('')),
  insuranceExpiry:z.string().trim().optional().or(z.literal('')),
  canTakeApprentice:z.boolean().default(false)
});

export const businessEnquirySchema=z.object({
  organisation:z.string().trim().min(2).max(180),
  contactName:z.string().trim().min(2).max(120),
  email,
  phone:z.string().trim().max(30).optional().or(z.literal('')),
  segment:z.enum(['landlord','letting_agent','property_manager','facilities','enterprise','housing','public_sector','other']),
  sites:z.coerce.number().int().positive().max(100000),
  requirements:z.string().trim().min(10).max(5000)
});

export const academyInterestSchema=z.object({
  audience:z.enum(['education_provider','learner','employer']),
  organisationOrName:z.string().trim().min(2).max(180),
  email,
  postcode,
  details:z.string().trim().min(10).max(5000)
});

export const jobIntakeSchema=z.object({
  customerName:z.string().trim().min(2).max(120),
  email,
  phone,
  postcode,
  address:z.string().trim().min(5).max(300),
  description:z.string().trim().min(8).max(5000),
  urgency:z.enum(['routine','soon','urgent','emergency']).default('routine'),
  preferredWindow:z.string().trim().max(120).optional().or(z.literal('')),
  serviceKey:z.string().trim().max(120).optional().or(z.literal(''))
});

const verificationEvidenceSchema=z.object({
  kind:z.enum(['business_identity','qualification','scheme_membership','insurance','other']),
  label:z.string().trim().min(2).max(180),
  reference:z.string().trim().max(300).optional().or(z.literal('')),
  expiresAt:z.string().trim().optional().or(z.literal(''))
});

export const approveProviderSchema=z.object({
  publicSlug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),
  evidence:z.array(verificationEvidenceSchema).min(3).max(30)
}).superRefine((value,ctx)=>{
  const kinds=new Set(value.evidence.map(item=>item.kind));
  if(!kinds.has('business_identity'))ctx.addIssue({code:'custom',path:['evidence'],message:'Business identity evidence is required.'});
  if(!kinds.has('insurance'))ctx.addIssue({code:'custom',path:['evidence'],message:'Insurance evidence is required.'});
  if(!kinds.has('qualification')&&!kinds.has('scheme_membership'))ctx.addIssue({code:'custom',path:['evidence'],message:'Qualification or scheme-membership evidence is required.'});
});

export function formatZodError(error:z.ZodError){
  return error.issues.map(i=>({field:i.path.join('.'),message:i.message}));
}
