import type { Metadata } from 'next';
import Link from 'next/link';
import './styles.css';

export const metadata: Metadata = {
  title: 'Service Business Platform',
  description: 'Managed service marketplace platform'
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
          <Link className='brand' href='/'>SERVICE PLATFORM</Link>
          <nav>{nav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
        </header>
        <main>{children}</main>
        <footer className='footer'>
          <div><strong>Customers</strong><Link href='/'>Book a service</Link><Link href='/business'>Business services</Link><Link href='/account'>Sign in</Link></div>
          <div><strong>Providers</strong><Link href='/electricians'>For electricians</Link><Link href='/academy'>Training & careers</Link><Link href='/trust'>Verification standards</Link></div>
          <div><strong>Company</strong><Link href='/about'>About</Link><Link href='/trust'>Trust centre</Link><Link href='/security'>Security</Link><Link href='/compliance'>Compliance</Link></div>
          <div><strong>Legal</strong><Link href='/privacy'>Privacy</Link><Link href='/terms'>Terms</Link><Link href='/accessibility'>Accessibility</Link><Link href='/complaints'>Complaints</Link></div>
        </footer>
      </body>
    </html>
  );
}
