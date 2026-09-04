import type { VerticalConfig } from '../../packages/platform/src/index';

export const electricalServices=['Emergency electrical work','EICR','Fault finding','Consumer units','Sockets & lighting','EV charging','Landlord compliance','Commercial maintenance'] as const;
export type ElectricalService=(typeof electricalServices)[number];

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
