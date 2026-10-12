import {isAutonomyAdmin} from '@/lib/autonomy-admin';
import MissionControlClient from './mission-control-client';

export const dynamic='force-dynamic';
export const metadata={title:'Mission Control — Raeburn AutonomyOS'};
export default async function MissionControlPage(){
 if(!await isAutonomyAdmin()){
  return <section style={{maxWidth:760,margin:'5rem auto',padding:'2rem'}}>
    <h1>Administrator access required</h1>
    <p>Mission Control is restricted to authorised Raeburn operations administrators. Sign in using an account with server-managed autonomy administration permissions.</p>
  </section>;
 }
 return <MissionControlClient/>;
}
