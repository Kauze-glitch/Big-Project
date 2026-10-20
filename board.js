'use strict';
(() => {
  const A=window.GocViet,clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  class BoardEditor {
    constructor(host,board,onChange,onAddImage){this.host=host;this.board=board;this.changed=onChange;this.addImage=onAddImage;this.selected=null;this.connecting=false;this.source=null;this.build();}
    button(text,action,label){const button=A.el('button','btn btn-quiet',text);button.type='button';if(label)button.setAttribute('aria-label',label);button.onclick=action;return button;}
    build(){
      this.host.replaceChildren();const tools=A.el('div','board-toolbar');
      this.connectBtn=this.button('↗ Nối hộp',()=>{if(this.board.nodes.length<2)return A.toast('Thêm ít nhất 2 hộp để nối.');this.connecting=!this.connecting;this.source=null;this.sync();});
      this.deleteBtn=this.button('Xóa đối tượng',()=>this.remove());
      tools.append(this.button('＋ Hộp ý tưởng',()=>this.addNode()),this.button('▧ Thêm ảnh',()=>this.addImage()),this.connectBtn,this.deleteBtn);
      const sizeLabel=A.el('label','board-size','Chiều cao bảng');this.heightInput=A.el('select');this.heightInput.setAttribute('aria-label','Chiều cao bảng');for(const h of [280,400,540,700,900,1200,1600]){const opt=A.el('option','',h+' px');opt.value=h;this.heightInput.append(opt);}this.heightInput.value=this.board.height;
      this.heightInput.onchange=()=>{this.board.height=Number(this.heightInput.value);for(const n of this.board.nodes)n.y=clamp(n.y,0,this.board.height-80);for(const img of this.board.images){if(img.h>this.board.height){const ratio=this.board.height/img.h;img.w*=ratio;img.h*=ratio;}img.y=clamp(img.y,0,this.board.height-img.h);}this.render();this.changed();};sizeLabel.append(this.heightInput);tools.append(sizeLabel);this.host.append(tools);
      this.hint=A.el('p','board-hint');this.host.append(this.hint);this.scroll=A.el('div','canvas-scroll');this.canvas=A.el('div','diagram-canvas board-canvas');this.canvas.setAttribute('aria-label','Bảng bố cục tự do');this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.svg.id='edit-edges-'+A.uid();this.svg.classList.add('diagram-edges');this.items=A.el('div','board-items');this.canvas.append(this.svg,this.items);this.scroll.append(this.canvas);this.host.append(this.scroll);
      this.props=A.el('div','board-properties');this.host.append(this.props);
      this.canvas.addEventListener('click',event=>{if(event.target===this.canvas||event.target===this.items){this.selected=null;this.connecting=false;this.source=null;this.sync();}});
      this.render();
    }
    addNode(){if(this.board.nodes.length>=80)return A.toast('Mỗi sơ đồ hỗ trợ tối đa 80 hộp.');const n=this.board.nodes.length,node={id:A.uid(),text:'Ý tưởng '+(n+1),x:40+(n%4)*220,y:50+(Math.floor(n/4)*130)%(this.board.height-100),color:'sage'};this.board.nodes.push(node);this.selected={type:'node',id:node.id};this.render();this.changed();this.props.querySelector('input')?.focus();this.props.querySelector('input')?.select();}
    get selectedItem(){return this.selected?(this.selected.type==='node'?this.board.nodes:this.board.images).find(i=>i.id===this.selected.id):null;}
    pick(type,id){this.selected={type,id};if(this.connecting&&type==='node'){if(!this.source)this.source=id;else if(this.source!==id){if(!this.board.edges.some(e=>e.from===this.source&&e.to===id))this.board.edges.push({from:this.source,to:id});this.source=null;this.connecting=false;this.changed();this.edges();}}this.sync();}
    remove(){if(!this.selected)return;const {id,type}=this.selected;if(type==='node'){this.board.nodes=this.board.nodes.filter(n=>n.id!==id);this.board.edges=this.board.edges.filter(e=>e.from!==id&&e.to!==id);}else this.board.images=this.board.images.filter(n=>n.id!==id);this.selected=null;this.source=null;this.render();this.changed();}
    edges(){A.drawEdges(this.svg,this.board);}
    sync(){
      this.deleteBtn.disabled=!this.selected;this.connectBtn.setAttribute('aria-pressed',String(this.connecting));this.hint.textContent=this.connecting?(this.source?'Chọn hộp đích để nối.':'Chọn hộp đầu rồi chọn hộp đích.'):'Kéo ảnh hoặc hộp đến vị trí bất kỳ · Dùng tay nắm góc ảnh để đổi kích thước · Phím mũi tên để di chuyển';
      for(const el of this.items.children){el.classList.toggle('selected',el.dataset.id===this.selected?.id);el.classList.toggle('connect-source',el.dataset.id===this.source);}
      this.properties();
    }
    render(){
      this.canvas.style.height=this.board.height+'px';this.svg.style.height=this.board.height+'px';this.svg.setAttribute('viewBox',`0 0 960 ${this.board.height}`);this.items.replaceChildren();this.edges();
      for(const image of this.board.images){const el=A.el('div','board-image');el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label','Ảnh: '+(image.alt||'Minh họa'));el.dataset.id=image.id;const img=A.el('img');img.src=image.src;img.alt=image.alt;img.draggable=false;const handle=A.el('button','image-resize','↘');handle.type='button';handle.setAttribute('aria-label','Đổi kích thước ảnh');el.append(img,handle);this.position(el,image);this.bindMove(el,image,'image');this.bindResize(handle,el,image);this.items.append(el);}
      for(const node of this.board.nodes){const el=A.nodeElement(node,true);this.bindMove(el,node,'node');this.items.append(el);}
      if(!this.board.nodes.length&&!this.board.images.length){const empty=A.el('div','diagram-empty');empty.append(A.el('span','','＋'),A.el('h3','','Một bảng trống, nhiều khả năng.'),A.el('p','','Thêm hộp ý tưởng hoặc ảnh để bắt đầu.'));this.items.append(empty);}
      this.sync();
    }
    position(el,item){Object.assign(el.style,{left:item.x+'px',top:item.y+'px'});if(item.w)Object.assign(el.style,{width:item.w+'px',height:item.h+'px'});}
    bindMove(el,item,type){
      let moved=false;
      el.addEventListener('click',event=>{if(event.target.closest('.image-resize'))return;if(!moved)this.pick(type,item.id);moved=false;});
      el.addEventListener('pointerdown',event=>{
        if(event.button!==0||this.connecting||event.target.closest('.image-resize'))return;
        event.stopPropagation();this.selected={type,id:item.id};this.sync();moved=false;el.setPointerCapture(event.pointerId);
        const sx=event.clientX,sy=event.clientY,x=item.x,y=item.y;
        const move=e=>{const dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;if(!moved)return;item.x=clamp(x+dx,0,960-(item.w||176));item.y=clamp(y+dy,0,this.board.height-(item.h||80));this.position(el,item);this.edges();};
        const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);if(moved){this.changed();this.properties();}};
        el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
      });
      el.addEventListener('keydown',event=>{if(event.target!==el)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();this.pick(type,item.id);return;}const movement={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];if(!movement)return;event.preventDefault();this.selected={type,id:item.id};item.x=clamp(item.x+movement[0],0,960-(item.w||176));item.y=clamp(item.y+movement[1],0,this.board.height-(item.h||80));this.position(el,item);this.edges();this.sync();this.changed();});
    }
    bindResize(handle,el,image){
      handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);this.selected={type:'image',id:image.id};this.sync();const start=event.clientX,width=image.w,ratio=image.h/image.w;
        const move=e=>{const max=Math.min(960-image.x,(this.board.height-image.y)/ratio);image.w=clamp(width+e.clientX-start,Math.min(60,max),max);image.h=image.w*ratio;this.position(el,image);};
        const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);this.changed();this.properties();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
      });
    }
    properties(){
      this.props.replaceChildren();const item=this.selectedItem;this.props.hidden=!item;if(!item)return;
      const field=(label,type,value,oninput)=>{const wrap=A.el('label','',label),input=A.el('input');input.type=type;input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>oninput(input);wrap.append(input);this.props.append(wrap);return input;};
      if(this.selected.type==='node'){
        const input=field('Nội dung hộp','text',item.text,el=>{item.text=el.value;const node=[...this.items.children].find(n=>n.dataset.id===item.id);node.textContent=item.text||'Ý tưởng';node.setAttribute('aria-label',item.text||'Hộp ý tưởng');this.changed();});input.maxLength=160;
        const label=A.el('label','','Màu hộp'),select=A.el('select');select.setAttribute('aria-label','Màu hộp');for(const [value,text] of [['sage','Xanh dịu'],['cream','Kem ấm'],['rose','Hồng đất']]){const opt=A.el('option','',text);opt.value=value;select.append(opt);}select.value=item.color;select.onchange=()=>{item.color=select.value;this.render();this.changed();};label.append(select);this.props.append(label,this.button('Gỡ đường nối',()=>{this.board.edges=this.board.edges.filter(e=>e.from!==item.id&&e.to!==item.id);this.edges();this.changed();}));
      }else{
        const input=field('Mô tả ảnh','text',item.alt,el=>{item.alt=el.value;const image=[...this.items.children].find(n=>n.dataset.id===item.id);image.querySelector('img').alt=item.alt;image.setAttribute('aria-label','Ảnh: '+item.alt);this.changed();});input.maxLength=180;
        const width=field('Chiều rộng ảnh','range',Math.round(item.w),el=>{const ratio=item.h/item.w;item.w=clamp(Number(el.value),60,Math.min(960-item.x,(this.board.height-item.y)/ratio));item.h=item.w*ratio;this.position([...this.items.children].find(n=>n.dataset.id===item.id),item);this.changed();});width.min=60;width.max=Math.min(960-item.x,(this.board.height-item.y)/(item.h/item.w));width.step=1;width.value=Math.round(item.w);
        this.props.append(this.button('Căn trái',()=>{item.x=0;this.render();this.changed();}),this.button('Căn giữa',()=>{item.x=(960-item.w)/2;this.render();this.changed();}),this.button('Căn phải',()=>{item.x=960-item.w;this.render();this.changed();}));
      }
    }
  }
  A.BoardEditor=BoardEditor;
})();
