import Link from 'next/link';

const reasons = [
  ['Allocated work, not shared leads','Suitable jobs are routed to the network instead of selling the same enquiry to multiple electricians.'],
  ['Transparent commercial terms','Know the scope, customer expectations and commercial model before accepting work.'],
  ['Build trust publicly','Verified members receive a public profile and website badge linking back to live verification status.'],
  ['Less admin','One place for jobs, scheduling, compliance status, earnings and records.'],
  ['Grow your workforce','Opt into Academy placements, apprentices and mentoring opportunities.'],
  ['Coverage-based opportunity','Recruitment follows real demand gaps rather than adding providers blindly.']
];

export default function ElectriciansPage(){return <section className='page'><span className='eyebrow'>For electrical businesses</span><h1>Get work through the network.</h1><p className='lede'>Applications are opening for founding electrical businesses. Join a managed national network built to make good contractors easier to find, trust and work with.</p><div className='cards three'>{reasons.map(([title,text])=><article key={title}><h2>{title}</h2><p>{text}</p></article>)}</div><section className='callout'><div><span className='eyebrow'>Founding Electrician Programme</span><h2>Help shape the network before public launch.</h2><p>Founding members can receive early-area priority, a verified-member profile and badge, and a voice in the operating standards before wider consumer marketing starts.</p></div><div className='actions vertical'><Link className='button primary' href='/electricians/apply'>Apply as an electrical business</Link><Link className='button' href='/electricians/how-it-works'>See how work allocation works</Link><Link className='button' href='/electricians/verification'>Verification & badge standards</Link></div></section></section>}
