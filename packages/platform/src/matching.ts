export type MatchCandidate={
  providerId:string;
  coversArea:boolean;
  serviceMatch:boolean;
  verificationActive:boolean;
  availableNow:boolean;
  qualityScore:number;
  acceptanceRate:number;
  completionRate:number;
  reworkRate:number;
  coveragePriority?:number;
};

export type RankedCandidate=MatchCandidate&{score:number};

function clamp(value:number,min=0,max=1){return Math.min(max,Math.max(min,value))}

export function providerMatchScore(candidate:MatchCandidate):number{
  if(!candidate.verificationActive||!candidate.coversArea||!candidate.serviceMatch)return -Infinity;
  const quality=clamp(candidate.qualityScore/100);
  const acceptance=clamp(candidate.acceptanceRate);
  const completion=clamp(candidate.completionRate);
  const rework=clamp(candidate.reworkRate);
  const availability=candidate.availableNow?1:0;
  const priority=Math.max(0,Math.min(100,candidate.coveragePriority??50))/100;
  return Math.round((quality*.32+acceptance*.18+completion*.24+(1-rework)*.12+availability*.09+priority*.05)*10000)/100;
}

export function rankProviders(candidates:MatchCandidate[],excludedProviderIds:string[]=[]):RankedCandidate[]{
  const excluded=new Set(excludedProviderIds);
  return candidates
    .filter(candidate=>!excluded.has(candidate.providerId))
    .map(candidate=>({...candidate,score:providerMatchScore(candidate)}))
    .filter(candidate=>Number.isFinite(candidate.score))
    .sort((a,b)=>b.score-a.score||a.providerId.localeCompare(b.providerId));
}
