'use client';
import {useCallback,useEffect,useState} from 'react';
import './mission-control.css';

type Control={domain:string;enabled:boolean};
type Job={id:string;kind:string;domain:string;status:string;attempts:number;updated_at:string};
type Incident={id:string;severity:string;category:string;summary:string;status:string;last_seen_at:string};
type Snapshot={controls:Control[];workflows:Job[];incidents:Incident[];
  kernelConfigured:boolean;alertsConfigured:boolean;generatedAt:string;
  recommendations:Array<{id:string;category:string;explanation:string;status:string}>};

export default function MissionControlClient(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  try{
   const response=await fetch('/api/autonomy/admin/status',{cache:'no-store'});
   if(!response.ok)throw Error('Unable to load operational data');
   setData(await response.json() as Snapshot);setError('');
  }catch{setError('Mission Control data is unavailable. Check database permissions and deployment health.');}
 },[]);
 useEffect(()=>{void refresh();const id=setInterval(()=>{void refresh()},30000);return()=>clearInterval(id)},[refresh]);
 async function changeControl(domain:string,enabled:boolean){
  if(enabled&&!window.confirm(`Enable the ${domain} autonomy domain? Other safety gates remain active.`))return;
  setBusy(domain);
  try{
   const res=await fetch('/api/autonomy/admin/controls',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({domain,enabled,confirmation:enabled?`ENABLE_${domain.toUpperCase()}`:undefined})
   });
   if(!res.ok)throw Error('Control not saved');
   await refresh();
  }catch{setError('Unable to update the control. No change is confirmed.')}
  finally{setBusy(null)}
 }
 async function cancelWorkflow(id:string){
  if(!window.confirm('Cancel this queued workflow? This cannot cancel work already running.'))return;
  setBusy(id);
  try{
   const res=await fetch(`/api/autonomy/admin/workflows/${id}/cancel`,{method:'POST'});
   if(!res.ok)throw Error('Cancel failed');
   await refresh();
  }catch{setError('Workflow could not be cancelled, possibly because a worker already claimed it.')}
  finally{setBusy(null)}
 }
 const jobs=data?.workflows||[];
 const openIncidents=(data?.incidents||[]).filter(x=>x.status==='open');
 const tiles=[
  {label:'Kernel',value:data?.kernelConfigured?'Configured':'Offline',hint:'Requires enabled domain and task flag'},
  {label:'Pending',value:String(jobs.filter(j=>j.status==='queued').length),hint:'Last 100 updated workflows'},
  {label:'Dead letters',value:String(jobs.filter(j=>j.status==='dead').length),hint:'Require reconciliation'},
  {label:'Open incidents',value:String(openIncidents.length),hint:'High-priority investigation'}
 ];
 return <div className="mission">
  <div className="mission-inner">
   <div className="mission-top">
    <div><p className="mission-eyebrow">RAEBURN AUTONOMYOS</p>
      <h1>Mission Control</h1><p className="mission-muted">Durable workflows, safety policy, incidents and operator oversight.</p></div>
    <div className="mission-pill">{data?.kernelConfigured?'Kernel configured':'Kernel offline'} · Production</div>
   </div>
   {error&&<div className="mission-error" role="alert">{error}</div>}
   {!data?<div className="mission-panel">Loading authorised operations…</div>:<>
    <div className="mission-tiles">{tiles.map(t=><div className="mission-tile" key={t.label}>
     <p>{t.label}</p><strong>{t.value}</strong><small>{t.hint}</small>
    </div>)}</div>
    <section className="mission-panel">
      <div className="mission-section-head"><h2>Autonomy domains</h2><span>Stop switches are enforced at the database level</span></div>
      <div className="mission-domains">{data.controls.map(c=><div key={c.domain} className="mission-domain">
       <div><strong>{c.domain.replaceAll('_',' ')}</strong><small>{c.enabled?'Enabled in database':'Disabled in database'}</small></div>
       <button type="button" disabled={busy!==null}
        className={c.enabled?'mission-button-danger':'mission-button'}
        onClick={()=>void changeControl(c.domain,!c.enabled)}>
        {busy===c.domain?'Saving…':c.enabled?'Pause domain':'Enable with confirmation'}
       </button>
      </div>)}</div>
      <p className="mission-note">Enabling a domain cannot bypass marketing consent, deployment feature flags, service competency checks or payment authorisation.</p>
    </section>
    <div className="mission-columns">
      <section className="mission-panel">
       <div className="mission-section-head"><h2>Execution queue</h2><span>Recent 100</span></div>
       <div className="mission-scroll"><table><thead><tr><th>Worker</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead>
        <tbody>{jobs.length===0?<tr><td colSpan={4}>No workflows have been scheduled.</td></tr>:
         jobs.slice(0,30).map(j=><tr key={j.id}><td>{j.kind}</td><td>{j.status}</td><td>{j.attempts}</td>
         <td>{j.status==='queued'?<button disabled={busy!==null} onClick={()=>void cancelWorkflow(j.id)}>Cancel</button>:'—'}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="mission-panel">
       <div className="mission-section-head"><h2>Incidents</h2><span>{openIncidents.length} open</span></div>
       {openIncidents.length===0?<p className="mission-muted">No open incidents recorded. This does not prove all external integrations are healthy.</p>:
        openIncidents.slice(0,10).map(x=><div className="mission-incident" key={x.id}>
          <strong>{x.severity.toUpperCase()} · {x.category}</strong><p>{x.summary}</p>
        </div>)}
       <div className="mission-divider"/><h3>Recommended decisions</h3>
       {(data.recommendations||[]).length===0?<p className="mission-muted">No evidence-backed recommendations yet.</p>:
         data.recommendations.slice(0,5).map(r=><p className="mission-muted" key={r.id}>{r.category}: {r.explanation} — {r.status}</p>)}
      </section>
    </div>
    <p className="mission-note">Last refreshed {new Date(data.generatedAt).toLocaleString('en-GB')}. Metrics cover recent stored records, not a contractual uptime guarantee. All live payments and outbound campaigns remain separately gated.</p>
   </>}
  </div>
 </div>;
}
