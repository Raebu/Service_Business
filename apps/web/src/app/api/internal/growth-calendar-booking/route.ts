import {NextResponse} from 'next/server';
import {internalRequestAuthorised} from '@/lib/internal';
import {getAdminSupabase} from '@/lib/supabase/admin';
import {readCalendarConfig,readGoogleCalendarBusy,isSlotFree,createApprovedGoogleMeeting} from '@/lib/growth-calendar';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request:Request){
  if(!internalRequestAuthorised(request))return NextResponse.json({error:'Unauthorised'},{status:401});
  if(process.env.ENABLE_APPROVED_GROWTH_MEETINGS!=='true')
    return NextResponse.json({enabled:false,booked:0});
  const config=readCalendarConfig();
  if(!config)return NextResponse.json({error:'Google Calendar OAuth not configured'},{status:503});
  try{
    const db=getAdminSupabase();
    const {data:rows,error}=await db.from('growth_meeting_requests')
      .select('id,contact_name,email,purpose,proposed_start,status')
      .eq('status','approved').not('proposed_start','is',null)
      .order('proposed_start',{ascending:true}).limit(5);
    if(error)return NextResponse.json({error:'Meeting review queue unavailable'},{status:503});
    let booked=0,held=0;
    for(const meeting of rows||[]){
      const start=new Date(meeting.proposed_start as string);
      const end=new Date(start.getTime()+30*60_000);
      if(!Number.isFinite(start.getTime())||start.getTime()<Date.now()+60*60_000
        ||end.getTime()>Date.now()+90*86400_000){held++;continue;}
      const busy=await readGoogleCalendarBusy(config,start.toISOString(),end.toISOString());
      if(!isSlotFree(start.toISOString(),end.toISOString(),busy)){held++;continue;}
      const {data:claimed,error:claimError}=await db.from('growth_meeting_requests')
        .update({status:'invited'}).eq('id',meeting.id).eq('status','approved')
        .select('id').maybeSingle();
      if(claimError||!claimed){held++;continue;}
      try{
        const calendarEventId=await createApprovedGoogleMeeting(config,{
          requestId:meeting.id,contactName:meeting.contact_name,email:meeting.email,
          purpose:meeting.purpose,start:start.toISOString(),end:end.toISOString()
        });
        const {error:saveError}=await db.from('growth_meeting_requests')
          .update({status:'booked',calendar_event_id:calendarEventId})
          .eq('id',meeting.id).eq('status','invited');
        if(saveError)return NextResponse.json({error:'Calendar booking requires reconciliation',booked},{status:503});
        booked++;
      }catch{
        // A calendar API timeout is ambiguous. Leave invited until manually
        // reconciled, rather than double-booking on next worker run.
        held++;
      }
    }
    return NextResponse.json({enabled:true,booked,held,reviewed:rows?.length||0});
  }catch{return NextResponse.json({error:'Calendar integration unavailable'},{status:503});}
}
