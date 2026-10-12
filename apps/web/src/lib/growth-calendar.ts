export type BusyWindow={start:string;end:string};
export function isSlotFree(startIso:string,endIso:string,busy:BusyWindow[]):boolean{
  const start=Date.parse(startIso),end=Date.parse(endIso);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return false;
  return busy.every(b=>{
    const s=Date.parse(b.start),e=Date.parse(b.end);
    return Number.isFinite(s)&&Number.isFinite(e)&&!(start<e&&s<end);
  });
}

export type CalendarConfig={clientId:string;clientSecret:string;refreshToken:string;calendarId:string};
export function readCalendarConfig():CalendarConfig|null{
  const clientId=process.env.GROWTH_GOOGLE_CLIENT_ID;
  const clientSecret=process.env.GROWTH_GOOGLE_CLIENT_SECRET;
  const refreshToken=process.env.GROWTH_GOOGLE_REFRESH_TOKEN;
  const calendarId=process.env.GROWTH_GOOGLE_CALENDAR_ID;
  if(!clientId||!clientSecret||!refreshToken||!calendarId)return null;
  return {clientId,clientSecret,refreshToken,calendarId};
}
async function googleAccessToken(config:CalendarConfig):Promise<string>{
  const body=new URLSearchParams({
    client_id:config.clientId,client_secret:config.clientSecret,
    refresh_token:config.refreshToken,grant_type:'refresh_token'
  });
  const response=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:body.toString(),cache:'no-store',signal:AbortSignal.timeout(10_000)
  });
  const data=await response.json() as {access_token?:string};
  if(!response.ok||!data.access_token)throw new Error('calendar_auth_failed');
  return data.access_token;
}
export async function readGoogleCalendarBusy(config:CalendarConfig,start:string,end:string){
  const token=await googleAccessToken(config);
  const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({timeMin:start,timeMax:end,timeZone:'Europe/London',
      items:[{id:config.calendarId}]}),cache:'no-store',signal:AbortSignal.timeout(12_000)
  });
  const data=await response.json() as {calendars?:Record<string,{busy?:BusyWindow[];errors?:unknown[]}>};
  const calendar=data.calendars?.[config.calendarId];
  if(!response.ok||!calendar||calendar.errors?.length)throw new Error('calendar_freebusy_failed');
  return calendar.busy||[];
}
/** Called only after a meeting has been explicitly approved, not as a side effect of importing leads. */
export async function createApprovedGoogleMeeting(config:CalendarConfig,input:{
  requestId:string;contactName:string;email:string;purpose:string;start:string;end:string
}){
  const token=await googleAccessToken(config);
  const calendar=encodeURIComponent(config.calendarId);
  const id='raeburn'+input.requestId.replace(/-/g,'').slice(0,24);
  const url=`https://www.googleapis.com/calendar/v3/calendars/${calendar}/events?sendUpdates=all`;
  const response=await fetch(url,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({id,summary:'Raeburn Services partnership discussion',
      description:input.purpose.slice(0,1000),start:{dateTime:input.start,timeZone:'Europe/London'},
      end:{dateTime:input.end,timeZone:'Europe/London'},
      attendees:[{email:input.email,displayName:input.contactName}]}),
    signal:AbortSignal.timeout(12_000),cache:'no-store'
  });
  const data=await response.json() as {id?:string};
  if(!response.ok||!data.id)throw new Error('calendar_event_creation_failed');
  return data.id;
}
