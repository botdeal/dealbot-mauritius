(function(root){
'use strict';
const aliases={ecran:'monitor',ecrans:'monitor',ordinateur:'computer',ordinateurs:'computer',portable:'portable',lampe:'lamp',lampes:'lamp',luminaire:'light',luminaires:'light',perceuse:'drill',perceuses:'drill',noir:'black',noire:'black',blanc:'white',blanche:'white',rouge:'red',bleu:'blue',bleue:'blue',vert:'green',verte:'green',telephone:'phone',telephones:'phone',ecouteurs:'earbuds',casque:'headphones',souris:'mouse',clavier:'keyboard',sans:'wireless',fil:'',pour:'',avec:'',the:'',for:'',with:''};
const colors=['black','white','red','blue','green','pink','purple','silver','gold'];
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d+)\s*(gb|go)\b/g,'$1gb').replace(/(\d+)\s*(tb|to)\b/g,'$1tb').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(w=>aliases[w]??w).filter(Boolean).join(' ');}
function parse(value){
 const normalized=normalize(value).slice(0,120),tokens=[...new Set(normalized.split(' ').filter(Boolean))].slice(0,12);
 const capacity=tokens.find(t=>/^\d+(gb|tb)$/.test(t))||null;
 const family=normalized.match(/\b(iphone|ipad|galaxy|pixel|playstation|ps5|xbox)\b/)?.[0]||null;
 const model=normalized.match(/\b(iphone|ipad|galaxy|pixel)\s+([a-z]?\d+[a-z]?)(?:\s+(pro|max|plus|mini|ultra))?(?:\s+(max|plus))?\b/);
 return {normalized,tokens,capacity,color:tokens.find(t=>colors.includes(t))||null,family,model:model?model[0]:null,brand:tokens.find(t=>['apple','samsung','google','sony','microsoft','lenovo','xiaomi','lesown'].includes(t))||(['iphone','ipad'].includes(family)?'apple':null),identifier:tokens.find(t=>/^\d{8}$|^\d{12,14}$/.test(t))||null};
}
function relevance(offer,query){
 const p=typeof query==='string'?parse(query):query;if(!p.tokens.length)return 0;
 const name=normalize(offer.name),text=name+' '+normalize((offer.store||'')+' '+(offer.category||'')+' '+(offer.commerce?.gtin||'')+' '+(offer.commerce?.mpn||'')+' '+(offer.commerce?.brand||'')),product=parse(name);
 // Retrieval is NOT identity evidence. Explicit variant conflicts are never ranked.
 if(p.capacity&&product.capacity&&p.capacity!==product.capacity)return 0;
 if(p.color&&product.color&&p.color!==product.color)return 0;
 if(p.model&&product.model&&p.model!==product.model)return 0;
 const words=text.split(' ');let score=0;
 for(const token of p.tokens){
  if(words.includes(token)){score+=name.split(' ').includes(token)?4:1;continue;}
  if(token.length>=3&&words.some(w=>w.startsWith(token))){score+=1;continue;}
  return 0;
 }
 return score+(name.startsWith(p.normalized)?4:0);
}
function rank(offers,query,country){const parsed=parse(query);return offers.map(deal=>({deal,score:relevance(deal,parsed)})).filter(x=>x.score>0&&(!country||!Array.isArray(x.deal.commerce?.markets)||x.deal.commerce.markets.includes(country))).sort((a,b)=>b.score-a.score||Number(Array.isArray(b.deal.commerce?.markets))-Number(Array.isArray(a.deal.commerce?.markets))||a.deal.id-b.deal.id).map(x=>x.deal);}
function telemetryQuery(value){
 const raw=String(value||'');if(raw.length>120||/[@:/\\]|\b(password|token|email|adresse)\b/i.test(raw))return null;
 const p=parse(raw);if(p.normalized.length<3||p.normalized.length>80||p.tokens.length>10||!/[a-z]/.test(p.normalized)||/\d{7,}/.test(p.normalized))return null;
 return p.normalized;
}
const api={normalize,parse,relevance,rank,telemetryQuery};if(typeof module!=='undefined')module.exports=api;else root.DealBotSearch=api;
})(typeof window!=='undefined'?window:this);
