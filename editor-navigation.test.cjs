const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('editor.js','utf8');
const latest=source.slice(source.indexOf('  function chooseLatest('),source.indexOf('  async function choose('));
const initialize=source.slice(source.indexOf('  async function init()'),source.indexOf('  // Rebuild only navigation'));
test('Navigation resolves fresh section data after a reload replaces the section objects',async()=>{
 const original={slug:'phan1',title:'Old',content:'Old'},buttons=[],selected=[];
 const A={sections:[original],load:async()=>{},navItem:()=>({dataset:{}}),canEdit:()=>true,toast:()=>{}};
 const elements={'editor-nav':{replaceChildren(){buttons.length=0;},append:b=>buttons.push(b)}};
 const ctx={A,$:id=>elements[id],choose:s=>selected.push(s),status:()=>{},URLSearchParams,location:{search:'?section=phan1'}};
 vm.runInNewContext(latest+initialize+';globalInit=init',ctx);await ctx.globalInit();
 A.sections=[{slug:'phan1',title:'New',content:'Latest published content'}];buttons[0].onclick();
 assert.equal(selected.at(-1),A.sections[0]);assert.equal(selected.at(-1).content,'Latest published content');
});
test('Removing the obsolete localStorage draft cannot block restoration from the published section',async()=>{
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,close(){this.closed=true;}});return elements.get(id);};
 let restored=null,deleted=false;const fresh={slug:'phan1',content:'Published'};
 const code=source.slice(source.indexOf("  $('discard-confirm').onclick="),source.indexOf("  $('save-btn').onclick="));
 const ctx={$:el,owns:()=>true,saving:false,discarding:false,epoch:1,key:()=> 'draft',identity:'user',current:{slug:'phan1'},authUI(){},A:{load:async()=>{},user:{id:'user'},sections:[fresh],canEdit:()=>true,drafts:{delete:async()=>deleted=true},toast:message=>{throw Error(message);}},clearTimeout,draftTimer:undefined,draftQueue:Promise.resolve(),localStorage:{removeItem(){throw Error('blocked');}},dirty:true,choose:async s=>restored=s};
 vm.runInNewContext(code,ctx);await el('discard-confirm').onclick();assert(deleted);assert.equal(restored,fresh);assert.equal(el('discard-dialog').closed,true);assert.equal(ctx.dirty,false);
});

test('Export file names use the same local calendar day as the cover',()=>{
 const source=fs.readFileSync('report.js','utf8'),helper=source.slice(source.indexOf('  const downloadDate='),source.indexOf('  async function pdfBlob'));
 class FakeDate extends Date{constructor(){super('2026-10-31T17:30:00Z');}getFullYear(){return 2026;}getMonth(){return 10;}getDate(){return 1;}}
 const link={click(){},remove(){}},ctx={Date:FakeDate,URL:{createObjectURL:()=> 'blob:local',revokeObjectURL(){}},A:{el:()=>link},document:{body:{append(){}}},setTimeout(){}};
 vm.runInNewContext(helper+';download({},"docx");',ctx);assert.equal(link.download,'Bao-cao-Nhom-12-2026-11-01.docx');
});
