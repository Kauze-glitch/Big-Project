const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function page(member=false) {
  const events=new EventTarget(),elements=new Map();let allowed=member;
  const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',value:'',style:{},textContent:'',classList:{toggle(){}},addEventListener(){},scrollIntoView(){},contains:()=>true,querySelector:()=>el('svg')});return elements.get(id);};
  const window={PortalAuth:{isMember:()=>allowed,status:()=> 'ready'},addEventListener:events.addEventListener.bind(events)};
  const document={getElementById:el,querySelectorAll:()=>[]};
  vm.runInNewContext(fs.readFileSync('database-graph.js','utf8'),{window,document});
  vm.runInNewContext(fs.readFileSync('database.js','utf8'),{window,document});
  return {el,auth(value){allowed=value;events.dispatchEvent(new Event('portalauthchange'));}};
}
test('Guest never mounts diagram content',()=>{const p=page();assert.match(p.el('database-root').innerHTML,/Khu vực dành cho thành viên/);assert.doesNotMatch(p.el('database-root').innerHTML,/database-focus/);});
test('Member gets diagram, table details and download links',()=>{const p=page(true);assert.match(p.el('database-root').innerHTML,/database-focus/);assert.match(p.el('database-root').innerHTML,/database-design.dbml/);assert.match(p.el('detail').innerHTML,/so_dinh_danh/);});
test('Signout clears diagram and its click handler',()=>{const p=page(true);p.auth(false);assert.doesNotMatch(p.el('database-root').innerHTML,/database-focus/);assert.equal(p.el('database-root').onclick,null);});
test('Sign-in after rejection mounts the authorized viewer',()=>{const p=page();p.auth(true);assert.match(p.el('database-root').innerHTML,/database-focus/);});
test('Authorized page initializes the focused graph with readable table names',()=>{const p=page(true);assert.match(p.el('database-focus').innerHTML,/Quan hệ của Hồ sơ công dân/);assert.match(p.el('database-focus').innerHTML,/data-graph-table="THE_CAN_CUOC"/);});
test('Schema FK targets exist and all downloaded assets exist',()=>{const d=JSON.parse(fs.readFileSync('database-schema.json','utf8'));assert.equal(d.tables.length,22);for(const r of d.refs)assert(d.tables.some(t=>t.name===r.to));for(const f of ['DATABASE-DESIGN.md','database-design.dbml','database-erd.mmd','database-schema.json'])assert(fs.existsSync(f));});
