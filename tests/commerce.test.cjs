const {test}=require('node:test');const assert=require('node:assert/strict');const c=require('../commerce.js');
const offer={id:1,commerce:{verified:true,variant_complete:true,brand:'Acme',mpn:'P1',variant:{capacity:'128 GB',color:'black'}}};
test('exact source-backed identity matches across merchants, never across variants',()=>{
 const second={...offer,id:2,merchantId:2};assert.equal(c.equivalents(offer,[offer,second]).length,2);
 assert.equal(c.identity({...offer,commerce:{...offer.commerce,variant:{capacity:'256 GB',color:'black'}}})===c.identity(offer),false);
 for(const commerce of [null,{}, {...offer.commerce,verified:false},{...offer.commerce,variant_complete:false},{...offer.commerce,variant:{}},{...offer.commerce,variant:{color:{name:'black'}}}])assert.equal(c.identity({commerce}),null);
});
test('GTIN validates check digit and supported lengths',()=>{
 assert.ok(c.identity({commerce:{...offer.commerce,gtin:'4006381333931'}}));
 assert.equal(c.identity({commerce:{...offer.commerce,gtin:'4006381333932'}}),null);
});
test('known market exclusion is respected without inventing shipping coverage',()=>{
 assert.equal(c.available({commerce:{markets:['FR']}},'MU'),false);
 assert.equal(c.available({},'MU'),true);
 assert.equal(c.equivalents(offer,[{...offer,commerce:{...offer.commerce,markets:['FR']}}],'MU').length,0);
});
test('dated cross conversion fails closed for stale/invalid rates',()=>{
 const fx={date:new Date().toISOString(),rates:{USD:1,EUR:.9,MUR:45}};
 assert.equal(c.convert(10,'USD','MUR',fx),450);assert.equal(c.convert(9,'EUR','USD',fx),10);
 for(const bad of [null,{...fx,date:'2000-01-01'},{...fx,rates:{USD:1,MUR:-1}},{...fx,rates:{USD:1,MUR:Infinity}}])assert.equal(c.convert(10,'USD','MUR',bad),null);
});
test('market endpoint is read only and does not forward IP or request headers',async()=>{
 const handler=require('../api/market');const original=global.fetch;const calls=[];
 global.fetch=async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>({result:'success',base_code:'USD',time_last_update_unix:Math.floor(Date.now()/1000),rates:{USD:1,MUR:45,EUR:.9,GBP:.8,CAD:1.4}})}};
 const response=()=>({statusCode:0,setHeader(){},status(n){this.statusCode=n;return this},json(data){this.data=data},end(){}});
 try {const res=response();await handler({method:'GET',headers:{'x-vercel-ip-country':'MU','x-forwarded-for':'private'}},res);assert.equal(res.data.country,'MU');assert.equal(res.data.rates.MUR,45);assert.equal(calls.length,1);assert.equal(calls[0].opts.headers,undefined);
 const rejected=response();await handler({method:'POST',headers:{}},rejected);assert.equal(rejected.statusCode,405);
 }finally{global.fetch=original;}
});
test('commerce migration preserves existing records and rejects opaque/secret metadata',async()=>{
 const {PGlite}=require('@electric-sql/pglite');const fs=require('node:fs');const db=new PGlite();
 try{await db.exec("create table public.deals(id bigint primary key);insert into deals values(1);");await db.exec(fs.readFileSync('supabase/migrations/20260927131742_commerce_metadata.sql','utf8'));
 assert.equal((await db.query('select commerce from deals')).rows[0].commerce,null);
 await db.query('update deals set commerce=$1',[JSON.stringify(offer.commerce)]);
 await assert.rejects(db.query('update deals set commerce=$1',[JSON.stringify({token:'secret'})]),/check constraint/);
 }finally{await db.close();}
});
