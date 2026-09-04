import type { Metadata } from 'next';
import Link from 'next/link';
import { electricalBrand } from '@service-business/electrical';
import './styles.css';
import './brand.css';

export const metadata: Metadata = {
  title: {
    default: electricalBrand.name,
    template: `%s | ${electricalBrand.name}`
  },
  description: electricalBrand.tagline
};

const nav = [
  ['/', 'Home'],
  ['/business', 'For businesses'],
  ['/electricians', 'For electricians'],
  ['/academy', 'Training & careers'],
  ['/trust', 'Trust'],
  ['/about', 'About'],
  ['/account', 'Sign in']
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='en'>
      <body>
        <header className='site-header'>
          <Link className='brand' href='/' aria-label={`${electricalBrand.name} home`}>
            <span className='brand-mark' aria-hidden='true'>NEH</span>
            <span>{electricalBrand.name}</span>
          </Link>
          <nav>{nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        </header>
        <main>{children}</main>
        <footer className='footer'>
          <div><strong>Customers</strong><Link href='/book'>Find an electrician</Link><Link href='/business'>Business services</Link><Link href='/account'>Sign in</Link></div>
          <div><strong>Electricians</strong><Link href='/electricians'>Get work through the network</Link><Link href='/academy'>Training & careers</Link><Link href='/trust'>Verification standards</Link></div>
          <div><strong>Company</strong><Link href='/about'>About</Link><Link href='/trust'>Trust centre</Link><Link href='/security'>Security</Link><Link href='/compliance'>Compliance</Link></div>
          <div><strong>Legal</strong><Link href='/privacy'>Privacy</Link><Link href='/terms'>Terms</Link><Link href='/accessibility'>Accessibility</Link><Link href='/complaints'>Complaints</Link></div>
          <div className='footer-legal'>
            <strong>{electricalBrand.name}</strong>
            <p>{electricalBrand.name} and {electricalBrand.umbrellaTradingName} are trading names of {electricalBrand.legalOperator}.</p>
            <p>Registered in England and Wales. Company No. {electricalBrand.legalOperatorCompanyNumber}.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
