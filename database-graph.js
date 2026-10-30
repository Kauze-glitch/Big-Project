'use strict';
(() => {
  const escape = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function neighborhood(data, name) {
    const parents = new Map(), children = new Map(), self = [];
    for (const ref of data.refs) {
      if (ref.from === name && ref.to === name) { self.push(ref); continue; }
      const collection = ref.from === name ? parents : ref.to === name ? children : null;
      if (!collection) continue;
      const other = ref.from === name ? ref.to : ref.from;
      if (!collection.has(other)) collection.set(other, {name:other,refs:[]});
      collection.get(other).refs.push(ref);
    }
    return {parents:[...parents.values()],children:[...children.values()],self};
  }
  function mount(container, data, onSelect, onDetail) {
    let selected = 'CONG_DAN', parentPage = 0, childPage = 0, scale = 1;
    const pageSize = 4, byName = new Map(data.tables.map(t=>[t.name,t]));
    const refLabel = ref => `${ref.field} · ${ref.required ? 'bắt buộc' : 'tùy chọn'}${ref.unique ? ' · duy nhất' : ''}`;
    function card(group) {
      const table = byName.get(group.name);
      return `<button class="focus-table" data-graph-table="${table.name}"><span class="focus-table-name">${escape(table.title)}</span><code>${table.name}</code><span class="focus-keys">${group.refs.map(ref=>`<span>${escape(refLabel(ref))}</span>`).join('')}</span></button>`;
    }
    function column(rows, page, side, title, empty) {
      const pages = Math.max(1,Math.ceil(rows.length/pageSize));
      const shown = rows.slice(page*pageSize,(page+1)*pageSize);
      return `<section class="focus-column focus-${side} ${rows.length ? 'has-tables' : ''}"><h4>${title}<span>${rows.length} bảng</span></h4><div class="focus-neighbors">${shown.length ? shown.map(card).join('') : `<div class="focus-empty">${empty}</div>`}</div>${pages > 1 ? `<div class="focus-pagination"><button data-graph-page="${side}:-1" aria-label="Trang ${side==='parents'?'bảng được tham chiếu':'bảng tham chiếu'} trước" ${page===0?'disabled':''}>←</button><span>${page*pageSize+1}–${Math.min(rows.length,(page+1)*pageSize)} / ${rows.length}</span><button data-graph-page="${side}:1" aria-label="Trang ${side==='parents'?'bảng được tham chiếu':'bảng tham chiếu'} sau" ${page===pages-1?'disabled':''}>→</button></div>` : ''}</section>`;
    }
    function render() {
      const table=byName.get(selected), n=neighborhood(data,selected);
      const foreign=table.fields.filter(f=>f[2].includes('FK '));
      parentPage=Math.min(parentPage,Math.max(0,Math.ceil(n.parents.length/pageSize)-1));
      childPage=Math.min(childPage,Math.max(0,Math.ceil(n.children.length/pageSize)-1));
      container.innerHTML=`<div class="focus-controls"><label for="focus-table-select">Chọn bảng để xem quan hệ<select id="focus-table-select">${data.groups.map((g,i)=>`<optgroup label="${escape(g)}">${data.tables.filter(t=>t.group===i).map(t=>`<option value="${t.name}" ${t.name===selected?'selected':''}>${escape(t.title)} · ${t.name}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="focus-zoom" aria-label="Cỡ hiển thị sơ đồ"><button id="diagram-out" aria-label="Thu nhỏ sơ đồ">−</button><button id="diagram-reset">${Math.round(scale*100)}%</button><button id="diagram-in" aria-label="Phóng to sơ đồ">+</button></div></div><div class="focus-heading"><div><p>ĐANG KHÁM PHÁ</p><h3>Quan hệ của ${escape(table.title)}</h3></div><span>${n.parents.length+n.children.length} bảng liên quan</span></div><p class="focus-legend">Mũi tên đi từ bảng chứa khóa ngoại đến bảng được tham chiếu. Chọn bảng bất kỳ để tiếp tục khám phá.</p><div class="focus-scroll"><div class="focus-stage" style="zoom:${scale}">${column(n.parents,parentPage,'parents','Bảng này tham chiếu đến','Bảng này không có khóa ngoại đến bảng khác trong sơ đồ.')}<section class="focus-current ${n.parents.length ? 'has-parents' : ''} ${n.children.length ? 'has-children' : ''}"><p class="focus-selected-label">BẢNG ĐANG CHỌN</p><h4>${escape(table.title)}</h4><code>${table.name}</code><div class="focus-primary"><span>PK</span><b>id</b><small>uuid</small></div>${foreign.slice(0,3).map(f=>`<div class="focus-foreign"><span>FK</span><code>${escape(f[0])}</code></div>`).join('')}<p class="focus-count">${table.fields.length} trường dữ liệu riêng</p><button data-graph-detail="true">Xem chi tiết các trường ↓</button>${n.self.length ? `<p class="focus-self">↻ Liên kết trong chính bảng: ${n.self.map(r=>escape(r.field)).join(', ')}</p>` : ''}</section>${column(n.children,childPage,'children','Các bảng tham chiếu đến đây','Chưa có bảng khác tham chiếu đến bảng này.')}</div></div><details class="focus-directory"><summary>Chọn nhanh trong toàn bộ ${data.tables.length} bảng</summary><div class="focus-directory-grid">${data.groups.map((g,i)=>`<section><h4>${escape(g)}</h4>${data.tables.filter(t=>t.group===i).map(t=>`<button data-graph-table="${t.name}" ${t.name===selected?'aria-current="true"':''}>${escape(t.title)}<code>${t.name}</code></button>`).join('')}</section>`).join('')}</div></details>`;
    }
    function setTable(name) {
      if(!byName.has(name)) return;
      selected=name;parentPage=childPage=0;render();
    }
    container.onclick = event => {
      const button=event.target.closest('button');
      if(!button || !container.contains(button))return;
      if(button.dataset.graphTable){onSelect(button.dataset.graphTable);return;}
      if(button.dataset.graphDetail){onDetail();return;}
      if(button.dataset.graphPage){const [side,delta]=button.dataset.graphPage.split(':');if(side==='parents')parentPage+=Number(delta);else childPage+=Number(delta);render();return;}
      if(['diagram-in','diagram-out','diagram-reset'].includes(button.id)){
        scale=button.id==='diagram-reset'?1:Math.max(.8,Math.min(1.5,Math.round((scale+(button.id==='diagram-in' ? 0.1 : -0.1))*10)/10));render();
      }
    };
    container.onchange = event => { if(event.target.id==='focus-table-select')onSelect(event.target.value); };
    render();
    return {setTable,destroy(){container.onclick=null;container.onchange=null;}};
  }
  window.DatabaseGraph=Object.freeze({neighborhood,mount});
})();
