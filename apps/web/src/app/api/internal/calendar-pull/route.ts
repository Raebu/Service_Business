import { NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { getAdminSupabase,SupabaseConfigurationError } from '@/lib/supabase/admin';
import { internalRequestAuthorised } from '@/lib/internal';

const BATCH=25;
const MAX_BYTES=2_000_000;
const LOOKAHEAD_DAYS=180;

function safeCalendarUrl(raw:string){
  let url:URL;try{url=new URL(raw)}catch{return null}
  if(url.protocol!=='https:')return null;
  const host=url.hostname.toLowerCase();
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))return null;
  const ip=isIP(host);if(ip){
    if(host.startsWith('10.')||host.startsWith('127.')||host.startsWith('169.254.')||host.startsWith('192.168.')||host==='::1'||host.startsWith('fc')||host.startsWith('fd'))return null;
    if(host.startsWith('172.')){const second=Number(host.split('.')[1]);if(second>=16&&second<=31)return null}
  }
  return url;
}

function unfold(text:string){return text.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/)}
function parseIcsDate(value:string){
  const v=value.trim();
  if(/^\d{8}T\d{6}Z$/.test(v))return new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}Z`);
  if(/^\d{8}T\d{6}$/.test(v))return new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:${v.slice(13,15)}`);
  if(/^\d{8}$/.test(v))return new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T00:00:00`);
  const parsed=new Date(v);return Number.isNaN(parsed.getTime())?null:parsed;
}

type Busy={externalEventId:string;startsAt:string;endsAt:string;etag:string|null};
function parseBusy(text:string):Busy[]{
  const lines=unfold(text);const events:Busy[]=[];let current:Record<string,string>|null=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){current={};continue}
    if(line==='END:VEVENT'&&current){
      const startRaw=current.DTSTART,endRaw=current.DTEND,uid=current.UID;
      const start=startRaw?parseIcsDate(startRaw):null;const end=endRaw?parseIcsDate(endRaw):null;
      if(uid&&start&&end&&end>start)events.push({externalEventId:uid.slice(0,500),startsAt:start.toISOString(),endsAt:end.toISOString(),etag:(current.SEQUENCE||current['LAST-MODIFIED']||null)?.slice(0,500)||null});
      current=null;continue
    }
    if(!current)continue;const idx=line.indexOf(':');if(idx<0)continue;const left=line.slice(0,idx);const value=line.slice(idx+1);const key=left.split(';')[0];if(['UID','DTSTART','DTEND','SEQUENCE','LAST-MODIFIED'].includes(key))current[key]=value;
  }
  const now=Date.now()-86_400_000;const max=Date.now()+LOOKAHEAD_DAYS*86_400_000;return events.filter(e=>new Date(e.endsAt).getTime()>=now&&new Date(e.startsAt).getTime()<=max).slice(0,1000);
}

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised.'},{status:401});
  try{
    const db=getAdminSupabase();const {data:connections,error}=await db.from('provider_calendar_connections').select('id,engineer_id,external_calendar_id,status').eq('provider','ical').neq('status','revoked').limit(BATCH);
    if(error)return NextResponse.json({error:'Unable to load iCalendar connections.'},{status:500});
    const results:Array<Record<string,unknown>>=[];
    for(const connection of connections||[]){
      const url=connection.external_calendar_id?safeCalendarUrl(connection.external_calendar_id):null;
      if(!url){await db.from('provider_calendar_connections').update({status:'error',last_error:'iCalendar connection must use a public HTTPS URL.',updated_at:new Date().toISOString()}).eq('id',connection.id);results.push({connectionId:connection.id,status:'invalid_url'});continue}
      try{
        const response=await fetch(url,{redirect:'error',headers:{accept:'text/calendar, text/plain;q=0.9'},signal:AbortSignal.timeout(12_000)});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const length=Number(response.headers.get('content-length')||0);if(length>MAX_BYTES)throw new Error('Calendar feed is too large.');
        const text=await response.text();if(Buffer.byteLength(text,'utf8')>MAX_BYTES)throw new Error('Calendar feed is too large.');
        const blocks=parseBusy(text);const ids=blocks.map(b=>b.externalEventId);
        if(blocks.length){const rows=blocks.map(b=>({connection_id:connection.id,external_event_id:b.externalEventId,starts_at:b.startsAt,ends_at:b.endsAt,etag:b.etag,updated_at:new Date().toISOString()}));const {error:upsertError}=await db.from('external_calendar_busy_blocks').upsert(rows,{onConflict:'connection_id,external_event_id'});if(upsertError)throw new Error(upsertError.message)}
        const {data:existing}=await db.from('external_calendar_busy_blocks').select('external_event_id').eq('connection_id',connection.id);
        const stale=(existing||[]).map(x=>x.external_event_id).filter(id=>!ids.includes(id));if(stale.length)await db.from('external_calendar_busy_blocks').delete().eq('connection_id',connection.id).in('external_event_id',stale);
        const now=new Date().toISOString();await db.from('provider_calendar_connections').update({status:'active',last_synced_at:now,last_error:null,updated_at:now}).eq('id',connection.id);
        await db.from('audit_events').insert({event_type:'calendar.ical_pulled',entity_type:'engineer',entity_id:connection.engineer_id,metadata:{connectionId:connection.id,busyBlocks:blocks.length,lookaheadDays:LOOKAHEAD_DAYS}});
        results.push({connectionId:connection.id,status:'active',busyBlocks:blocks.length});
      }catch(error){const message=error instanceof Error?error.message:'Calendar pull failed';await db.from('provider_calendar_connections').update({status:'error',last_error:message.slice(0,1000),updated_at:new Date().toISOString()}).eq('id',connection.id);results.push({connectionId:connection.id,status:'error',error:message})}
    }
    return NextResponse.json({processed:results.length,results});
  }catch(error){if(error instanceof SupabaseConfigurationError)return NextResponse.json({error:'Production database credentials are not configured.'},{status:503});return NextResponse.json({error:'Calendar pull worker failed.'},{status:500})}
}
