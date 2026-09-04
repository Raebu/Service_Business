import type { VerticalConfig } from '../../packages/platform/src/index';

export const electricalVertical:VerticalConfig={
  id:'electrical',
  publicNamePlaceholder:'Electrical service brand',
  providerSingular:'electrician',
  providerPlural:'electricians',
  positioning:'Book vetted electrical businesses through one managed service for matching, standards, records and support.',
  services:['Emergency electrical work','EICR','Fault finding','Consumer units','Sockets & lighting','EV charging','Landlord compliance','Commercial maintenance'],
  verificationRequirements:['Business identity','Qualification and/or competent-person scheme evidence','Public liability insurance','Coverage and service capabilities','Ongoing expiry monitoring','Acceptance of network standards'],
  launchThresholds:{minimumVerifiedBusinesses:100,minimumProvidersPerLiveArea:3,minimumFillRate:.95,maximumMedianMatchMinutes:15}
};
