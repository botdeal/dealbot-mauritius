// Temporary fixture-only runner. Caller authorization is installed separately as
// a short-lived SHA-256 capability hash; no platform secret is exported/logged.
import {chunkOffers} from '../../supabase/functions/dealbot-sync/stream.mjs';
export async function runFixture(phase,source){
 const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
 if(!secret)throw Error('Server credential unavailable');
 const endpoint=Deno.env.get('SUPABASE_URL')+'/functions/v1/dealbot-sync';
 const timings=[];
 async function call(body){
  const start=Date.now();const r=await fetch(endpoint,{method:'POST',headers:{apikey:secret,'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();timings.push({status:r.status,ms:Date.now()-start});
  if(!r.ok)throw Error('Edge request failed: '+r.status);
  return data;
 }
 if(phase===0){
  const result=await call({action:'health'});return {ok:result.ok,timings};
 }
 const offers=Array.from({length:phase===3?1400:1500},(_,i)=>({external_id:'http-'+i,name:'HTTP fixture '+i,
  description:'Controlled fixture text. '.repeat(100),price:phase>=2&&i<100?80:100,old_price:200,currency:'MUR',availability:'in_stock',
  original_url:'https://example.com/'+i,merchant:{external_id:'m',name:'HTTP test merchant',website_url:'https://example.com'},category:{external_id:'c',name_fr:'HTTP test',name_en:'HTTP test'}}));
 const chunks=chunkOffers(offers);
 const manifest=await call({action:'snapshot',request:{op:'begin',source,key:'http-'+phase,revision:phase,pages:chunks.length,offers:offers.length}});
 const digests=[];
 for(let page=0;page<chunks.length;page++){
  const receipt=await call({action:'snapshot',request:{op:'chunk',id:manifest.id,page,offers:chunks[page]}});digests.push(receipt.digest);
 }
 const sealed=await call({action:'snapshot',request:{op:'seal',id:manifest.id,digests}});
 return {ok:true,phase,source,run_id:sealed.run_id,offers:offers.length,bytes:new TextEncoder().encode(JSON.stringify(offers)).length,pages:chunks.length,timings};
}
