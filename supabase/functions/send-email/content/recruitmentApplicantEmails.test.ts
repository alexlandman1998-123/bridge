import { buildRecruitmentApplicantEmail } from './recruitmentApplicantEmails.ts';
function assert(value: unknown, message='Assertion failed'): asserts value { if(!value) throw new Error(message); }
const lead={name:'Sam Recruit',documents_json:[],document_waivers_json:{}};
const build=(kind:string,patch:any={})=>buildRecruitmentApplicantEmail(kind,{...lead,...patch},'https://app.arch9.co.za',{organisationName:'Home Seekers'});
Deno.test('applicant thank-you acknowledges the completed application and explains the second email without an activation or access button',()=>{
  const email=build('application_thanks');
  assert(email.subject==='Home Seekers: Thank you for your application');
  assert(email.text.includes('received your completed application')&&email.text.includes('second email'));
  assert(!email.html.includes('/invite/')&&!email.html.includes('/applicant/my-profile'));
  assert(!email.html.includes('Activate account'));
});
Deno.test('document instructions name every requested file, explain why, and point only to the restricted My Profile login',()=>{
  const email=build('documents_reminder');
  for(const phrase of ['CV —','ID or passport —','Qualifications —','FFC certificate —','proof of address —','work experience','verify your identity','training','practitioner registration','residential address','10 MB','Use an email code instead']) assert(email.text.includes(phrase),phrase);
  assert(email.text.includes('https://app.arch9.co.za/applicant/my-profile'));
  assert(!email.html.includes('/invite/')&&!email.html.includes('Powered by Arch9'));
});
Deno.test('the follow-up lists only missing requested documents, including proof of address, and respects recorded exceptions',()=>{
  const email=build('documents_followup',{documents_json:[{type:'CV',path:'own/cv'},{type:'Identity document',path:'own/id'},{type:'Registration evidence',path:'own/ffc'}],document_waivers_json:{Qualifications:'Staff reviewed exemption'}});
  assert(email.text.includes('proof of address —')&&!email.text.includes('CV —')&&!email.text.includes('ID or passport —')&&!email.text.includes('Qualifications —')&&!email.text.includes('FFC certificate —'));
  assert(email.subject.includes('Reminder:'));
});
Deno.test('applicant names are escaped in HTML and never determine the action URL or recipient',()=>{
  const email=build('documents_reminder',{name:'<script>bad</script>',to:'attacker@test',url:'https://evil.test'});
  assert(email.html.includes('&lt;script&gt;')&&!email.html.includes('<script>'));
  assert(!email.text.includes('evil.test')&&!('to' in email));
});
