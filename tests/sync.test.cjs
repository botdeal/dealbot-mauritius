const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {rebuild}=require('./helpers/database.cjs');
const handler=()=>import('../supabase/functions/dealbot-sync/handler.mjs');
const fixture={external_id:'x',name:'Fixture',price:10,old_price:20,currency:'MUR',availability:'in_stock',original_url:'https://example.com/x',merchant:{external_id:'m',name:'Shop',website_url:'https://example.com'},category:{external_id:'c',name_fr:'Test',name_en:'Test'}};
const request=body=>new Request('https://test.invalid',{method:'POST',body:JSON.stringify(body)});
test('rebuild from empty database and full Autopilot SQL scenario',async()=>{
 const db=await rebuild();try {
  const output=await db.exec(fs.readFileSync('tests/autopilot.sql','utf8'));
  assert.ok(output.some(x=>x.rows?.some(r=>r.autopilot_result?.startsWith('PASS:'))));
  assert.equal((await db.query('select count(*)::int n from private.sync_sources')).rows[0].n,0);
  const legacy=await db.exec(fs.readFileSync('tests/database.sql','utf8'));
  assert.ok(legacy.some(x=>x.rows?.some(r=>r.result?.startsWith('PASS:'))));
 }finally{await db.close();}
});
test('Edge handler to rebuilt Postgres: import, replay, durable enqueue after transport error',async()=>{
 const {handle}=await handler();const db=await rebuild();
 try {
  await db.exec("insert into private.sync_sources(id) values('fixture-handler')");
  let failAfterEnqueue=true;
  const client={rpc:async(name,args)=>{
   if(name==='sync_process'&&failAfterEnqueue){failAfterEnqueue=false;throw Error('transient network failure');}
   const input=name==='sync_enqueue'?JSON.stringify(args.batch):args.run_id;
   const result=await db.query(`select public.${name}($1) data`,[input]);return {data:result.rows[0].data};
  }};
  const body={action:'submit',batch:{source:'fixture-handler',key:'one',revision:1,complete:true,offers:[fixture]}};
  assert.equal((await handle(request(body),client)).status,202);
  await db.exec('select private.sync_tick()');
  const replay=await handle(request(body),client);assert.equal(replay.status,200);
  assert.equal((await db.query('select count(*)::int n from public.deals')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from public.price_history')).rows[0].n,1);
  await db.exec("set role authenticated");
  await assert.rejects(db.query('select public.sync_process(1)'),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});
test('Edge rejects invalid method, JSON, adapter and oversized payload',async()=>{
 const {handle}=await handler();const db={rpc(){throw Error('must not call database');}};
 assert.equal((await handle(new Request('https://test.invalid'),db)).status,405);
 assert.equal((await handle(new Request('https://test.invalid',{method:'POST',body:'{bad'}),db)).status,400);
 assert.equal((await handle(request({action:'submit',adapter:'admitad',batch:{offers:[]}}),db)).status,400);
 assert.equal((await handle(request({offers:[fixture]}),db)).status,400);
 assert.equal((await handle(request({oversized:'x'.repeat(2097153)}),db)).status,400);
});
test('strict validation, scores, rejected snapshots and superseded revisions',async()=>{
 const db=await rebuild();try {
  for(const bad of [{price:-1},{price:1.001},{price:'10'},{currency:'BTC'},{original_url:'https://user:pass@example.com'},{original_url:'javascript:alert(1)'},{expires_at:'not-a-date'},{unexpected:true}]){
   await assert.rejects(db.query('select private.sync_normalize($1::jsonb)',[JSON.stringify({...fixture,...bad})]));
  }
  const score=(await db.query('select private.sync_score(private.sync_normalize($1::jsonb),true) s',[JSON.stringify(fixture)])).rows[0].s;
  assert.equal(score.total,90);assert.equal(score.discount,50);assert.equal(score.trust,20);
  await db.exec("insert into private.sync_sources(id) values('fixture-revision')");
  const enqueue=async(revision,offers)=> (await db.query('select public.sync_enqueue($1::jsonb) r',[JSON.stringify({source:'fixture-revision',key:'key-'+revision,revision,complete:true,offers})])).rows[0].r.id;
  const old=await enqueue(1,[fixture]);const latest=await enqueue(2,[fixture]);
  await db.query('select public.sync_process($1)',[latest]);
  assert.equal((await db.query('select public.sync_process($1) r',[old])).rows[0].r.state,'superseded');
  const duplicate=await enqueue(3,[fixture,fixture]);
  assert.equal((await db.query('select public.sync_process($1) r',[duplicate])).rows[0].r.state,'failed');
 }finally{await db.close();}
});
test('deployed entrypoint retains secret authentication and pinned server dependency',()=>{
 const entry=fs.readFileSync('supabase/functions/dealbot-sync/index.ts','utf8');
 assert.match(entry,/@supabase\/server@1\.6\.0/);assert.match(entry,/auth:'secret'/);
});
