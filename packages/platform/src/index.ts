export type Audience='consumer'|'business'|'provider'|'education'|'learner'|'admin';
export type CoverageStatus='closed'|'recruiting'|'ready'|'live';
export type ProviderVerificationStatus='pending'|'verified'|'suspended'|'expired';

export type LaunchThresholds={minimumVerifiedBusinesses:number;minimumProvidersPerLiveArea:number;minimumFillRate:number;maximumMedianMatchMinutes:number};
export type AreaReadiness={area:string;verifiedProviders:number;fillRate:number;medianMatchMinutes:number;status:CoverageStatus};
export type VerticalConfig={
  id:string;
  publicNamePlaceholder:string;
  providerSingular:string;
  providerPlural:string;
  positioning:string;
  services:string[];
  verificationRequirements:string[];
  launchThresholds:LaunchThresholds;
};

export function calculateAreaReadiness(area:string,verifiedProviders:number,fillRate:number,medianMatchMinutes:number,thresholds:LaunchThresholds):AreaReadiness{
  if(verifiedProviders===0)return{area,verifiedProviders,fillRate,medianMatchMinutes,status:'closed'};
  if(verifiedProviders<thresholds.minimumProvidersPerLiveArea)return{area,verifiedProviders,fillRate,medianMatchMinutes,status:'recruiting'};
  if(fillRate<thresholds.minimumFillRate||medianMatchMinutes>thresholds.maximumMedianMatchMinutes)return{area,verifiedProviders,fillRate,medianMatchMinutes,status:'ready'};
  return{area,verifiedProviders,fillRate,medianMatchMinutes,status:'live'};
}

export function canPubliclyClaimNationalCoverage(totalVerifiedBusinesses:number,thresholds:LaunchThresholds,areas:AreaReadiness[]):boolean{
  return totalVerifiedBusinesses>=thresholds.minimumVerifiedBusinesses&&areas.length>0&&areas.every(a=>a.status==='live');
}

export * from './verification';
export * from './domain';
export * from './matching';
