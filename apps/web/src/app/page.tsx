import Link from 'next/link';
import { electricalVertical } from '@service-business/electrical';

export default function HomePage() {
  return (
    <>
      <section className='hero'>
        <div><span className='eyebrow'>Managed service, not a lead directory</span><h1>{electricalVertical.publicNamePlaceholder}</h1><p>{electricalVertical.positioning}</p><div className='actions'><Link className='button primary' href='/book'>I need an electrician</Link><Link className='button' href='/business'>I manage properties or sites</Link></div></div>
        <aside className='panel'><strong>Choose your route</strong><Link href='/business'>Business & property portfolios <span>→</span></Link><Link href='/electricians'>Electricians: join the network <span>→</span></Link><Link href='/academy'>Colleges, learners & employers <span>→</span></Link></aside>
      </section>
      <section className='cards'><article><span>01</span><h2>Customers</h2><p>One accountable booking relationship from request to completion, records and support.</p></article><article><span>02</span><h2>Businesses</h2><p>Portfolio electrical management, compliance tracking, emergency response and consolidated reporting.</p></article><article><span>03</span><h2>Electricians</h2><p>Allocated work without shared-lead auctions, backed by transparent standards and a public verified profile.</p></article><article><span>04</span><h2>Academy</h2><p>Connect education, learners and employers so workforce capacity grows where demand exists.</p></article></section>
    </>
  );
}
