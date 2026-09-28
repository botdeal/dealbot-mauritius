const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const search=require('../search.js');const commerce=require('../commerce.js');
test('product query parses model, generation, capacity and colour without merging variants',()=>{
 const p=search.parse('Apple iPhone 15 128 Go Noir');assert.equal(p.capacity,'128gb');assert.equal(p.color,'black');assert.equal(p.model,'iphone 15');
 const offers=[{id:1,name:'Apple iPhone 15 128GB Black'},{id:2,name:'Apple iPhone 15 Pro 128GB Black'},{id:3,name:'Apple iPhone 15 256GB Black'}];
 assert.deepEqual(search.rank(offers,'iPhone 15 128 Go noir').map(x=>x.id),[1]);assert.equal(commerce.identity(offers[0]),null);
});
test('search accepts word reordering, accent folding, prefixes and explicit FR/EN synonyms',()=>{
 const offers=[{id:1,name:'LESOWN 1080p Portable Monitor HDMI USB'},{id:2,name:'Red lamp bedroom'}];
 assert.deepEqual(search.rank(offers,'écran portable').map(x=>x.id),[1]);assert.deepEqual(search.rank(offers,'HDMI LESO').map(x=>x.id),[1]);assert.deepEqual(search.rank(offers,'lampe rouge').map(x=>x.id),[2]);
});
test('known excluded markets do not appear; commercial commission does not affect ranking',()=>{
 const one={id:1,name:'Portable Monitor',affiliateUrl:null};const two={id:2,name:'Portable Monitor',affiliateUrl:'https://example.org'};
 assert.deepEqual(search.rank([two,one],'monitor').map(x=>x.id),[1,2]);assert.deepEqual(search.rank([{...one,commerce:{markets:['FR']}}],'monitor','MU'),[]);
});
test('demand sanitizer rejects personal/contact/credential-like queries',()=>{
 for(const q of ['a@b.com','https://example.org','phone 123456789','password apple secret','x'.repeat(121)])assert.equal(search.telemetryQuery(q),null);
 assert.equal(search.telemetryQuery('iPhone 15 128 Go'),'iphone 15 128gb');
});
async function database(){const {rebuild}=require('./helpers/database.cjs');const db=await rebuild();await db.exec(`create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);for(const f of ['20260919150425_admitad_official_collector.sql','20260927131742_commerce_metadata.sql','20260927202939_universal_search.sql','20260927204042_universal_search_variants.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));return db;}
test('search and demand migration: anonymous aggregation is private, bounded, deduplicated and source-scoped',async()=>{
 const db=await database();try{
 const token='00000000-0000-4000-8000-000000000001';
 await db.exec('set role anon');
 const query=()=>db.query('select public.record_search_demand($1,$2,$3) as r',['iphone 15 128gb','MU',token]);
 let r=(await query()).rows[0].r;assert.equal(r.recorded,true);assert.equal(r.coverage,0);const ticket=r.ticket;
 assert.equal((await query()).rows[0].r.recorded,false);
 await assert.rejects(db.query('select * from private.search_demand'),/permission denied/);
 await assert.rejects(db.query('select public.admin_search_demand()'),/permission denied|Admin required/);
 await assert.rejects(db.query(`select public.admitad_snapshot('{"op":"demand"}')`),/permission denied/);
 assert.equal((await db.query('select public.attribute_search_click($1,1) as r',[ticket])).rows[0].r,false);
 assert.equal((await db.query('select public.record_search_demand($1,$2,$3) as r',['name@example.com','MU',token])).rows[0].r.recorded,false);
 await db.exec('reset role');
 assert.equal((await db.query('select searches from private.search_demand')).rows[0].searches,1);
 await db.query('select public.record_search_demand($1,$2,$3)',['iphone 15 128gb','MU','00000000-0000-4000-8000-000000000002']);
 await db.query('select public.record_search_demand($1,$2,$3)',['iphone 15 128gb','MU','00000000-0000-4000-8000-000000000003']);
 await db.exec('set role service_role');const priorities=(await db.query(`select public.admitad_snapshot('{"op":"demand"}') as r`)).rows[0].r;assert.equal(priorities.demands.length,1);assert.equal(priorities.demands[0].query,'iphone 15 128gb');
 await db.exec('reset role');
 await db.exec("update private.search_demand set day=current_date-31; update private.search_receipts set created_at=now()-interval '2 days';select private.prune_search_demand();");assert.equal((await db.query('select count(*) from private.search_demand')).rows[0].count,0);
 }finally{await db.close();}
});
test('matching evidence is deterministic and total comparison never invents shipping or taxes',()=>{
 const item={id:1,price:100,currency:'USD',availability:'available',commerce:{verified:true,variant_complete:true,brand:'Maker',mpn:'M1',variant:{capacity:'128GB'},shipping:{MU:{amount:5,currency:'USD',tax_included:true}}}};
 const second={...item,id:2,price:90};const rates={date:new Date().toISOString(),rates:{USD:1,MUR:45}};
 assert.equal(commerce.matchEvidence(item,second).confidence,1);
 const compared=commerce.compare(item,[item,second],'MU','MUR',rates);assert.equal(compared.rows[0].total,4275);assert.equal(compared.bestTotalId,2);
 const unknown={...second,commerce:{...second.commerce,shipping:{}}};assert.equal(commerce.compare(item,[item,unknown],'MU','MUR',rates).bestTotalId,null);
 assert.equal(commerce.matchEvidence(item,{...second,commerce:{...second.commerce,variant:{capacity:'256GB'}}}).comparable,false);
});
test('real Postgres search excludes conflicting variants, unpublished and excluded markets',async()=>{
 const db=await database();try{
 await db.exec(`insert into public.deals(slug,name,price,currency,status,commerce) values
 ('qa-base','iPhone 15 128GB Black',100,'USD','active',null),
 ('qa-pro','iPhone 15 Pro 128GB Black',100,'USD','active',null),
 ('qa-large','iPhone 15 256GB Black',100,'USD','active',null),
 ('qa-private','iPhone 15 128GB Black',100,'USD','draft',null),
 ('qa-france','iPhone 15 128GB Black',100,'USD','active','{"markets":["FR"]}');`);
 await db.exec('set role anon');
 const r=(await db.query(`select public.search_dealbot('iphone 15 128 go noir','MU') as r`)).rows[0].r;
 assert.equal(r.count,1);assert.equal(r.offers[0].slug,'qa-base');
 }finally{await db.close();}
});
