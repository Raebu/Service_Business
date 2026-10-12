export const educationInstitutionTypes=[
  'university','further_education_college','sixth_form_college',
  'apprenticeship_provider','independent_training_provider','adult_education',
  'skills_bootcamp','other'
] as const;
export type EducationInstitutionType=typeof educationInstitutionTypes[number];
export const partnershipInterests=[
  'employer_partnerships','apprenticeships','student_placements','work_experience',
  'industry_projects','skills_bootcamps','adult_reskilling',
  'curriculum_advisory','guest_lectures','research_collaboration'
] as const;
export type PartnershipInterest=typeof partnershipInterests[number];

export type InstitutionCandidate={
  name:string;domain:string;institutionType:EducationInstitutionType;
  sourceReference:string;sourceUrl:string;region?:string;
  interests:PartnershipInterest[];
};
export function qualifyEducationCandidate(c:InstitutionCandidate):boolean{
  const domain=c.domain.trim().toLowerCase();
  const source=c.sourceUrl.trim();
  return c.name.trim().length>=3 && c.name.length<=180
    && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)
    && !domain.includes('..')&&!domain.startsWith('www.')
    && source.startsWith('https://')&&c.sourceReference.length>=5
    && c.interests.length<=10
    && new Set(c.interests).size===c.interests.length
    && c.interests.every(i=>(partnershipInterests as readonly string[]).includes(i));
}

export function educationProspectSourceRole(title:string):boolean{
  return /partnership|employer.engagement|apprenticeship|career|employability|skills|placement|business.engagement/i.test(title);
}
/** Discovery suggestions only, never proof of verified contact or a marketing basis. */
export function educationDiscoveryClassification(name:string):EducationInstitutionType|null{
  if(/university/i.test(name))return 'university';
  if(/sixth.form/i.test(name))return 'sixth_form_college';
  if(/college|further education/i.test(name))return 'further_education_college';
  if(/apprenticeship/i.test(name))return 'apprenticeship_provider';
  if(/training|skills/i.test(name))return 'independent_training_provider';
  return null;
}
export function educationPartnershipHeadline(kind:EducationInstitutionType):string{
  const descriptions:Record<EducationInstitutionType,string>={
    university:'Industry collaboration and student progression',
    further_education_college:'Employer links and technical skills',
    sixth_form_college:'Work experience and careers insight',
    apprenticeship_provider:'Electrical apprenticeship employer pathways',
    independent_training_provider:'Skills development and employer introductions',
    adult_education:'Return-to-work and technical reskilling',
    skills_bootcamp:'Accelerated job-ready training and placements',
    other:'Education and workforce partnership discussion'
  };
  return descriptions[kind];
}
