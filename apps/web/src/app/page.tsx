import Link from 'next/link';
import { electricalBrand } from '@service-business/electrical';

export default function HomePage() {
  return (
    <>
      <section className='hero'>
        <div>
          <span className='eyebrow'>UK-wide managed electrician platform</span>
          <h1>{electricalBrand.name}</h1>
          <p>{electricalBrand.tagline}</p>
          <div className='actions'>
            <Link className='button primary' href='/book'>Find an electrician</Link>
            <Link className='button' href='/business'>For businesses & property portfolios</Link>
          </div>
        </div>
        <aside className='panel'>
          <strong>Choose your route</strong>
          <Link href='/book'>Customers: request electrical work <span>→</span></Link>
          <Link href='/business'>Businesses: manage electrical services <span>→</span></Link>
          <Link href='/electricians'>Electricians: get work through the network <span>→</span></Link>
          <Link href='/academy'>Training providers, learners & employers <span>→</span></Link>
        </aside>
      </section>
      <section className='cards'>
        <article><span>01</span><h2>Customers</h2><p>Find and book vetted electricians through one accountable service from request to completion, records and support.</p></article>
        <article><span>02</span><h2>Businesses</h2><p>Manage electrical work across sites and portfolios with compliance tracking, emergency response and consolidated reporting.</p></article>
        <article><span>03</span><h2>Electricians</h2><p>Receive suitable allocated work without shared-lead auctions, with transparent pricing, standards, payments and a public verified profile.</p></article>
        <article><span>04</span><h2>Academy</h2><p>Connect education, learners and verified employers so local electrical workforce capacity grows where demand exists.</p></article>
      </section>
    </>
  );
}
