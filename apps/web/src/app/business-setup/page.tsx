import { BusinessSetupWizard } from './BusinessSetupWizard';

export const metadata={title:'Start your electrical business | National Electrician Hub'};

export default function BusinessSetupPage(){
  return <section className='page'><div className='portal-heading'><div><span className='eyebrow'>Raeburn Services business setup</span><h1>Qualified electrician, no business yet?</h1><p className='lede'>Build the operating structure around your work without silently filing anything on your behalf. Choose a route, create the launch pack, and approve each legal filing separately.</p></div></div><div className='split'><section className='portal-card'><h2>What the setup route prepares</h2><ul><li>sole-trader vs limited-company decision support</li><li>business profile and launch checklist</li><li>pricing, coverage and service setup</li><li>payments and finance onboarding</li><li>insurance/compliance checklist</li><li>HMRC/Companies House preparation points where relevant</li></ul><p className='note'>This workflow provides structured operational guidance, not personal legal or tax advice. It deliberately stops at approval checkpoints before external filings.</p></section><BusinessSetupWizard/></div></section>;
}
