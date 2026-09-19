const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {rebuild}=require('./helpers/database.cjs');
test('collector RPC is private, source scoped, budget bounded and reconstructible',async()=>{
 const db=await rebuild();
 try {
  await db.exec(`create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;`);
  await db.exec(fs.readFileSync('supabase/migrations/20260919150425_admitad_official_collector.sql','utf8'));
  const q=await db.query(`select auto_publish,fixture from private.sync_sources where id='admitad-aliexpress-hot-usd'`);
  assert.deepEqual(q.rows[0],{auto_publish:false,fixture:false});
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query(`select public.admitad_snapshot('{}')`),/permission denied/);
   await db.exec('reset role');
  }
  await assert.rejects(db.query(`select public.admitad_snapshot($1)`,[JSON.stringify({op:'begin',source:'another-source',offers:3,pages:1})]),/scope exceeds/);
  await assert.rejects(db.query(`select public.admitad_snapshot($1)`,[JSON.stringify({op:'begin',source:'admitad-aliexpress-hot-usd',offers:1001,pages:10})]),/scope exceeds/);
  await assert.rejects(db.query(`select public.admitad_snapshot('{"op":"run_status","id":1}')`),/Unknown source run/);
  await db.exec('select private.admitad_withdraw_stale()');
 } finally {await db.close();}
});
