const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM,VirtualConsole} = require('jsdom');
const backend = require('../backend.js');
const html = fs.readFileSync('index.html','utf8');
const script = fs.readFileSync('app.js','utf8');
const delay = () => new Promise(r=>setTimeout(r,25));
const raw = {id:11,name:'Phone <script>bad()</script>',price:12000,old_price:15000,currency:'MUR',merchant_id:1,category_id:1,status:'active',availability:'in_stock',original_url:'https://example.com/product',dealbot_score:75};
const categories = [{id:1,slug:'technology',name_fr:'Technologie',name_en:'Technology',is_active:true,sort_order:0}];
const deal = backend.normalizeDeal(raw,[{id:1,name:'Shop'}],categories);
async function setup({catalogDeals=null,storedLang=null,user=null,role='user',empty=false,fail=false,hash='',saveFail=false,loginError=false,personalFail=false,personal={favorites:[],compare:[],alerts:[]}}={}) {
  const errors=[]; const vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://test.example/'+hash,runScripts:'outside-only',virtualConsole:vc});
  const w=dom.window; w.scrollTo=()=>{}; w.confirm=()=>true;
  let authListener, client; const calls=[];
  const session=user ? {user:{id:user,email:'test@example.com'}} : null;
  const api={catalog:async()=>{if(fail) throw Error('offline'); return {deals:catalogDeals || (empty?[]:[deal,{...deal,id:12,name:'Other phone'}]),categories,merchants:[]};},
    personal:async()=>{if(personalFail) throw Error('offline');return structuredClone(personal);},savePersonal:async data=>{calls.push(['save',data]); if(saveFail) throw Error('offline');},
    history:async()=>[{price:12000,currency:'MUR',recorded_at:'2026-09-08'}],saveDeal:async data=>{calls.push(['admin',data]); return 11;},
    archiveDeal:async id=>calls.push(['archive',id]),track:async()=> 'https://example.com/product'};
  const query={select(){return this},eq(){return this},single(){return this},then(resolve){return Promise.resolve({data:{role,full_name:'Test'},error:null}).then(resolve)}};
  w.supabase={createClient:()=>(client={from:()=>query,auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),
    signInWithPassword:async()=>{if(loginError) throw Error('network failure');return {data:{session:{user:{id:'signed-in',email:'test@example.com'}}}};},
    signUp:async()=>({data:{session:null}}),resetPasswordForEmail:async()=>{calls.push(['recovery']);return {};},updateUser:async()=>({}),
    onAuthStateChange:fn=>{authListener=fn},signOut:async()=>{authListener('SIGNED_OUT',null);return{};}}})};
  w.DealBotBackend={...backend,create:()=>api};
  if(storedLang)w.localStorage.setItem('dealbot_language_v2',storedLang);
  w.eval(fs.readFileSync('i18n.js','utf8'));
  w.eval(script); await delay();
  return {dom,w,calls,errors,authListener,api,client};
}
test('safe URLs, expiry, currency and stock normalization',()=>{
  for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','data:text/html,x','']) assert.equal(backend.safeUrl(url),'');
  assert.equal(deal.currency,'MUR');assert.equal(deal.availability,'available');
  assert.equal(backend.isPublished({...raw,expires_at:'2000-01-01'}),false);
  assert.equal(backend.isPublished({...raw,status:'draft'}),false);
  assert.equal(backend.isPublished({...raw,starts_at:'2100-01-01'}),false);
});
test('existing home renders real catalog with escaped names and MUR',async()=>{
  const {dom,w,errors}=await setup();
  assert.equal(w.document.querySelectorAll('#featuredDeals .product-card').length,2);
  assert.match(w.document.getElementById('featuredDeals').textContent,/12.*000/);
  assert.equal(w.document.querySelector('#featuredDeals script'),null);
  assert.equal(errors.length,0);dom.window.close();
});
test('empty and failed catalog do not display demo offers',async()=>{
  for(const options of [{empty:true},{fail:true}]) {
    const {dom,w}=await setup(options);
    assert.equal(w.document.querySelectorAll('#featuredDeals .product-card').length,0);
    assert.equal(w.document.getElementById('catalogStatus').hidden,false);
    assert.equal(w.document.querySelector('#catalogStatus button').hidden,!options.fail);dom.window.close();
  }
});
test('direct deal link waits for catalog then renders history',async()=>{
  const {dom,w,errors}=await setup({hash:'#deal-11'});
  assert.match(w.document.getElementById('dealDetail').textContent,/Phone/);
  assert.match(w.document.getElementById('dealDetail').textContent,/Historique/);
  assert.equal(errors.length,0);dom.window.close();
});
test('guest cannot silently save a favorite',async()=>{
  const {dom,w,calls}=await setup();w.document.querySelector('[data-save]').click();await delay();
  assert.equal(calls.length,0);assert.equal(w.document.getElementById('loginModal').classList.contains('open'),true);dom.window.close();
});
test('account favorites persist and logout clears personal UI',async()=>{
  const {dom,w,calls}=await setup({user:'user-one'});w.document.querySelector('[data-save]').click();await delay();
  assert.equal(JSON.stringify(calls[0][1].favorites),"[11]");
  w.location.hash='#favorites';await delay();assert.equal(w.document.querySelectorAll('#favoriteDeals .product-card').length,1);
  w.document.getElementById('logoutButton').click();await delay();
  assert.equal(w.document.getElementById('accountBox').hidden,true);
  assert.equal(w.document.querySelectorAll('#favoriteDeals .product-card').length,0);dom.window.close();
});
test('failed persistence restores server state and reports failure',async()=>{
  const {dom,w}=await setup({user:'user-one',saveFail:true});w.document.querySelector('[data-save]').click();await delay();
  assert.match(w.document.getElementById('toast').textContent,/pas été enregistrée/);
  assert.equal(w.document.querySelector('[data-save]').classList.contains('saved'),false);dom.window.close();
});
test('search filters real catalog',async()=>{
  const {dom,w}=await setup(); w.location.hash='#explore';await delay();
  const search=w.document.getElementById('exploreSearch');
  assert.ok(search); search.value='no matching offer';search.dispatchEvent(new w.Event('input',{bubbles:true}));await delay();
  assert.equal(w.document.querySelectorAll('#exploreDeals .product-card').length,0);
  search.value='Other phone';search.dispatchEvent(new w.Event('input',{bubbles:true}));await delay();
  assert.equal(w.document.querySelectorAll('#exploreDeals .product-card').length,1);dom.window.close();
});
test('admin form uses database save and offers archival',async()=>{
  const {dom,w,calls,errors}=await setup({user:'admin-one',role:'admin',hash:'#admin'});
  assert.equal(w.document.getElementById('adminAccountLink').hidden,false);
  w.document.querySelector('[data-admin-edit]').click();
  w.document.getElementById('adminDealForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
  assert.equal(calls[0][0],'admin'); assert.equal(calls[0][1].currency,'MUR');
  w.document.querySelector('[data-admin-delete]').click();await delay();assert.equal(calls[1][0],'archive');
  assert.equal(errors.length,0);dom.window.close();
});
test('price alerts save deal and threshold to the backend',async()=>{
  const {dom,w,calls}=await setup({user:'user-one',hash:'#alerts'});
  w.document.getElementById('alertProduct').value='11';w.document.getElementById('alertPrice').value='10000';
  w.document.getElementById('alertForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await delay();
  assert.equal(calls[0][1].alerts[0].productId,11);assert.equal(calls[0][1].alerts[0].targetPrice,10000);dom.window.close();
});
test('comparison persists and renders two selected offers',async()=>{
  const {dom,w,calls}=await setup({user:'user-one',hash:'#compare'});
  const boxes=w.document.querySelectorAll('#comparePicker input');
  assert.equal(boxes.length,2);
  boxes[0].dispatchEvent(new w.Event('change',{bubbles:true}));await delay();
  w.document.querySelectorAll('#comparePicker input')[1].dispatchEvent(new w.Event('change',{bubbles:true}));await delay();
  w.document.getElementById('runCompare').click();
  assert.equal(w.document.getElementById('compareResults').hidden,false);
  assert.equal(calls.at(-1)[1].compare.length,2);dom.window.close();
});
test('successful login restores account and failed login releases button',async()=>{
  for(const loginError of [false,true]) {
    const {dom,w}=await setup({loginError});
    w.document.getElementById('loginEmail').value='test@example.com';w.document.getElementById('loginPassword').value='test-password';
    w.document.getElementById('loginForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await delay();
    assert.equal(w.document.getElementById('accountBox').hidden,loginError);
    assert.equal(w.document.querySelector('#loginForm [type=submit]').disabled,false);dom.window.close();
  }
});
test('signup without session does not claim account is connected',async()=>{
  const {dom,w}=await setup();w.document.getElementById('signupEmail').value='test@example.com';
  w.document.getElementById('signupPassword').value='long-test-password';w.document.getElementById('signupName').value='Test';
  w.document.getElementById('signupForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await delay();
  assert.equal(w.document.getElementById('accountBox').hidden,true);assert.match(w.document.getElementById('toast').textContent,/messagerie/);dom.window.close();
});
test('missing offer renders a useful error',async()=>{
  const {dom,w}=await setup({hash:'#deal-999'});assert.match(w.document.getElementById('dealDetail').textContent,/introuvable/);dom.window.close();
});

test('same-account SIGNED_IN preserves edits queued behind a slow save',async()=>{
  const {dom,w,api,authListener}=await setup({user:'user-one'});
  let release; const saved=[];
  api.savePersonal=async data=>{saved.push(data);if(saved.length===1) await new Promise(r=>{release=r});};
  w.document.querySelector('[data-save="11"]').click();await delay();
  w.document.querySelector('[data-save="12"]').click();
  authListener('SIGNED_IN',{user:{id:'user-one',email:'test@example.com'}});await delay();
  release();await delay();
  assert.equal(saved.length,2);
  assert.deepEqual(Array.from(saved[1].favorites),[11,12]);
  assert.equal(w.document.querySelectorAll('#featuredDeals [data-save].saved').length,2);
  dom.window.close();
});

test('late account refresh cannot erase a newer favorite',async()=>{
  const {dom,w,api}=await setup({user:'user-one'});
  let release;
  api.personal=()=>new Promise(r=>{release=r});
  Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
  w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();
  w.document.querySelector('[data-save="11"]').click();await delay();
  release({favorites:[],compare:[],alerts:[]});await delay();
  assert.equal(w.document.querySelector('[data-save="11"]').classList.contains('saved'),true);
  dom.window.close();
});

test('signout clears favorites while catalog is still loading',async()=>{
  const {dom,w,api,authListener}=await setup({user:'user-one',hash:'#favorites'});
  w.location.hash='#home';await delay();
  w.document.querySelector('[data-save="11"]').click();await delay();
  w.location.hash='#favorites';await delay();
  assert.equal(w.document.querySelectorAll('#favoriteDeals .product-card').length,1);
  api.catalog=()=>new Promise(()=>{});
  authListener('SIGNED_OUT',null);await delay();
  assert.equal(w.document.querySelectorAll('#favoriteDeals .product-card').length,0);
  assert.equal(w.document.getElementById('accountBox').hidden,true);
  dom.window.close();
});

test('an unavailable offer still lets its owner remove the price alert',async()=>{
  const {dom,w,calls}=await setup({user:'user-one',hash:'#alerts',personal:{favorites:[],compare:[],alerts:[{id:8,productId:999,targetPrice:100,status:'active',currency:'MUR'}]}});
  assert.match(w.document.getElementById('alertList').textContent,/plus disponible/);
  w.document.querySelector('[data-remove-alert="8"]').click();await delay();
  assert.equal(calls[0][1].alerts.length,0);
  assert.equal(w.document.getElementById('alertsEmpty').hidden,false);
  dom.window.close();
});

test('an alert never compares its threshold against a different currency',async()=>{
  const {dom,w}=await setup({user:'user-one',hash:'#alerts',personal:{favorites:[],compare:[],alerts:[{id:8,productId:11,targetPrice:20000,status:'triggered',currency:'EUR'}]}});
  const content=w.document.getElementById('alertList').textContent;
  assert.match(content,/Devise modifiée/);
  assert.doesNotMatch(content,/Seuil atteint/);
  assert.match(content,/€/);
  dom.window.close();
});

test('unavailable favorites can be removed even from an empty catalog',async()=>{
  const {dom,w,calls}=await setup({user:'user-one',hash:'#favorites',empty:true,personal:{favorites:[999],compare:[],alerts:[]}});
  w.document.querySelector('#favoriteDeals [data-remove-unavailable]').click();await delay();
  assert.equal(calls[0][1].favorites.length,0);
  assert.equal(w.document.getElementById('favoritesEmpty').hidden,false);dom.window.close();
});

test('unavailable compared offers remain removable and cannot start comparison',async()=>{
  const {dom,w,calls}=await setup({user:'user-one',hash:'#compare',personal:{favorites:[],compare:[11,999],alerts:[]}});
  assert.equal(w.document.getElementById('runCompare').disabled,true);
  w.document.querySelector('#comparePicker [data-remove-unavailable]').click();await delay();
  assert.deepEqual(Array.from(calls[0][1].compare),[11]);
  assert.match(w.document.getElementById('compareCount').textContent,/1 \/ 4/);dom.window.close();
});

test('catalog refresh invalidates a comparison after a currency change',async()=>{
  const {dom,w,api}=await setup({user:'user-one',hash:'#compare',personal:{favorites:[],compare:[11,12],alerts:[]}});
  w.document.getElementById('runCompare').click();
  assert.equal(w.document.getElementById('compareResults').hidden,false);
  api.catalog=async()=>({deals:[deal,{...deal,id:12,currency:'EUR'}],categories,merchants:[]});
  Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
  w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();
  assert.equal(w.document.getElementById('runCompare').disabled,true);
  assert.equal(w.document.getElementById('compareResults').hidden,true);dom.window.close();
});

test('normalization keeps merchant and affiliate URLs independently editable',()=>{
  const result=backend.normalizeDeal({...raw,affiliate_url:'https://affiliate.example/offer'},[],categories);
  assert.equal(result.originalUrl,'https://example.com/product');
  assert.equal(result.affiliateOverride,'https://affiliate.example/offer');
  assert.equal(result.affiliateUrl,'https://affiliate.example/offer');
  assert.equal(deal.affiliateOverride,'');
});

test('admin saves separate links, scheduled dates and featured status',async()=>{
  const {dom,w,calls}=await setup({user:'admin-one',role:'admin',hash:'#admin'});
  w.document.querySelector('[data-admin-edit]').click();
  assert.equal(w.document.getElementById('adminDealUrl').value,'https://example.com/product');
  assert.equal(w.document.getElementById('adminDealAffiliate').value,'');
  w.document.getElementById('adminDealAffiliate').value='https://affiliate.example/offer';
  w.document.getElementById('adminDealStart').value='2030-01-01T08:00';
  w.document.getElementById('adminDealExpiry').value='2030-01-02T08:00';
  w.document.getElementById('adminDealFeatured').checked=true;
  w.document.getElementById('adminDealForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
  assert.equal(calls[0][1].url,'https://example.com/product');
  assert.equal(calls[0][1].affiliateUrl,'https://affiliate.example/offer');
  assert.equal(calls[0][1].startsAt,'2030-01-01T08:00:00.000Z');
  assert.equal(calls[0][1].featured,true);dom.window.close();
});

test('admin refuses reversed publication dates before saving',async()=>{
  const {dom,w,calls}=await setup({user:'admin-one',role:'admin',hash:'#admin'});
  w.document.querySelector('[data-admin-edit]').click();
  w.document.getElementById('adminDealStart').value='2030-01-02T08:00';
  w.document.getElementById('adminDealExpiry').value='2030-01-01T08:00';
  w.document.getElementById('adminDealForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
  assert.equal(calls.length,0);assert.match(w.document.getElementById('toast').textContent,/après le début/);dom.window.close();
});

test('home prioritizes offers explicitly featured by the admin',async()=>{
  const {dom,w,api}=await setup();
  api.catalog=async()=>({deals:[deal,{...deal,id:12,name:'Featured offer',score:1,featured:true}],categories,merchants:[]});
  Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
  w.document.dispatchEvent(new w.Event('visibilitychange'));await delay();
  assert.match(w.document.querySelector('#featuredDeals .product-card').textContent,/Featured offer/);dom.window.close();
});

test('account data failure can be retried without reloading the page',async()=>{
  const {dom,w,api,calls}=await setup({user:'user-one',personalFail:true});
  assert.equal(w.document.getElementById('retryAccount').hidden,false);
  api.personal=async()=>({favorites:[],compare:[],alerts:[]});
  w.document.getElementById('retryAccount').click();await delay();
  assert.equal(w.document.getElementById('retryAccount').hidden,true);
  w.document.querySelector('[data-save]').click();await delay();
  assert.equal(calls[0][0],'save');dom.window.close();
});

test('late profile save never restores personal data after signout',async()=>{
  const {dom,w,client,authListener}=await setup({user:'user-one',hash:'#profile'});
  let release;const query={update(){return this},eq(){return this},select(){return this},single(){return new Promise(r=>{release=r})}};
  client.from=()=>query;
  w.document.getElementById('editProfileName').value='Old account';
  w.document.getElementById('profileForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  authListener('SIGNED_OUT',null);await delay();
  release({data:{full_name:'Old account',role:'admin'},error:null});await delay();
  assert.equal(w.document.getElementById('accountBox').hidden,true);
  assert.doesNotMatch(w.document.getElementById('profileName').textContent,/Old account/);dom.window.close();
});

test('recovery form handles success and expired links without a stuck button',async()=>{
  for(const failed of [false,true]) {
    const {dom,w,client,authListener}=await setup({user:'user-one'});
    let submitted;
    client.auth.updateUser=async input=>{submitted=input;return failed?{error:Error('expired')}:{}};
    authListener('PASSWORD_RECOVERY',{user:{id:'user-one'}});await delay();
    assert.equal(w.document.getElementById('recoveryModal').classList.contains('open'),true);
    w.document.getElementById('recoveryPassword').value='long-test-password';
    w.document.getElementById('recoveryForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await delay();
    assert.equal(submitted.password,'long-test-password');
    assert.equal(w.document.querySelector('#recoveryForm button').disabled,false);
    assert.equal(w.document.getElementById('recoveryModal').classList.contains('open'),failed);dom.window.close();
  }
});

test('queued saves use the last server-confirmed state',async()=>{
  const {dom,w,api}=await setup({user:'user-one'});
  const expectedStates=[];
  api.savePersonal=async(next,expected)=>{expectedStates.push(structuredClone(expected));return structuredClone(next)};
  w.document.querySelector('[data-save="11"]').click();
  w.document.querySelector('[data-save="12"]').click();await delay();
  assert.deepEqual(Array.from(expectedStates[0].favorites),[]);
  assert.deepEqual(Array.from(expectedStates[1].favorites),[11]);dom.window.close();
});

test('a stale-device save reloads server selections and reports the conflict',async()=>{
  const {dom,w,api}=await setup({user:'user-one'});
  api.savePersonal=async()=>{throw {code:'40001'}};
  api.personal=async()=>({favorites:[12],compare:[],alerts:[]});
  w.document.querySelector('[data-save="11"]').click();await delay();
  assert.match(w.document.getElementById('toast').textContent,/autre appareil/);
  assert.equal(w.document.querySelector('[data-save="11"]').classList.contains('saved'),false);
  assert.equal(w.document.querySelector('[data-save="12"]').classList.contains('saved'),true);dom.window.close();
});

test('FR/EN translates every marked static label and survives a fresh page load',async()=>{
 const {dom,w}=await setup({empty:true});
 w.document.querySelector('[data-lang-switch="en"]').click();await delay();
 assert.equal(w.document.documentElement.lang,'en');assert.equal(w.localStorage.getItem('dealbot_language_v2'),'en');
 for(const el of w.document.querySelectorAll('[data-i18n]')){
  const entry=w.DealBotI18n.messages[el.dataset.i18n];assert.ok(entry,'Missing key '+el.dataset.i18n);
  if(el.textContent.trim()===entry.fr&&entry.fr!==entry.en)assert.fail('Still French: '+el.dataset.i18n);
 }
 assert.match(w.document.getElementById('catalogStatus').textContent,/No deals have been published/);
 const again=await setup({storedLang:w.localStorage.getItem('dealbot_language_v2'),empty:true});
 assert.equal(again.w.document.documentElement.lang,'en');assert.match(again.w.document.title,/comparison/);
 again.dom.window.close();
 w.document.querySelector('[data-lang-switch="fr"]').click();await delay();
 assert.match(w.document.getElementById('catalogStatus').textContent,/Aucune offre publiée/);dom.window.close();
});
test('all public routes and admin render in English without runtime errors',async()=>{
 const {dom,w,errors}=await setup({storedLang:'en',user:'admin-one',role:'admin'});
 for(const route of ['home','explore','categories','compare','intelligence','favorites','alerts','profile','how','about','contact','privacy','terms','admin','deal-11']){
  w.location.hash='#'+route;await delay();assert.equal(w.document.querySelectorAll('[data-page-section].active').length,1,route);
  const content=w.document.querySelector('[data-page-section].active').textContent;
  for(const phrase of ['Parcourir par catégorie','Historique des prix','Prix actuel','Aucune alerte active','Modifier','Vos favoris'])assert.ok(!content.includes(phrase),route+' retained '+phrase);
 }
 assert.equal(errors.length,0);dom.window.close();
});
test('English validation and guest favorites open a usable translated modal',async()=>{
 const {dom,w}=await setup({storedLang:'en'});
 w.document.querySelector('[data-save]').click();await delay();
 assert.ok(w.document.getElementById('loginModal').classList.contains('open'));
 assert.match(w.document.getElementById('toast').textContent,/Log in to save/);
 const email=w.document.getElementById('loginEmail');email.dispatchEvent(new w.Event('invalid'));
 assert.equal(email.validationMessage,'Please fill out this field.');
 email.value='test@example.com';email.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(email.validationMessage,'');
 dom.window.close();
});
test('hamburger, escape and route navigation keep menu state consistent',async()=>{
 const {dom,w}=await setup({storedLang:'en'});const button=w.document.getElementById('hamburger');
 button.click();assert.equal(button.getAttribute('aria-expanded'),'true');
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(button.getAttribute('aria-expanded'),'false');
 button.click();w.document.querySelector('#mobileNav [data-page="explore"]').click();await delay();
 assert.equal(button.getAttribute('aria-expanded'),'false');dom.window.close();
});
test('translation catalog covers every literal translation key in app code',async()=>{
 const {dom,w}=await setup();const acorn=require('acorn');const tree=acorn.parse(script,{ecmaVersion:'latest'});
 function walk(n){if(!n||typeof n!=='object')return;
  if(n.type==='CallExpression'&&n.callee.name==='t'&&n.arguments[0]?.type==='Literal'){
   const key=n.arguments[0].value.replace(/\s+/g,' ').trim();const entry=w.DealBotI18n.messages[key];
   assert.ok(entry?.fr&&entry?.en,'Missing translation: '+key);
  }
  Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(walk):walk(v));
 }
 walk(tree);dom.window.close();
});

test('admin import provenance is escaped and affiliate query is not shown in overview',async()=>{
 const imported={...deal,syncSource:'source<unsafe>',syncExternalId:'offer<unsafe>',syncRevision:7,status:'expired',scoreMethod:'automatic-v1',affiliateOverride:'https://example.com/path?private_parameter=hidden'};
 const {dom,w}=await setup({user:'admin-user',role:'admin',catalogDeals:[imported]});
 w.location.hash='admin'; await delay(); await delay();
 const table=w.document.getElementById('adminDealsBody');
 assert.match(table.textContent,/source<unsafe>/);assert.match(table.textContent,/offer<unsafe>/);
 assert.match(table.textContent,/Expiré/);assert.match(table.textContent,/Calcul automatique v1/);
 assert.match(table.textContent,/example.com/);assert.doesNotMatch(table.textContent,/private_parameter|hidden/);
 assert.equal(table.querySelector('unsafe'),null);dom.window.close();
});
