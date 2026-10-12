import type {WorkflowKind} from '@/lib/autonomy';
import {POST as dispatch} from '@/app/api/internal/dispatch/route';
import {POST as notifications} from '@/app/api/internal/notifications/route';
import {POST as compliance} from '@/app/api/internal/compliance/route';
import {POST as recovery_monitor} from '@/app/api/internal/recovery-monitor/route';
import {POST as sla_monitor} from '@/app/api/internal/sla-monitor/route';
import {POST as reconciliation} from '@/app/api/internal/reconciliation/route';
import {POST as operational_kpis} from '@/app/api/internal/operational-kpis/route';
import {POST as quality_ranking} from '@/app/api/internal/quality-ranking/route';
import {POST as labour_demand} from '@/app/api/internal/labour-demand/route';
import {POST as coverage_recruitment} from '@/app/api/internal/coverage-recruitment/route';
import {POST as finance_close} from '@/app/api/internal/finance-close/route';
import {POST as reserves} from '@/app/api/internal/reserves/route';
import {POST as competency_lifecycle} from '@/app/api/internal/competency-lifecycle/route';
import {POST as provider_nurture} from '@/app/api/internal/provider-nurture/route';
import {POST as growth_intelligence} from '@/app/api/internal/growth-intelligence/route';
import {POST as growth_outreach} from '@/app/api/internal/growth-outreach/route';
import {POST as education_discovery} from '@/app/api/internal/education-discovery/route';
import {POST as approved_calendar_booking} from '@/app/api/internal/growth-calendar-booking/route';
import {POST as assurance} from '@/app/api/internal/autonomy/assurance/route';

/** Fixed registry: workflow payloads never control a handler path or executable action. */
export const handlers:Record<WorkflowKind,{path:string;run:(request:Request)=>Promise<Response>}>={
 dispatch:{path:'/api/internal/dispatch',run:dispatch},
 notifications:{path:'/api/internal/notifications',run:notifications},
 compliance:{path:'/api/internal/compliance',run:compliance},
 recovery_monitor:{path:'/api/internal/recovery-monitor',run:recovery_monitor},
 sla_monitor:{path:'/api/internal/sla-monitor',run:sla_monitor},
 reconciliation:{path:'/api/internal/reconciliation',run:reconciliation},
 operational_kpis:{path:'/api/internal/operational-kpis',run:operational_kpis},
 quality_ranking:{path:'/api/internal/quality-ranking',run:quality_ranking},
 labour_demand:{path:'/api/internal/labour-demand',run:labour_demand},
 coverage_recruitment:{path:'/api/internal/coverage-recruitment',run:coverage_recruitment},
 finance_close:{path:'/api/internal/finance-close',run:finance_close},
 reserves:{path:'/api/internal/reserves',run:reserves},
 competency_lifecycle:{path:'/api/internal/competency-lifecycle',run:competency_lifecycle},
 provider_nurture:{path:'/api/internal/provider-nurture',run:provider_nurture},
 growth_intelligence:{path:'/api/internal/growth-intelligence',run:growth_intelligence},
 growth_outreach:{path:'/api/internal/growth-outreach',run:growth_outreach},
 education_discovery:{path:'/api/internal/education-discovery',run:education_discovery},
 approved_calendar_booking:{path:'/api/internal/growth-calendar-booking',run:approved_calendar_booking},
 assurance:{path:'/api/internal/autonomy/assurance',run:assurance}
};
