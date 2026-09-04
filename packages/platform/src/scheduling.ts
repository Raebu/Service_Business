export type ScheduleMode='asap'|'exact'|'window'|'flexible';
export type Interval={start:Date;end:Date};

export type SlotFeasibilityInput={
  requestedStart:Date;
  durationMinutes:number;
  workingWindow:Interval;
  busy:Interval[];
  travelBeforeMinutes?:number;
  travelAfterMinutes?:number;
  bufferMinutes?:number;
};

export type SlotFeasibility={
  feasible:boolean;
  serviceStart:Date;
  serviceEnd:Date;
  blockedStart:Date;
  blockedEnd:Date;
  reason?:'outside_working_hours'|'conflict';
};

export function intervalsOverlap(a:Interval,b:Interval){
  return a.start<b.end&&b.start<a.end;
}

export function checkSlotFeasibility(input:SlotFeasibilityInput):SlotFeasibility{
  if(input.durationMinutes<=0)throw new Error('duration_must_be_positive');
  const travelBefore=input.travelBeforeMinutes??0;
  const travelAfter=input.travelAfterMinutes??0;
  const buffer=input.bufferMinutes??0;
  const serviceStart=new Date(input.requestedStart);
  const serviceEnd=new Date(serviceStart.getTime()+input.durationMinutes*60_000);
  const blockedStart=new Date(serviceStart.getTime()-(travelBefore+buffer)*60_000);
  const blockedEnd=new Date(serviceEnd.getTime()+(travelAfter+buffer)*60_000);
  if(blockedStart<input.workingWindow.start||blockedEnd>input.workingWindow.end){
    return{feasible:false,serviceStart,serviceEnd,blockedStart,blockedEnd,reason:'outside_working_hours'};
  }
  if(input.busy.some(existing=>intervalsOverlap({start:blockedStart,end:blockedEnd},existing))){
    return{feasible:false,serviceStart,serviceEnd,blockedStart,blockedEnd,reason:'conflict'};
  }
  return{feasible:true,serviceStart,serviceEnd,blockedStart,blockedEnd};
}

export function normaliseScheduleRequest(input:{mode:ScheduleMode;start?:Date|null;end?:Date|null}){
  if(input.mode==='asap')return{mode:'asap' as const,start:null,end:null};
  if(!input.start)throw new Error('scheduled_start_required');
  if(input.mode==='exact')return{mode:'exact' as const,start:input.start,end:input.start};
  if(!input.end||input.end<=input.start)throw new Error('valid_schedule_window_required');
  return{mode:input.mode,start:input.start,end:input.end};
}
