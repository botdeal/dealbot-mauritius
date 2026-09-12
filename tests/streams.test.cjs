const {test}=require('node:test');const assert=require('node:assert/strict');const {rebuild}=require('./helpers/database.cjs');
const offer=i=>({external_id:'item-'+i,name:'Fixture '+i,description:'x'.repeat(2200),price:100,old_price:200,currency:'MUR',availability:'in_stock',original_url:'https://example.com/'+i,merchant:{external_id:'m',name:'Test merchant',website_url:'https://example.com'},category:{external_id:'c',name_fr:'Test',name_en:'Test'}});
test('1500 offers >2MiB: immutable pages, seal, import, replay, history and reconciliation',async()=>{
 const db=await rebuild();try{
  await db.exec("insert into private.sync_sources(id) values('fixture-stream')");
  const {chunkOffers,uploadSnapshot}=await import('../supabase/functions/dealbot-sync/stream.mjs');
  const send=async r=>(await db.query('select public.sync_snapshot($1::jsonb) x',[JSON.stringify(r)])).rows[0].x;
  const offers=Array.from({length:1500},(_,i)=>offer(i));assert.ok(Buffer.byteLength(JSON.stringify(offers))>2097152);
  const chunks=chunkOffers(offers);assert.ok(chunks.length>1);
  const m=await send({op:'begin',source:'fixture-stream',key:'v1',revision:1,pages:chunks.length,offers:offers.length});
  await send({op:'chunk',id:m.id,page:0,offers:chunks[0]});
  await assert.rejects(send({op:'seal',id:m.id,digests:[]}));
  await assert.rejects(send({op:'chunk',id:m.id,page:0,offers:[offer(9999)]}));
  const sealed=await uploadSnapshot(send,{source:'fixture-stream',key:'v1',revision:1},chunks);
  assert.equal((await db.query('select public.sync_process($1) x',[sealed.run_id])).rows[0].x.state,'succeeded');
  await uploadSnapshot(send,{source:'fixture-stream',key:'v1',revision:1},chunks);
  assert.equal((await db.query('select count(*)::int n from public.deals')).rows[0].n,1500);
  const next=offers.slice(0,1400).map((x,i)=>({...x,price:i<100?80:100}));
  const r2=await uploadSnapshot(send,{source:'fixture-stream',key:'v2',revision:2},chunkOffers(next));
  const result=(await db.query('select public.sync_process($1) x',[r2.run_id])).rows[0].x;
  assert.equal(result.result.updated,100);assert.equal(result.result.expired,100);
  assert.equal((await db.query('select count(*)::int n from public.price_history')).rows[0].n,1600);
  const dup=await uploadSnapshot(send,{source:'fixture-stream',key:'dup',revision:3},[[offer(0)],[offer(0)]]);
  assert.equal((await db.query('select public.sync_process($1) x',[dup.run_id])).rows[0].x.state,'failed');
  await db.exec("update private.sync_runs set finished_at=now()-interval '100 days' where state in ('succeeded','failed'); update private.sync_snapshots set created_at=now()-interval '100 days'; select private.sync_cleanup()");
  assert.equal((await db.query('select count(*)::int n from private.sync_runs')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.deals')).rows[0].n,1500);
  await assert.rejects(send({op:'begin',source:'fixture-stream',key:'stale',revision:1,pages:1,offers:0}));
 }finally{await db.close();}
});
test('UTF8 chunk bounds and generic adapter connection remains explicit',async()=>{
 const {chunkOffers}=await import('../supabase/functions/dealbot-sync/stream.mjs');
 const chunks=chunkOffers(Array.from({length:600},(_,i)=>({...offer(i),description:'é'.repeat(2000)})));
 assert.ok(chunks.every(c=>c.length<=500&&Buffer.byteLength(JSON.stringify(c))<=1800000));
 const {createAdmitadSource}=await import('../supabase/functions/dealbot-sync/sources/admitad.mjs');
 assert.throws(()=>createAdmitadSource(),{code:'ADMITAD_CONNECTION_REQUIRED'});
 const source=createAdmitadSource({authorized:true,async *pages(){yield [1,2];},normalize:i=>offer(i)});
 const result=[];for await(const row of source.offers())result.push(row);assert.equal(result.length,2);
});
test('snapshot endpoint uses the private RPC and rejects client access',async()=>{
 const db=await rebuild();try{
  const {handle}=await import('../supabase/functions/dealbot-sync/handler.mjs');
  await db.exec("insert into private.sync_sources(id) values('fixture-endpoint')");
  const client={rpc:async(name,args)=>({data:(await db.query('select public.sync_snapshot($1::jsonb) x',[JSON.stringify(args.request)])).rows[0].x})};
  const response=await handle(new Request('https://example.com',{method:'POST',body:JSON.stringify({action:'snapshot',request:{op:'begin',source:'fixture-endpoint',key:'a',revision:1,pages:1,offers:1}})}),client);
  assert.equal(response.status,200);assert.equal((await response.json()).received_pages,0);
  await db.exec('set role authenticated');await assert.rejects(db.query("select public.sync_snapshot('{}')"),/permission denied/);
  await assert.rejects(db.query('select * from private.sync_chunks'),/permission denied/);
 }finally{await db.close();}
});
test('retention closes abandoned uploads and preserves catalog and revision barriers',async()=>{
 const db=await rebuild();try{
  await db.exec("insert into private.sync_sources(id) values('fixture-retention'); select public.sync_snapshot('{\"op\":\"begin\",\"source\":\"fixture-retention\",\"key\":\"a\",\"revision\":1,\"pages\":1,\"offers\":1}'); update private.sync_snapshots set created_at=now()-interval '2 days'; select private.sync_cleanup()");
  assert.equal((await db.query('select state from private.sync_snapshots')).rows[0].state,'abandoned');
  await db.exec("update private.sync_snapshots set created_at=now()-interval '8 days'; select private.sync_cleanup()");
  assert.equal((await db.query('select count(*)::int n from private.sync_snapshots')).rows[0].n,0);
 }finally{await db.close();}
});
test('failed payload survives cleanup and can actually resume after eight days',async()=>{
 const db=await rebuild();try{
  await db.exec("insert into private.sync_sources(id) values('fixture-retry-retention')");
  const batch={source:'fixture-retry-retention',key:'retry',revision:1,complete:true,offers:[offer(1)]};
  const id=(await db.query('select public.sync_enqueue($1::jsonb) x',[JSON.stringify(batch)])).rows[0].x.id;
  await db.query("update private.sync_runs set state='failed',error_code='40001',finished_at=now()-interval '8 days' where id=$1",[id]);
  await db.exec('select private.sync_cleanup()');
  await db.query('select public.sync_retry($1)',[id]);
  const result=(await db.query('select public.sync_process($1) x',[id])).rows[0].x;
  assert.equal(result.state,'succeeded');assert.equal(result.result.created,1);
 }finally{await db.close();}
});
