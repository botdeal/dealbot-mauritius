(function(root){
'use strict';
const currencies={MU:'MUR',FR:'EUR',US:'USD',GB:'GBP',CA:'CAD'};
function identity(offer){
 const c=offer.commerce;
 if(!c||c.verified!==true||c.variant_complete!==true||!c.variant||typeof c.variant!=='object'||Array.isArray(c.variant))return null;
 if(Object.values(c.variant).some(v=>v===null||!['string','number','boolean'].includes(typeof v)||(typeof v==='number'&&!Number.isFinite(v))))return null;
 const variant=Object.keys(c.variant).sort().map(k=>[k,String(c.variant[k]).trim().toLowerCase()]);
 if(!variant.length||variant.some(([k,v])=>!v))return null;
 const gtin=String(c.gtin||'');
 let ref;
 if(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin)){
  let sum=0;for(let i=gtin.length-2,weight=3;i>=0;i--,weight=4-weight)sum+=Number(gtin[i])*weight;
  if((10-sum%10)%10!==Number(gtin.at(-1)))return null;
  ref='gtin:'+gtin.padStart(14,'0');
 }else if(gtin){return null;}else if(String(c.brand||'').trim()&&String(c.mpn||'').trim()){ref='mpn:'+String(c.brand).trim().toLowerCase()+':'+String(c.mpn).trim().toLowerCase();}
 else return null;
 return JSON.stringify([ref,variant]);
}
function available(offer,country){return !country||!Array.isArray(offer.commerce?.markets)||offer.commerce.markets.includes(country);}
function equivalents(offer,offers,country){const key=identity(offer);return key?offers.filter(o=>identity(o)===key&&available(o,country)):[];}
function convert(value,from,to,fx){
 if(!Number.isFinite(Number(value)))return null;
 if(from===to)return Number(value);
 const age=Date.now()-Date.parse(fx?.date);
 if(!Number.isFinite(age)||age< -3600000||age>3*86400000||![fx?.rates?.[from],fx?.rates?.[to]].every(n=>Number.isFinite(n)&&n>0))return null;
 return Number(value)*fx.rates[to]/fx.rates[from];
}
const api={currencies,identity,available,equivalents,convert};
if(typeof module!=='undefined')module.exports=api;else root.DealBotCommerce=api;
})(typeof window!=='undefined'?window:this);
