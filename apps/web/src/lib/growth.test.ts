import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {eligibleForOutreach,renderGrowthEmail,classifyGrowthReply,verifyResendSignature,type ProspectEligibility} from './growth';

const contact:ProspectEligibility={
 companyType:'corporate',legalBasis:'legitimate_interests',consentAt:null,
 directEmail:'director@contractor.example',domain:'contractor.example',domainMatched:true,
 emailVerified:true,contactName:'Company Director',sourceUrl:'https://example.com/source',
 privacyNoticeUrl:'https://example.com/privacy',lawfulBasisEvidence:'A documented interest assessment',
 suppressed:false
};

test('verified corporate contact requires complete compliance evidence',()=>{
 assert.equal(eligibleForOutreach(contact),true);
 assert.equal(eligibleForOutreach({...contact,companyType:'unknown'}),false);
 assert.equal(eligibleForOutreach({...contact,suppressed:true}),false);
 assert.equal(eligibleForOutreach({...contact,directEmail:'info@contractor.example'}),false);
 assert.equal(eligibleForOutreach({...contact,domain:'wrong.example'}),false);
});
test('individual subscribers require recorded permission',()=>{
 assert.equal(eligibleForOutreach({...contact,companyType:'individual'}),false);
 assert.equal(eligibleForOutreach({...contact,companyType:'individual',legalBasis:'consent',consentAt:'2026-01-02T00:00:00Z'}),true);
});
test('outreach always includes unsubscribe and safely encodes displayed content',()=>{
 const rendered=renderGrowthEmail({subject:'Invite {{organisationName}}',message:'Hello {{contactName}}'},{
   contactName:'Sam & Co',organisationName:'Example Ltd',area:'SO',serviceKey:'EICR',
   unsubscribeUrl:'https://example.com/api/growth/unsubscribe?token=test'
 });
 assert.ok(rendered.html.includes('Sam &amp; Co'));
 assert.ok(rendered.text.includes('Unsubscribe')||rendered.text.includes('unsubscribe'));
});
test('opt out overrides other reply intents',()=>{
 assert.equal(classifyGrowthReply('Interested','stop emailing me'), 'unsubscribe');
 assert.equal(classifyGrowthReply('Hello','Not interested'), 'not_interested');
 assert.equal(classifyGrowthReply('Meeting','Can we book a call?'), 'interested');
});
test('Resend signatures are authenticated and time bounded',()=>{
 const key=Buffer.alloc(32,7),secret='whsec_'+key.toString('base64');
 const id='msg_test',timestamp='1791769000',raw='{"type":"email.received"}';
 const signature='v1,'+createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64');
 const headers={id,timestamp,signature};
 assert.equal(verifyResendSignature(raw,headers,secret,1791769000),true);
 assert.equal(verifyResendSignature(raw+' ',headers,secret,1791769000),false);
 assert.equal(verifyResendSignature(raw,{...headers,timestamp:'1'},secret,1791769000),false);
});
