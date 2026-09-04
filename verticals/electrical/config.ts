import type { VerticalConfig } from '../../packages/platform/src/index';

export const electricalServices=['Emergency electrical work','EICR','Fault finding','Consumer units','Sockets & lighting','EV charging','Landlord compliance','Commercial maintenance'] as const;
export type ElectricalService=(typeof electricalServices)[number];
export type ScopeLane='fixed'|'estimate_range'|'diagnostic_visit'|'manual_exception';

export const electricalBrand={
  name:'National Electrician Hub',
  slug:'national-electrician-hub',
  tagline:'Connecting customers, businesses and electricians across the UK.',
  legalOperator:'The Raeburn Holding Group Limited',
  legalOperatorCompanyNumber:'17361231',
  umbrellaTradingName:'Raeburn Services'
} as const;

export const electricalVertical:VerticalConfig={
  id:'electrical',
  publicNamePlaceholder:electricalBrand.name,
  providerSingular:'electrician',
  providerPlural:'electricians',
  positioning:electricalBrand.tagline,
  services:[...electricalServices],
  verificationRequirements:['Business identity','Qualification and/or competent-person scheme evidence','Public liability insurance','Coverage and service capabilities','Ongoing expiry monitoring','Acceptance of network standards'],
  launchThresholds:{minimumVerifiedBusinesses:100,minimumProvidersPerLiveArea:3,minimumFillRate:.95,maximumMedianMatchMinutes:15}
};

const rules:Array<{service:ElectricalService;pattern:RegExp}>=[
  {service:'Emergency electrical work',pattern:/\b(emergency|no power|power (?:is )?out|burning smell|sparking|electric shock|live wire)\b/i},
  {service:'EICR',pattern:/\b(eicr|electrical installation condition report|electrical safety certificate)\b/i},
  {service:'EV charging',pattern:/\b(ev|electric vehicle|car charger|charge point|wallbox)\b/i},
  {service:'Consumer units',pattern:/\b(consumer unit|fuse ?box|rcd|mcb|breaker|fuse board)\b/i},
  {service:'Sockets & lighting',pattern:/\b(socket|plug|light|lighting|downlight|switch|ceiling light|spotlight)\b/i},
  {service:'Landlord compliance',pattern:/\b(landlord|rental|tenan(?:t|cy)|letting|hmo|compliance)\b/i},
  {service:'Commercial maintenance',pattern:/\b(commercial|office|warehouse|shop|retail|industrial|facilities|estate)\b/i},
  {service:'Fault finding',pattern:/\b(fault|tripping|trip|intermittent|not working|keeps going off|diagnos)\b/i}
];

export function classifyElectricalService(description:string):ElectricalService{
  return rules.find(rule=>rule.pattern.test(description))?.service||'Fault finding';
}

const fixedScope=/\b(eicr|replace (?:a )?(?:socket|switch|light fitting)|install (?:a )?(?:socket|light fitting)|ev charger|wallbox|consumer unit replacement)\b/i;
const uncertainScope=/\b(intermittent|unknown|not sure|sometimes|multiple faults|rewire|extension|renovation|whole house|complex|investigate)\b/i;
const remoteEvidence=/\b(photo|photos|picture|video|model number|make|serial|measurements?)\b/i;

export function classifyElectricalScope(description:string,service:ElectricalService):{lane:ScopeLane;confidence:number;requiresCustomerApproval:boolean;assumptions:string[]}{
  if(service==='Emergency electrical work')return{lane:'diagnostic_visit',confidence:.9,requiresCustomerApproval:true,assumptions:['Emergency work requires on-site safety assessment before follow-on work is approved.']};
  if(fixedScope.test(description)&&!uncertainScope.test(description))return{lane:'fixed',confidence:.92,requiresCustomerApproval:false,assumptions:['Scope matched a standard service pattern and remains subject to provider rate-card eligibility.']};
  if(uncertainScope.test(description))return{lane:'diagnostic_visit',confidence:.88,requiresCustomerApproval:true,assumptions:['Description contains uncertainty or broad scope, so a diagnostic visit must precede chargeable follow-on work.']};
  if(remoteEvidence.test(description))return{lane:'estimate_range',confidence:.72,requiresCustomerApproval:true,assumptions:['Evidence may support a range, but the platform must not present it as a guaranteed fixed price.']};
  if(service==='Fault finding')return{lane:'diagnostic_visit',confidence:.82,requiresCustomerApproval:true,assumptions:['Fault-finding cannot be safely guaranteed from remote description alone.']};
  return{lane:'estimate_range',confidence:.62,requiresCustomerApproval:true,assumptions:['Scope is potentially estimable but needs matched-provider pricing before commitment.']};
}
