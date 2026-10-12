import test from 'node:test';
import assert from 'node:assert/strict';
import {educationDiscoveryClassification,educationPartnershipHeadline,
 educationProspectSourceRole,qualifyEducationCandidate,type InstitutionCandidate} from './education-partnerships';

const valid:InstitutionCandidate={
 name:'Example University',domain:'example.ac.uk',sourceReference:'apollo:organization:abc123',
 sourceUrl:'https://www.example.ac.uk/employers',institutionType:'university',
 interests:['student_placements','industry_projects'],region:'Hampshire'
};
test('higher education candidate is only research-qualified with provenance',()=>{
 assert.equal(qualifyEducationCandidate(valid),true);
 assert.equal(qualifyEducationCandidate({...valid,domain:'fake..ac.uk'}),false);
 assert.equal(qualifyEducationCandidate({...valid,sourceUrl:'http://example.ac.uk'}),false);
 assert.equal(qualifyEducationCandidate({...valid,interests:['student_placements','student_placements']}),false);
});
test('university and training provision is distinguished without inventing contacts',()=>{
 assert.equal(educationDiscoveryClassification('Example University'),'university');
 assert.equal(educationDiscoveryClassification('Example Further Education College'),'further_education_college');
 assert.equal(educationDiscoveryClassification('Example Apprenticeship Training'),'apprenticeship_provider');
 assert.equal(educationDiscoveryClassification('Unclassified Business'),null);
 assert.equal(educationProspectSourceRole('Head of Employer Engagement'),true);
 assert.equal(educationProspectSourceRole('Junior Marketing Analyst'),false);
});
test('partnership messaging offers verifiable collaboration, not promised funding',()=>{
 assert.match(educationPartnershipHeadline('university'),/collaboration/);
 assert.match(educationPartnershipHeadline('skills_bootcamp'),/training/);
});
