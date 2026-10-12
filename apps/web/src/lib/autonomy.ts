/** AutonomyOS never accepts executable code or arbitrary URLs from a workflow payload. */
export const workflowDomains={
  dispatch:'operations',compliance:'operations',recovery_monitor:'operations',
  sla_monitor:'operations',competency_lifecycle:'operations',
  notifications:'communications',
  coverage_recruitment:'growth',growth_intelligence:'growth',growth_outreach:'growth',
  education_discovery:'partnerships',approved_calendar_booking:'partnerships',
  provider_nurture:'partnerships',
  reconciliation:'finance',finance_close:'finance',reserves:'finance',
  operational_kpis:'assurance',quality_ranking:'assurance',
  labour_demand:'assurance',assurance:'assurance'
} as const;
export type WorkflowKind=keyof typeof workflowDomains;
export type AutonomyDomain=typeof workflowDomains[WorkflowKind];
export const actionRisk:Record<WorkflowKind,'read'|'operational'|'financial'|'external'>={
  dispatch:'operational',compliance:'read',recovery_monitor:'operational',
  sla_monitor:'read',competency_lifecycle:'operational',
  notifications:'external',coverage_recruitment:'read',
  growth_intelligence:'read',growth_outreach:'external',
  education_discovery:'read',approved_calendar_booking:'external',
  provider_nurture:'external',reconciliation:'financial',
  finance_close:'financial',reserves:'financial',
  operational_kpis:'read',quality_ranking:'read',labour_demand:'read',assurance:'read'
};
export function isWorkflowKind(value:string):value is WorkflowKind{
  return Object.prototype.hasOwnProperty.call(workflowDomains,value);
}
export function retryBackoffSeconds(attempt:number){
  return Math.min(3600,30*3**Math.max(0,Math.floor(attempt)-1));
}
export function canRunWorkflow(kind:string,env:Record<string,string|undefined>){
  if(!isWorkflowKind(kind)||env.AUTONOMY_KERNEL_ENABLED!=='true')return false;
  switch(kind){
    case 'growth_outreach':return env.ENABLE_AUTONOMOUS_OUTREACH==='true';
    case 'education_discovery':return env.ENABLE_EDUCATION_DISCOVERY==='true';
    case 'approved_calendar_booking':return env.ENABLE_APPROVED_GROWTH_MEETINGS==='true';
    case 'provider_nurture':return env.ENABLE_PROVIDER_NURTURE==='true';
    case 'growth_intelligence':return env.ENABLE_GROWTH_INTELLIGENCE==='true';
    case 'dispatch':case 'notifications':case 'compliance':case 'recovery_monitor':
    case 'sla_monitor':case 'reconciliation':
      return env.ENABLE_OPERATIONAL_CYCLE==='true';
    case 'finance_close':return env.ENABLE_DAILY_AUTONOMY==='true'
      &&env.ENABLE_AUTOMATED_FINANCE_CLOSE==='true';
    case 'reserves':return env.ENABLE_DAILY_AUTONOMY==='true'
      &&env.ENABLE_AUTOMATED_RESERVE_RELEASE==='true';
    case 'competency_lifecycle':case 'coverage_recruitment':
    case 'labour_demand':case 'quality_ranking':
    case 'operational_kpis':case 'assurance':return env.ENABLE_DAILY_AUTONOMY==='true';
    default:return false;
  }
}
export function isRunSuccess(status:number):boolean{
  return status>=200&&status<300&&status!==207;
}
/** Never delegate settlements, refunds, qualification approval or publishing to this kernel. */
export const excludedFromAutonomy=[
  'stripe_transfer','provider_settlement','refund','approve_provider',
  'approve_electrical_qualification','publish_content','activate_service_area'
] as const;

/** Browser-admin mutations require same-origin POSTs; never accept cross-site requests. */
export function sameOriginAdminRequest(origin:string|null,url:string):boolean{
 if(!origin)return false;
 try{return new URL(origin).origin===new URL(url).origin}
 catch{return false}
}
