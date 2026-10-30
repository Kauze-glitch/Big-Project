const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
function repo(raw) {
  const data=new Map(raw?[['nhom12-citizen-demo-v1',JSON.stringify(raw)]]:[]),window={};
  vm.runInNewContext(fs.readFileSync('portal-store.js','utf8'),{window,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},structuredClone,crypto});
  return window.CitizenRepository;
}
function view() {
  const window={},elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,attrs:{'aria-pressed':'false'},getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=v;}});return elements.get(id);};
  vm.runInNewContext(fs.readFileSync('portal-profile.js','utf8'),{window,document:{getElementById:el}});
  return {api:window.CitizenProfile,el};
}
const fields = r => Object.fromEntries(['name','cccd','dob','gender','phone','email','address','ward','occupation'].map(k=>[k,r[k]]));
test('Original demo citizen gets a card with matching identity; no shared hard-coded name',()=>{const R=repo();for(const r of R.list()){assert.equal(r.identityCard.fullName,r.name);assert.equal(r.identityCard.number,r.cccd);assert.equal(r.identityCard.dob,r.dob);}});
test('Legacy saved records retain edits and receive only matching demo card snapshots',()=>{const old=JSON.parse(JSON.stringify(repo().get('demo-1')));delete old.identityCard;old.name='Tên đã được sửa';const r=repo({records:[old],events:[]}).get('demo-1');assert.equal(r.name,'Tên đã được sửa');assert.equal(r.identityCard.fullName,'Nguyễn An Minh');});
test('New citizens do not get fabricated card information',()=>{const R=repo(),r=R.save({...fields(R.get('demo-1')),name:'Công dân mới',cccd:'000000000099',phone:'0000000099'});assert.equal(r.identityCard,undefined);assert.match(view().api.html(r,'card',false),/Chưa cập nhật thông tin căn cước/);});
test('Editing profile preserves card snapshot and existing extra data',()=>{const R=repo(),old=R.get('demo-1'),r=R.save({...fields(old),name:'Tên mới',nationality:'Việt Nam',hometown:'Quê quán mới'},old.id);assert.equal(r.identityCard.fullName,old.name);assert.equal(R.get(old.id).hometown,'Quê quán mới');});
test('Member can add full card data and fields to a new citizen',()=>{const R=repo();const r=R.save({...fields(R.get('demo-1')),name:'Công dân mới',cccd:'000000000099',phone:'0000000099',nationality:'Việt Nam',cardIssuedOn:'2025-09-01',cardExpiresOn:'2035-09-01',cardIssuer:'Nơi cấp minh họa',cardStatus:'active'});assert.equal(r.identityCard.fullName,'Công dân mới');assert.equal(r.identityCard.number,'000000000099');assert.equal(r.nationality,'Việt Nam');});
test('Partial or reversed card dates are rejected without changing record',()=>{const R=repo(),r=R.get('demo-1');assert.throws(()=>R.save({...fields(r),cardIssuedOn:'2025-09-01',cardExpiresOn:'2024-09-01',cardIssuer:'Nơi cấp'},r.id));assert.equal(R.get(r.id).identityCard.expiresOn,'2035-09-01');});
test('Card expiry and revocation override the active visual state',()=>{const api=view().api;assert.equal(api.cardState({status:'active',issuedOn:'2020-01-01',expiresOn:'2025-01-01'},'2026-01-01').label,'Hết hạn');assert.equal(api.cardState({status:'revoked'},'2026-01-01').active,false);assert.equal(api.cardState({status:'active',issuedOn:'2030-01-01'},'2026-01-01').active,false);});
test('All four views render the signed-in record and active route',()=>{const r=repo().get('demo-2'),api=view().api;for(const page of ['personal','card','residence','requests']){const html=api.html(r,page,false);assert.match(html,new RegExp('href="#/profile/'+page+'" class="active"'));assert.doesNotMatch(html,/database\.html/);if(page==='card'||page==='personal')assert.match(html,/Trần Ngọc Hà/);}});
test('Card number is masked initially and toggles; the two sides switch correctly',()=>{const r=repo().get('demo-1'),{api,el}=view();assert.doesNotMatch(api.html(r,'card',false),/>000000000001</);api.bind(r);el('identity-reveal').onclick();assert.equal(el('identity-number').textContent,'0000 0000 0001');el('identity-reveal').onclick();assert.equal(el('identity-number').textContent,'•••• •••• 0001');el('identity-flip').onclick();assert.equal(el('identity-front').hidden,true);assert.equal(el('identity-back').hidden,false);});
test('Untrusted fields and request content are escaped',()=>{const r=repo().get('demo-1');r.name='<img src=x onerror=alert(1)>';r.identityCard.fullName=r.name;r.requests=[{title:'<script>bad()</script>',description:'<img onerror=bad()>',history:[{title:'<svg onload=bad()>'}]}];const api=view().api;for(const page of ['personal','card','requests']){const html=api.html(r,page,false);assert.doesNotMatch(html,/<script>|<img|<svg onload/);assert.match(html,/&lt;/);}});
test('Member gets management and diagram links; citizen gets neither',()=>{const {api}=view(),r=repo().get('demo-1');assert.match(api.html(r,'personal',true),/database\.html/);assert.doesNotMatch(api.html(r,'personal',false),/#\/admin|database\.html/);});
test('Locked account remains blocked after profile upgrade',()=>{const R=repo();R.setAccount('demo-1','locked');assert.throws(()=>R.checkLogin('000000000001','demo123'),/khóa/);});
