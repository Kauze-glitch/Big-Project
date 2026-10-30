'use strict';
(() => {
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const W=460, HEADER=88, ROW=29, GAP=185;
  const core=['DON_VI_HC','HO_GIA_DINH','THANH_VIEN_HO','CONG_DAN','THE_CAN_CUOC','CAN_BO','HO_SO_YEU_CAU','BIEN_DONG','GIAY_TO_HO_TICH'];
  function neighborhood(data,name){
    const parents=new Map(),children=new Map(),self=[];
    for(const ref of data.refs){
      if(ref.from===name&&ref.to===name){self.push(ref);continue;}
      const map=ref.from===name?parents:ref.to===name?children:null;if(!map)continue;
      const other=ref.from===name?ref.to:ref.from;
      if(!map.has(other))map.set(other,{name:other,refs:[]});map.get(other).refs.push(ref);
    }
    return {parents:[...parents.values()],children:[...children.values()],self};
  }
  function model(data,scope='core',selected='CONG_DAN',common=false){
    let visible;
    if(scope==='all')visible=data.tables;
    else if(scope==='core')visible=data.tables.filter(t=>core.includes(t.name));
    else if(scope==='neighbors'){
      const n=neighborhood(data,selected),names=new Set([selected,...n.parents.map(r=>r.name),...n.children.map(r=>r.name)]);
      visible=data.tables.filter(t=>names.has(t.name));
    }else visible=data.tables.filter(t=>t.group===Number(scope));
    const heights=Array(5).fill(65),nodes=[];
    const layout={DON_VI_HC:[735,60],HO_GIA_DINH:[65,590],CONG_DAN:[735,620],CAN_BO:[1405,510],THANH_VIEN_HO:[65,1120],HO_SO_YEU_CAU:[1405,1060],GIAY_TO_HO_TICH:[65,1660],THE_CAN_CUOC:[735,1510],BIEN_DONG:[1405,1840]};
    for(const t of visible){
      const append=common&&!['LICH_SU_XU_LY','BIEN_DONG','NHAT_KY_THAO_TAC'].includes(t.name)?data.common:[];
      const fields=t.fields.concat(append),height=HEADER+fields.length*ROW;
      let x,y;
      if(scope==='core'){[x,y]=layout[t.name];}
      else {const col=scope==='all'?t.group:nodes.length%3;x=65+col*(W+GAP);y=heights[col];heights[col]+=height+170;}
      nodes.push({...t,fields,x,y,width:W,height});
    }
    const byName=new Map(nodes.map(n=>[n.name,n]));
    const edges=data.refs.filter(r=>byName.has(r.from)&&byName.has(r.to)).map((r,index)=>{
      const from=byName.get(r.from),to=byName.get(r.to),fieldIndex=from.fields.findIndex(f=>f[0]===r.field);
      const sameSide=from.x===to.x;
      const right=sameSide||to.x>from.x;
      const sx=from.x+(right?W:0),sy=from.y+HEADER+(fieldIndex+.5)*ROW;
      const tx=to.x+(sameSide?W:right?0:W),ty=to.y+HEADER+ROW/2;
      const bend=sameSide?120:Math.max(75,Math.min(160,Math.abs(tx-sx)*.48));
      const c1=sx+(right?bend:-bend),c2=sameSide?tx+bend:tx+(right?-bend:bend);
      return {...r,index,sx,sy,tx,ty,c1,c2,path:`M ${sx} ${sy} C ${c1} ${sy}, ${c2} ${ty}, ${tx} ${ty}`,labelX:(sx+3*c1+3*c2+tx)/8,labelY:(sy+ty)/2};
    });
    return {nodes,edges,width:Math.max(900,...nodes.map(n=>n.x+W+160)),height:Math.max(600,...nodes.map(n=>n.y+n.height+100))};
  }
  function svgMarkup(m,selected){
    const markers=`<defs><marker id="erd-one" viewBox="0 0 26 20" refX="25" refY="10" markerWidth="26" markerHeight="20" orient="auto" markerUnits="userSpaceOnUse"><path d="M17 3V17 M23 3V17" fill="none" stroke="context-stroke" stroke-width="1.7"/></marker><marker id="erd-optional" viewBox="0 0 30 20" refX="29" refY="10" markerWidth="30" markerHeight="20" orient="auto" markerUnits="userSpaceOnUse"><circle cx="13" cy="10" r="4" fill="#191e1b" stroke="context-stroke" stroke-width="1.7"/><path d="M26 3V17" fill="none" stroke="context-stroke" stroke-width="1.7"/></marker><marker id="erd-many" viewBox="0 0 34 20" refX="1" refY="10" markerWidth="34" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 2L15 10L1 18 M1 10H33" fill="none" stroke="context-stroke" stroke-width="1.7"/><circle cx="25" cy="10" r="4" fill="#191e1b" stroke="context-stroke" stroke-width="1.7"/></marker><marker id="erd-zero-one" viewBox="0 0 32 20" refX="1" refY="10" markerWidth="32" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M3 3V17" fill="none" stroke="context-stroke" stroke-width="1.7"/><circle cx="20" cy="10" r="4" fill="#191e1b" stroke="context-stroke" stroke-width="1.7"/></marker></defs>`;
    const edges=m.edges.map(e=>`<g class="erd-edge ${e.from===selected||e.to===selected?'related':''}" data-edge-from="${e.from}" data-edge-to="${e.to}"><title>${e.from}.${e.field} → ${e.to}.id</title><path d="${e.path}" marker-start="url(#${e.unique?'erd-zero-one':'erd-many'})" marker-end="url(#${e.required?'erd-one':'erd-optional'})"/><text x="${e.labelX}" y="${e.labelY-9}" text-anchor="middle">${escape(e.field)}</text></g>`).join('');
    const nodes=m.nodes.map(n=>`<g class="erd-table ${n.name===selected?'selected':''}" data-erd-table="${n.name}" tabindex="0" role="button" aria-label="Chọn bảng ${escape(n.title)}"><rect class="erd-table-bg" x="${n.x}" y="${n.y}" width="${W}" height="${n.height}" rx="9"/><path class="erd-table-header" d="M${n.x+9} ${n.y}H${n.x+W-9}Q${n.x+W} ${n.y} ${n.x+W} ${n.y+9}V${n.y+60}H${n.x}V${n.y+9}Q${n.x} ${n.y} ${n.x+9} ${n.y}"/><text class="erd-table-title" x="${n.x+W/2}" y="${n.y+25}" text-anchor="middle">${n.name}</text><text class="erd-table-subtitle" x="${n.x+W/2}" y="${n.y+46}" text-anchor="middle">${escape(n.title)}</text><path class="erd-grid" d="M${n.x} ${n.y+60}H${n.x+W} M${n.x+108} ${n.y+60}V${n.y+n.height} M${n.x+399} ${n.y+60}V${n.y+n.height}"/><text class="erd-col-heading" x="${n.x+12}" y="${n.y+79}">Kiểu</text><text class="erd-col-heading" x="${n.x+120}" y="${n.y+79}">Tên cột</text><text class="erd-col-heading" x="${n.x+410}" y="${n.y+79}">Khóa</text>${n.fields.map((f,i)=>{const y=n.y+HEADER+i*ROW,key=f[2].includes('PK')?'PK':f[2].includes('FK ')||f[2].includes('AUTH')?'FK':f[2].includes('UQ')?'UQ':'';return `<g class="erd-field"><title>${escape(f[0]+': '+f[3]+' ('+f[2]+')')}</title><path class="erd-grid" d="M${n.x} ${y}H${n.x+W}"/><text class="erd-field-type" x="${n.x+12}" y="${y+20}">${escape(f[1])}</text><text class="erd-field-name ${key==='PK'?'primary':''}" x="${n.x+120}" y="${y+20}">${escape(f[0])}</text><text class="erd-field-key" x="${n.x+411}" y="${y+20}">${key}</text></g>`;}).join('')}</g>`).join('');
    return markers+'<g id="erd-scene">'+edges+nodes+'</g>';
  }
  function mount(container,data,onSelect,onDetail){
    let selected='CONG_DAN',scope='core',common=false,m,svg,scene,resize,drag=null,moved=false;
    let camera={scale:.85,x:0,y:0},size={width:1100,height:660};
    container.innerHTML=`<div class="erd-toolbar"><label>Đến bảng<select id="erd-table-select" aria-label="Đến bảng">${data.tables.map(t=>`<option value="${t.name}">${escape(t.title)} · ${t.name}</option>`).join('')}</select></label><label>Phạm vi sơ đồ<select id="erd-scope" aria-label="Phạm vi sơ đồ"><option value="core">Nhóm bảng cốt lõi</option><option value="all">Toàn bộ 22 bảng</option><option value="neighbors">Bảng đang chọn và liên quan</option>${data.groups.map((g,i)=>`<option value="${i}">${escape(g)}</option>`).join('')}</select></label><div class="erd-tools"><button id="diagram-out" aria-label="Thu nhỏ sơ đồ">−</button><button id="diagram-reset">100%</button><button id="diagram-in" aria-label="Phóng to sơ đồ">+</button><button id="erd-fit">Vừa khung</button><button id="erd-expand" aria-pressed="false">Mở rộng</button></div></div><div class="erd-help"><span>Kéo nền để di chuyển · Cuộn trong khung để phóng to · Chọn bảng để tô sáng quan hệ</span><label><input id="erd-common" type="checkbox"> Hiện trường quản lý chung</label></div><div class="erd-canvas" id="erd-canvas"><svg id="erd-svg" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Sơ đồ ERD gồm các bảng, cột, kiểu dữ liệu và quan hệ" tabindex="0"></svg></div><div class="erd-status"><span id="erd-status" role="status"></span><span>PK: khóa chính · FK: khóa ngoại · UQ: duy nhất</span><button id="erd-detail">Chi tiết bảng đang chọn ↓</button></div><p class="erd-footnote">Đầu nối thể hiện quan hệ một/nhiều và bắt buộc/tùy chọn. Các khóa AUTH thuộc dịch vụ xác thực được ghi trong chi tiết bảng.</p>`;
    const get=id=>container.querySelector('#'+id);
    svg=get('erd-svg');
    function transform(){scene?.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);get('diagram-reset').textContent=Math.round(camera.scale*100)+'%';}
    function focus(name){
      const node=m.nodes.find(n=>n.name===name);if(!node)return;
      camera.scale=Math.max(.65,Math.min(1,camera.scale));
      camera.x=size.width/2-(node.x+W/2)*camera.scale;camera.y=Math.max(25,(size.height-node.height*camera.scale)/2)-node.y*camera.scale;transform();
    }
    function measure(){size={width:svg.clientWidth||1100,height:svg.clientHeight||660};svg.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);}
    function draw(){
      m=model(data,scope,selected,common);svg.innerHTML=svgMarkup(m,selected);scene=svg.querySelector('#erd-scene');measure();
      get('erd-status').textContent=`${m.nodes.length}/${data.tables.length} bảng · ${m.edges.length} quan hệ · Đang chọn: ${selected}`;
      get('erd-table-select').value=selected;get('erd-scope').value=scope;focus(selected);
    }
    function setTable(name){
      if(!data.tables.some(t=>t.name===name))return;selected=name;
      if(!m.nodes.some(n=>n.name===name))scope='neighbors';draw();
    }
    function point(event){const r=svg.getBoundingClientRect();return {x:(event.clientX-r.left)*size.width/(r.width||size.width),y:(event.clientY-r.top)*size.height/(r.height||size.height)};}
    function zoom(scale,p={x:size.width/2,y:size.height/2}){
      const next=Math.max(.15,Math.min(2.4,scale)),ratio=next/camera.scale;
      camera.x=p.x-(p.x-camera.x)*ratio;camera.y=p.y-(p.y-camera.y)*ratio;camera.scale=next;transform();
    }
    function fit(){camera.scale=Math.min((size.width-60)/m.width,(size.height-60)/m.height,1);camera.x=(size.width-m.width*camera.scale)/2;camera.y=(size.height-m.height*camera.scale)/2;transform();}
    svg.onpointerdown=event=>{if(event.button!==0)return;drag={...point(event),x0:camera.x,y0:camera.y,id:event.pointerId,table:event.target.closest('[data-erd-table]')?.dataset.erdTable};moved=false;svg.setPointerCapture(event.pointerId);svg.classList.add('panning');};
    svg.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;const p=point(event),dx=p.x-drag.x,dy=p.y-drag.y;if(Math.abs(dx)+Math.abs(dy)>4)moved=true;camera.x=drag.x0+dx;camera.y=drag.y0+dy;transform();};
    const end=event=>{const table=drag?.table,clicked=drag&&!moved&&event.type!=='pointercancel';drag=null;svg.classList.remove('panning');if(clicked&&table){onSelect(table);moved=true;}};svg.onpointerup=end;svg.onpointercancel=end;
    const wheel=event=>{event.preventDefault();zoom(camera.scale*Math.exp(-Math.max(-150,Math.min(150,event.deltaY))*.0025),point(event));};
    svg.addEventListener('wheel',wheel,{passive:false});
    container.onclick=event=>{
      const table=event.target.closest('[data-erd-table]');if(table&&!moved){onSelect(table.dataset.erdTable);return;}moved=false;
      const button=event.target.closest('button');if(!button||!container.contains(button))return;
      if(button.id==='diagram-in')zoom(camera.scale*1.2);else if(button.id==='diagram-out')zoom(camera.scale/1.2);
      else if(button.id==='diagram-reset'){camera.scale=1;focus(selected);}else if(button.id==='erd-fit')fit();
      else if(button.id==='erd-detail')onDetail();else if(button.id==='erd-expand'){const expanded=button.getAttribute('aria-pressed')!=='true';container.classList.toggle('erd-expanded',expanded);button.setAttribute('aria-pressed',String(expanded));button.textContent=expanded?'Thu gọn':'Mở rộng';measure();focus(selected);}
    };
    container.onchange=event=>{if(event.target.id==='erd-table-select')onSelect(event.target.value);else if(event.target.id==='erd-scope'){scope=event.target.value;const next=model(data,scope,selected,common);if(!next.nodes.some(n=>n.name===selected))selected=next.nodes[0].name;draw();onSelect(selected);}else if(event.target.id==='erd-common'){common=event.target.checked;draw();}};
    container.onkeydown=event=>{
      if(event.key==='Escape'&&get('erd-expand').getAttribute('aria-pressed')==='true'){container.classList.remove('erd-expanded');get('erd-expand').setAttribute('aria-pressed','false');get('erd-expand').textContent='Mở rộng';measure();focus(selected);return;}
      const table=event.target.closest('[data-erd-table]');if(table&&(event.key==='Enter'||event.key===' ')){event.preventDefault();onSelect(table.dataset.erdTable);return;}
      if(event.target!==svg)return;
      const shifts={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]};
      if(shifts[event.key]){event.preventDefault();camera.x+=shifts[event.key][0];camera.y+=shifts[event.key][1];transform();}
      else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(camera.scale*1.2);}else if(event.key==='-'){event.preventDefault();zoom(camera.scale/1.2);}else if(event.key==='0'){event.preventDefault();fit();}
    };
    draw();
    if(window.ResizeObserver){resize=new window.ResizeObserver(()=>{measure();transform();});resize.observe(svg);}
    return {setTable,destroy(){resize?.disconnect();svg.removeEventListener('wheel',wheel);svg.onpointerdown=svg.onpointermove=svg.onpointerup=svg.onpointercancel=null;container.onclick=container.onchange=container.onkeydown=null;}};
  }
  window.DatabaseGraph=Object.freeze({neighborhood,model,svgMarkup,mount});
})();
