const {test}=require('node:test'); const assert=require('node:assert/strict'); const vm=require('node:vm'); const fs=require('node:fs');
const authSource=fs.readFileSync('portal-auth.js','utf8'), uiSource=fs.readFileSync('portal.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(userId, opts={}) {
 const events=new EventTarget(); let callback, resolveRows; const rows=opts.defer?new Promise(resolve=>resolveRows=resolve):null;
 const client={auth:{getUser:async()=>({data:{user:userId?{id:userId}:null},error:opts.authError}),onAuthStateChange:fn=>callback=fn},from:table=>{
  assert.equal(table,'sections');let owner,slugs;
  const q={select:()=>q,in:(key,values)=>{slugs=values;return q;},eq:(key,value)=>{owner=value;return q;},abortSignal:async()=>{
   if(rows)return rows; if(opts.failure)throw Error('offline');
   return {data:['one','two','three'].map((id,i)=>({owner_id:id,slug:'phan'+(i+1)})).filter(r=>r.owner_id===owner&&slugs.includes(r.slug)),error:null};
  }};return q;
 }};
 const window={supabase:opts.noSDK?undefined:{createClient:()=>client},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 const document={addEventListener(){},hidden:false};
 vm.runInNewContext(authSource,{window,document,Event,AbortController,setTimeout,clearTimeout});
 return {window,signal:event=>callback(event),resolveRows};
}
for(const id of ['one','two','three'])test('Allows project owner '+id,async()=>{const x=setup(id);assert.equal(x.window.PortalAuth.isMember(),false);await settle();assert.equal(x.window.PortalAuth.isMember(),true);});
for(const [name,id,opts] of [['guest',null,{}],['unrelated authenticated user','outsider',{}],['Auth rejects cached user','one',{authError:Error('expired')}],['membership lookup fails','one',{failure:true}],['SDK fails to load','one',{noSDK:true}]])test('Denies '+name,async()=>{const x=setup(id,opts);await settle();assert.equal(x.window.PortalAuth.isMember(),false);});
test('Signout revokes access immediately',async()=>{const x=setup('one');await settle();x.signal('SIGNED_OUT');assert.equal(x.window.PortalAuth.isMember(),false);});
test('Late membership response cannot restore signed-out access',async()=>{const x=setup('one',{defer:true});await settle();x.signal('SIGNED_OUT');x.resolveRows({data:[{owner_id:'one'}]});await settle();assert.equal(x.window.PortalAuth.isMember(),false);});
function ui(member,route='#/login') {
 const elements=new Map(); const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',close(){this.closed=true;},classList:{add(){},remove(){}},focus(){},querySelectorAll:()=>[]});return elements.get(id);};
 const events=new EventTarget(); const window={CitizenRepository:{list(){throw Error('Unauthorized records read');}},PortalAuth:{isMember:()=>member,status:()=> 'ready'},addEventListener:events.addEventListener.bind(events),scrollTo(){}};
 const document={getElementById:el,querySelector:el};
 vm.runInNewContext(uiSource,{window,document,location:{hash:route},sessionStorage:{getItem:()=> 'citizen-demo-id'},setTimeout,clearTimeout,setInterval,clearInterval});
 return {root:el('portal-app'),panel:el('login-panel'),el,logout(){member=false;events.dispatchEvent(new Event('portalauthchange'));}};
}
test('Citizen session does not expose member button or manager links',()=>{const x=ui(false);assert.doesNotMatch(x.root.innerHTML,/id="tab-member"/);assert.doesNotMatch(x.panel.innerHTML,/href="#\/admin"/);});
test('Authorized member sees member tab; signout removes it',()=>{const x=ui(true);assert.match(x.root.innerHTML,/id="tab-member"/);x.logout();assert.doesNotMatch(x.root.innerHTML,/id="tab-member"/);assert.equal(x.el('record-dialog').closed,true);});
test('Direct manager URL is blocked before any record listing',()=>{const x=ui(false,'#/admin');assert.match(x.root.innerHTML,/Khu vực dành cho thành viên dự án/);assert.doesNotMatch(x.root.innerHTML,/citizen-results/);});
