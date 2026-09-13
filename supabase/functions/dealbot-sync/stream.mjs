// Source-neutral transport. No affiliate endpoints or credentials here.
// Persist the returned chunks/manifest in the collector before sending, so retries
// reuse identical boundaries and content. Bytes are bounded, including UTF-8.
export function chunkOffers(offers,{maxOffers=400,maxBytes=1800000}={}) {
 if(!Number.isInteger(maxOffers)||maxOffers<1||maxOffers>500||!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>1800000)throw Error('Invalid chunk limits');
 const chunks=[];let page=[],bytes=2;
 for(const offer of offers){
  const size=new TextEncoder().encode(JSON.stringify(offer)).length+1;
  if(size+2>maxBytes)throw Error('Single offer exceeds chunk capacity');
  if(page.length&&(page.length>=maxOffers||bytes+size>maxBytes)){chunks.push(page);page=[];bytes=2;}
  page.push(offer);bytes+=size;
 }
 if(page.length||!chunks.length)chunks.push(page);
 return chunks;
}
export async function uploadSnapshot(send,{source,key,revision},chunks){
 const count=chunks.reduce((n,c)=>n+c.length,0);
 const manifest=await send({op:'begin',source,key,revision,pages:chunks.length,offers:count});
 const digests=[];
 for(let page=0;page<chunks.length;page++){
  const receipt=await send({op:'chunk',id:manifest.id,page,offers:chunks[page]});
  digests.push(receipt.digest);
 }
 return send({op:'seal',id:manifest.id,digests});
}
