const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const data=JSON.parse(fs.readFileSync('database-schema.json','utf8'));
function setup(name='CONG_DAN') {
  const window={};vm.runInNewContext(fs.readFileSync('database-graph.js','utf8'),{window});
  const container={innerHTML:'',contains:()=>true};let widget,detailCount=0;
  widget=window.DatabaseGraph.mount(container,data,n=>widget.setTable(n),()=>detailCount++);
  widget.setTable(name);
  const click=props=>container.onclick({target:{closest:()=>({dataset:{},...props})}});
  return {container,widget,api:window.DatabaseGraph,click,detailCount:()=>detailCount};
}
test('Neighborhood groups multiple foreign keys to the same table',()=>{const {api}=setup(),n=api.neighborhood(data,'QUAN_HE_NHAN_THAN');assert.equal(n.parents.length,1);assert.equal(n.parents[0].name,'CONG_DAN');assert.equal(n.parents[0].refs.length,2);});
test('Every selected table includes exactly its direct relationships',()=>{const {api}=setup();for(const t of data.tables){const n=api.neighborhood(data,t.name),actual=n.parents.flatMap(x=>x.refs).concat(n.children.flatMap(x=>x.refs),n.self);const expected=data.refs.filter(r=>r.from===t.name||r.to===t.name);assert.equal(actual.length,expected.length);assert(actual.every(r=>r.from===t.name||r.to===t.name));}});
test('Self-relations are explicit and do not duplicate neighbor cards',()=>{const {api}=setup(),n=api.neighborhood(data,'DON_VI_HC');assert.equal(n.self.length,1);assert(!n.parents.some(p=>p.name==='DON_VI_HC'));});
test('Main relationship view shows at most four neighbors per side',()=>{const {container}=setup();const graph=container.innerHTML.split('<details class="focus-directory">')[0];assert.equal((graph.match(/class="focus-table"/g)||[]).length,4);assert.match(graph,/Trang bảng tham chiếu sau/);});
test('Paging reveals the remaining related tables',()=>{const p=setup();const before=p.container.innerHTML;p.click({dataset:{graphPage:'children:1'}});assert.notEqual(p.container.innerHTML,before);assert.match(p.container.innerHTML,/5–8/);});
test('Selecting a table updates the center and resets pagination',()=>{const p=setup();p.click({dataset:{graphPage:'children:1'}});p.click({dataset:{graphTable:'THE_CAN_CUOC'}});assert.match(p.container.innerHTML,/Quan hệ của Thẻ căn cước \/ CCCD/);assert.match(p.container.innerHTML,/cong_dan_id/);});
test('Dropdown changes the selected table',()=>{const p=setup();p.container.onchange({target:{id:'focus-table-select',value:'CU_TRU'}});assert.match(p.container.innerHTML,/Quan hệ của Lịch sử cư trú/);});
test('Zoom increases legible text scale and reset restores it',()=>{const p=setup();p.click({id:'diagram-in'});assert.match(p.container.innerHTML,/style="zoom:1.1"/);p.click({id:'diagram-reset'});assert.match(p.container.innerHTML,/style="zoom:1"/);});
test('Detail action works and signout cleanup removes handlers',()=>{const p=setup();p.click({dataset:{graphDetail:'true'}});assert.equal(p.detailCount(),1);p.widget.destroy();assert.equal(p.container.onclick,null);assert.equal(p.container.onchange,null);});
