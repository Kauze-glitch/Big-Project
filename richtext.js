'use strict';
(() => {
  const A=window.GocViet;
  A.normalizeTyping=(area,event)=>{
    const point=area.dataset.fontPoint;if(!point)return;
    area.querySelectorAll('font[size="7"]').forEach(font=>{font.removeAttribute('size');font.style.fontSize=point+'pt';});
    if(!event?.data||event.isComposing||!['insertText','insertCompositionText'].includes(event.inputType))return;
    const sel=getSelection(),node=sel.anchorNode,end=sel.anchorOffset;
    if(!sel.isCollapsed||node?.nodeType!==3||!area.contains(node)||end<event.data.length)return;
    if(Math.abs(parseFloat(getComputedStyle(node.parentElement).fontSize)-Number(point)*4/3)<.1)return;
    const range=document.createRange();range.setStart(node,end-event.data.length);range.setEnd(node,end);
    const span=document.createElement('span');span.style.fontSize=point+'pt';span.append(range.extractContents());range.insertNode(span);
    range.selectNodeContents(span);range.collapse(false);sel.removeAllRanges();sel.addRange(range);
  };
  A.initRichText=getContext=>{
    const toolbar=document.querySelector('.format-toolbar');
    toolbar.innerHTML=`
      <div class="ribbon-group ribbon-type">
        <label>Phông chữ<select id="font-family" aria-label="Phông chữ">${A.fontGroups.map(group=>`<optgroup label="${group.label}">${group.fonts.map(name=>`<option value="${name}">${name}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label>Cỡ chữ (pt)<select id="font-size" aria-label="Cỡ chữ">${[8,10,11,12,14,16,18,20,24,28,32,36,48,60,72].map(n=>`<option value="${n}" ${n===12?'selected':''}>${n}</option>`).join('')}</select></label>
        <label>Kiểu đoạn<select id="text-style" aria-label="Kiểu đoạn"><option value="p">Văn bản thường</option><option value="h2">Tiêu đề lớn</option><option value="h3">Tiêu đề nhỏ</option><option value="blockquote">Trích dẫn</option></select></label>
      </div>
      <div class="ribbon-group ribbon-color">
        <label>Màu chữ<select id="text-color" aria-label="Màu chữ"><option value="#24372b">Mặc định</option><option value="#111111">Đen</option><option value="#365c32">Xanh rêu</option><option value="#1d4ed8">Xanh dương</option><option value="#b91c1c">Đỏ</option><option value="#7e22ce">Tím</option><option value="#a4510c">Cam đất</option></select></label>
        <label class="custom-color">Màu khác<input id="custom-text-color" type="color" value="#24372b" aria-label="Chọn màu chữ tùy ý"></label>
        <label>Tô nền<select id="highlight-color" aria-label="Tô nền chữ"><option value="transparent">Không màu</option><option value="#fff1a8">Vàng nhạt</option><option value="#d9edc7">Xanh nhạt</option><option value="#dbeafe">Xanh trời</option><option value="#fce7f3">Hồng nhạt</option><option value="#ede9fe">Tím nhạt</option></select></label>
      </div>
      <div class="ribbon-group ribbon-buttons">
        <button type="button" data-command="bold" aria-label="In đậm" title="In đậm (Ctrl+B)" aria-pressed="false"><b>B</b></button>
        <button type="button" data-command="italic" aria-label="In nghiêng" title="In nghiêng (Ctrl+I)" aria-pressed="false"><i>I</i></button>
        <button type="button" data-command="underline" aria-label="Gạch chân" title="Gạch chân (Ctrl+U)" aria-pressed="false"><u>U</u></button>
        <button type="button" data-command="strikeThrough" aria-label="Gạch ngang" title="Gạch ngang" aria-pressed="false"><s>S</s></button>
        <button type="button" data-command="superscript" aria-label="Chỉ số trên" title="Chỉ số trên" aria-pressed="false">x²</button>
        <button type="button" data-command="subscript" aria-label="Chỉ số dưới" title="Chỉ số dưới" aria-pressed="false">x₂</button>
      </div>
      <div class="ribbon-group ribbon-paragraph">
        <label>Căn lề<select id="text-align" aria-label="Căn lề"><option value="justifyLeft">Trái</option><option value="justifyCenter">Giữa</option><option value="justifyRight">Phải</option><option value="justifyFull">Đều hai bên</option></select></label>
        <label>Giãn dòng<select id="line-spacing" aria-label="Giãn dòng"><option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="1.75" selected>1.75</option><option value="2">2.0</option><option value="2.5">2.5</option></select></label>
        <button type="button" data-command="insertUnorderedList" title="Danh sách dấu chấm" aria-label="Danh sách dấu chấm">• Danh sách</button>
        <button type="button" data-command="insertOrderedList" title="Danh sách đánh số" aria-label="Danh sách đánh số">1. Danh sách</button>
        <button type="button" data-command="outdent" aria-label="Giảm thụt lề" title="Giảm thụt lề">⇤</button>
        <button type="button" data-command="indent" aria-label="Tăng thụt lề" title="Tăng thụt lề">⇥</button>
      </div>
      <div class="ribbon-group ribbon-history">
        <button type="button" data-command="undo" title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác văn bản">↶ Hoàn tác</button>
        <button type="button" data-command="redo" title="Làm lại (Ctrl+Y)" aria-label="Làm lại văn bản">↷ Làm lại</button>
        <button type="button" data-command="removeFormat" aria-label="Xóa định dạng chữ">Tx Xóa định dạng</button>
      </div>`;
    const compose=toolbar.closest('.compose-toolbar'),quick=A.el('div','ribbon-quick'),more=A.el('div','ribbon-more');
    more.id='ribbon-more';more.hidden=true;
    const sizeLabel=toolbar.querySelector('#font-size').closest('label');sizeLabel.classList.add('quick-size');
    quick.append(sizeLabel);
    for(const command of ['bold','italic','underline'])quick.append(toolbar.querySelector('[data-command="'+command+'"]'));
    const toggle=A.el('button','ribbon-toggle','Định dạng thêm ▾');toggle.type='button';toggle.setAttribute('aria-controls',more.id);toggle.setAttribute('aria-expanded','false');
    quick.append(toggle);while(toolbar.firstChild)more.append(toolbar.firstChild);toolbar.append(quick,more);
    const expand=open=>{more.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'Thu gọn ▴':'Định dạng thêm ▾';};
    toggle.addEventListener('mousedown',event=>event.preventDefault());toggle.onclick=()=>expand(more.hidden);
    toolbar.addEventListener('keydown',event=>{if(event.key==='Escape'&&!more.hidden){event.preventDefault();expand(false);toggle.focus();}});
    document.addEventListener('pointerdown',event=>{if(!more.hidden&&!compose.contains(event.target))expand(false);});
    // Insert actions stay with the document instead of occupying sticky writing space.
    const insert=compose.querySelector('.insert-toolbar');if(insert)compose.after(insert);
    const topbar=document.querySelector('.topbar');
    if(topbar)new ResizeObserver(()=>compose.style.setProperty('--editor-top',topbar.getBoundingClientRect().height+'px')).observe(topbar);
    const offset=(area,node,position)=>{const r=document.createRange();r.selectNodeContents(area);r.setEnd(node,position);return r.toString().length;};
    function bookmark(area,range){return [offset(area,range.startContainer,range.startOffset),offset(area,range.endContainer,range.endOffset)];}
    function restore(area,marks){
      const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT),range=document.createRange();let node,total=0,start=false,end=false,last=null;
      while(node=walker.nextNode()){last=node;const next=total+node.length;if(!start&&marks[0]<=next){range.setStart(node,Math.max(0,marks[0]-total));start=true;}if(!end&&marks[1]<=next){range.setEnd(node,Math.max(0,marks[1]-total));end=true;break;}total=next;}
      if(!start){range.selectNodeContents(area);range.collapse(false);}else if(!end){range.setEnd(last,last.length);}
      const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
    }
    function apply(command,value){
      const ctx=getContext();if(!ctx){A.toast('Đặt con trỏ hoặc bôi đen chữ trong khối văn bản trước.');return;}
      const {area,range}=ctx;area.focus();const sel=getSelection();sel.removeAllRanges();sel.addRange(range);const marks=bookmark(area,range);
      if(command==='pointSize'){
        const size=Math.max(8,Math.min(72,Number(value)||12));
        if(range.collapsed){area.dataset.fontPoint=size;document.execCommand('styleWithCSS',false,false);document.execCommand('fontSize',false,'7');}
        else{
          delete area.dataset.fontPoint;
          const holder=document.createElement('div');holder.append(range.cloneContents());
          const walker=document.createTreeWalker(holder,NodeFilter.SHOW_TEXT),texts=[];let n;while(n=walker.nextNode())texts.push(n);
          texts.forEach(text=>{const span=document.createElement('span');span.style.fontSize=size+'pt';text.replaceWith(span);span.append(text);});
          document.execCommand('insertHTML',false,holder.innerHTML);restore(area,marks);
        }
      }else if(command==='lineHeight'){
        // Reinsert one sanitized block snapshot so native undo also tracks spacing.
        const clone=area.cloneNode(true),blocks=[...clone.querySelectorAll('p,div,h1,h2,h3,h4,li,blockquote')];
        const originals=[...area.querySelectorAll('p,div,h1,h2,h3,h4,li,blockquote')];
        let changed=false;
        originals.forEach((node,i)=>{if(range.intersectsNode(node)&&!node.querySelector('p,div,h1,h2,h3,h4,li,blockquote')){blocks[i].style.lineHeight=value;changed=true;}});
        if(!changed){const p=document.createElement('p');p.style.lineHeight=value;while(clone.firstChild)p.append(clone.firstChild);clone.append(p);}
        const all=document.createRange();all.selectNodeContents(area);sel.removeAllRanges();sel.addRange(all);document.execCommand('insertHTML',false,A.sanitize(clone.innerHTML));restore(area,marks);
      }else{
        if(command!=='undo'&&command!=='redo')document.execCommand('styleWithCSS',false,true);
        if(command==='removeFormat'){delete area.dataset.fontPoint;}
        document.execCommand(command,false,value??null);
      }
      A.normalizeTyping(area);ctx.commit();sync();
    }
    toolbar.querySelectorAll('button[data-command]').forEach(button=>{button.addEventListener('mousedown',event=>event.preventDefault());button.onclick=()=>apply(button.dataset.command);});
    const commands={'font-family':'fontName','font-size':'pointSize','text-style':'formatBlock','text-color':'foreColor','custom-text-color':'foreColor','highlight-color':'hiliteColor','text-align':'align','line-spacing':'lineHeight'};
    Object.entries(commands).forEach(([id,command])=>document.getElementById(id).addEventListener('change',event=>apply(command==='align'?event.target.value:command,event.target.value)));
    function sync(){
      const sel=getSelection(),node=sel.anchorNode,el=node?.nodeType===1?node:node?.parentElement,area=el?.closest('.writing-area');
      if(!area)return;
      toolbar.querySelectorAll('[aria-pressed]').forEach(button=>button.setAttribute('aria-pressed',String(document.queryCommandState(button.dataset.command))));
      if(document.activeElement?.closest('.format-toolbar'))return;
      const style=getComputedStyle(el),point=Math.round(parseFloat(style.fontSize)*.75*100)/100;
      const size=document.getElementById('font-size');let option=size.querySelector('[data-current]');option?.remove();
      if(![...size.options].some(o=>Number(o.value)===point)){option=new Option(String(point),String(point));option.dataset.current='true';size.add(option);}size.value=String(point);
      const face=style.fontFamily.split(',')[0].replace(/['"]/g,'').trim(),font=document.getElementById('font-family');font.value=[...font.options].find(o=>o.value.toLowerCase()===face.toLowerCase())?.value||'';
      const hex=value=>{const match=value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);return match?'#'+match.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):value;};
      const fg=hex(style.color),bg=style.backgroundColor==='rgba(0, 0, 0, 0)'?'transparent':hex(style.backgroundColor);
      document.getElementById('text-color').value=fg;document.getElementById('custom-text-color').value=/^#[a-f0-9]{6}$/i.test(fg)?fg:'#24372b';document.getElementById('highlight-color').value=bg;
      const paragraph=el.closest('p,h2,h3,blockquote,li')||area;document.getElementById('text-style').value=['h2','h3','blockquote'].includes(paragraph.tagName.toLowerCase())?paragraph.tagName.toLowerCase():'p';
      const line=Number((parseFloat(style.lineHeight)/parseFloat(style.fontSize)).toFixed(2)),spacing=document.getElementById('line-spacing');spacing.querySelector('[data-current]')?.remove();if(Number.isFinite(line)&&![...spacing.options].some(o=>Number(o.value)===line)){const item=new Option(String(line),String(line));item.dataset.current='true';spacing.add(item);}spacing.value=String(line);
      const align={left:'justifyLeft',start:'justifyLeft',center:'justifyCenter',right:'justifyRight',end:'justifyRight',justify:'justifyFull'};document.getElementById('text-align').value=align[style.textAlign]||'justifyLeft';
    }
    document.addEventListener('selectionchange',sync);
  };
})();
