const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePromise=import('../supabase/functions/dealbot-sync/github-auth.mjs');
const base={iss:'https://token.actions.githubusercontent.com',aud:'dealbot-admitad-collector',
 sub:'repo:botdeal@325603375/dealbot-mauritius@1359049058:ref:refs/heads/main',
 repository:'botdeal/dealbot-mauritius',repository_id:'1359049058',repository_owner_id:'325603375',
 ref:'refs/heads/main',workflow_ref:'botdeal/dealbot-mauritius/.github/workflows/admitad-sync.yml@refs/heads/main',
 event_name:'schedule',runner_environment:'github-hosted',repository_visibility:'public',
 iat:1000,nbf:1000,exp:1300,run_id:'123',run_attempt:'1'};
test('exact production workflow and immutable repository identity accepted',async()=>{
 const {validateClaims}=await modulePromise;assert.equal(validateClaims(base,1100),base);
});
for(const [field,value] of Object.entries({repository_id:'2',repository_owner_id:'2',ref:'refs/heads/test',
 workflow_ref:'botdeal/dealbot-mauritius/.github/workflows/other.yml@refs/heads/main',
 aud:'other',iss:'https://evil.invalid',sub:'repo:other/repo:ref:refs/heads/main',
 event_name:'pull_request',repository_visibility:'private',runner_environment:'self-hosted',exp:1050,nbf:1500,iat:1500})) {
 test(`OIDC rejects invalid ${field}`,async()=>{const {validateClaims}=await modulePromise;assert.throws(()=>validateClaims({...base,[field]:value},1100));});
}
test('unsigned JWT is rejected before any database access',async()=>{
 const {githubBridge}=await modulePromise;let called=false;
 const token=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(base)).toString('base64url')+'.x';
 const r=await githubBridge(new Request('https://dealbot.test',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'}),()=>{called=true;});
 assert.equal(r.status,401);assert.equal(called,false);
});
