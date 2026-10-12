export type CoverageSignal={area:string;service_key:string;demand_count:number;verified_provider_count:number;gap_score:number};
export function suggestGrowthAction(s:CoverageSignal){
  if(!s.area||!s.service_key||s.demand_count<1)return null;
  if(s.verified_provider_count<3)return{
    category:'supply' as const,priority:Math.min(95,60+Math.round(s.gap_score/4)),
    reason:'Customer demand exists but verified service capacity is insufficient',
    reference:`supply:${s.area}:${s.service_key}`
  };
  if(s.demand_count>=5)return{
    category:'content' as const,priority:Math.min(80,35+s.demand_count),
    reason:'Evidence-backed local service information could help customers understand booking availability',
    reference:`content:${s.area}:${s.service_key}`
  };
  return null;
}
export function evidenceReminderStage(updatedAt:string,now:Date):'day3'|'day7'|null{
  const at=new Date(updatedAt).getTime();
  if(!Number.isFinite(at)||at>now.getTime())return null;
  const days=(now.getTime()-at)/86_400_000;
  return days>=7?'day7':days>=3?'day3':null;
}
