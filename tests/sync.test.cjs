// Test the retrieved v3 handler only. The external authentication middleware is
// mocked; these tests do not prove live authentication or a working importer.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {stripTypeScriptTypes} = require('node:module');
const vm = require('node:vm');
const source = stripTypeScriptTypes(readFileSync('supabase/functions/dealbot-sync/index.ts','utf8'))
  .replace('import { withSupabase } from "npm:@supabase/server";', '')
  .replace('export default', 'handler =');
function setup(mode) {
  const calls=[]; let auth;
  const context = {supabaseAdmin:{from(table) {calls.push(table);return {select:async()=>{
    if(mode==='throw') throw Error('simulated transport failure');
    return {count:table==='categories'?9:0,error:mode==='database_error'?{message:'simulated database error'}:null};
  }};}}};
  const sandbox={Response,Date,Error,console:{info(){},error(){}},handler:null,
    withSupabase(options,fn){auth=options;return req=>fn(req,context);}};
  vm.runInNewContext(source,sandbox);
  return {handler:sandbox.handler, calls, auth};
}
test('sync v3 is a secret-configured database check, not ingestion',async()=>{
  const {handler,calls,auth}=setup();
  assert.equal(auth.auth,'secret');
  const response=await handler.fetch(new Request('https://test.invalid',{method:'POST',body:JSON.stringify({offers:[{id:'offer-1',price:10}]})}));
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.ok,true);
  assert.deepEqual(calls,['deals','merchants','categories']);
  assert.equal(data.sync.received,0);assert.equal(data.sync.created,0);
  assert.equal(data.status,'ready'); // Misleading live label documented in the audit.
});
test('sync rejects GET without querying tables',async()=>{
  const {handler,calls}=setup();
  assert.equal((await handler.fetch(new Request('https://test.invalid'))).status,405);
  assert.equal(calls.length,0);
});
for(const mode of ['database_error','throw']) test('sync reports '+mode,async()=>{
  const {handler}=setup(mode);
  const response=await handler.fetch(new Request('https://test.invalid',{method:'POST'}));
  assert.equal(response.status,500);assert.equal((await response.json()).ok,false);
});
