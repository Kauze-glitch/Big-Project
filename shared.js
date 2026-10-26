'use strict';
(() => {
  const URL = 'https://grhdawkxnrkgkahegnnd.supabase.co';
  const KEY = 'sb_publishable_on_xEc5Um_pRV-ZZhPIgLw_7vSL6iHK';
  const $ = id => document.getElementById(id);
  const db = window.supabase ? window.supabase.createClient(URL, KEY) : null;
  const app = window.GocViet = { db, user: null, sections: [], $, ready: false };
  app.askAssistant = async (body,signal) => {
    if(!db)throw new Error('Chưa kết nối được dịch vụ đăng nhập.');
    const {data,error}=await db.auth.getSession();
    if(error||!data?.session?.access_token)throw new Error('Hãy đăng nhập lại để dùng trợ lý.');
    const response=await fetch(URL+'/functions/v1/gemini-assistant',{
      method:'POST',signal,headers:{'Content-Type':'application/json',apikey:KEY,Authorization:'Bearer '+data.session.access_token},
      body:JSON.stringify(body)
    });
    let result;try{result=await response.json();}catch{throw new Error('Trợ lý chưa sẵn sàng. Hãy thử lại sau.');}
    if(!response.ok)throw new Error(result.error||'Không kết nối được trợ lý. Hãy đăng nhập lại hoặc thử sau.');
    if(typeof result.answer!=='string')throw new Error('Phản hồi không hợp lệ. Hãy thử lại.');
    return result;
  };
  app.roster = [
    {key:'hieu',name:'Nguyễn Minh Hiếu',role:'Thành viên',task:''},
    {key:'tien-hieu',name:'Nguyễn Tiến Minh Hiếu',role:'Trưởng nhóm',task:''},
    {key:'truong',name:'Trần Xuân Trường',role:'Thành viên',task:''}
  ];
  app.projectTitle='Phân tích thiết kế hệ thống quản lý hồ sơ công dân';
  app.uid=()=>crypto.randomUUID();
  // One catalog keeps the editor choices and saved-content sanitizer in sync.
  app.fontGroups=[
    {label:'Trang trọng · có chân',fonts:['Lora','Noto Serif','Merriweather','Playfair Display','Roboto Slab']},
    {label:'Hiện đại · dễ đọc',fonts:['Be Vietnam Pro','Roboto','Open Sans','Noto Sans','Montserrat','Nunito','Quicksand']},
    {label:'Viết tay · trang trí',fonts:['Dancing Script','Pacifico']},
    {label:'Phông có sẵn trên máy',fonts:['Arial','Times New Roman','Calibri','Georgia','Verdana','Tahoma','Courier New','Trebuchet MS']}
  ];
  app.isMember=()=>!!app.user && app.sections.some(s=>s.owner_id===app.user.id);
  app.progressLabels={drafting:'Đang viết',review:'Chờ góp ý',complete:'Hoàn thành'};
  app.progressValue=value=>Object.hasOwn(app.progressLabels,value)?value:'drafting';
  app.progressBadge=section=>{const value=app.progressValue(section?.progress_status),badge=app.el('span','section-status',app.progressLabels[value]);badge.dataset.status=value;return badge;};
  app.canEdit=section=>!!app.user && section?.owner_id===app.user.id;
  app.el=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  $('auth-dialogs').innerHTML='<dialog id="login-dialog" class="dialog"><form id="login-form"><div class="eyebrow">KHÔNG GIAN THÀNH VIÊN</div><h2>Chào bạn trở lại.</h2><p class="muted">Đăng nhập để chỉnh sửa hồ sơ và nội dung của bạn.</p><label for="login-email">Email</label><input id="login-email" type="email" autocomplete="username" required><label for="login-password">Mật khẩu</label><input id="login-password" type="password" autocomplete="current-password" required><p id="login-error" class="error" role="alert"></p><div class="dialog-actions"><button id="login-cancel" type="button" class="btn btn-quiet">Để sau</button><button id="login-submit" class="btn" type="submit">Đăng nhập →</button></div></form></dialog>';
  let timer;
  app.toast = message => {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  };
  // Preserve only text formatting; never copy arbitrary CSS, URLs, or event handlers.
  app.sanitize = html => {
    const source=new DOMParser().parseFromString(String(html),'text/html'),target=document.createElement('div');
    const allowed=new Set(['P','DIV','SPAN','BR','STRONG','B','EM','I','U','S','STRIKE','SUB','SUP','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','HR','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','CAPTION']);
    const fonts=new Set([...app.fontGroups.flatMap(group=>group.fonts.map(name=>name.toLowerCase())),'serif','sans-serif','monospace']);
    const color=value=>/^(#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|[a-z]+)$/i.test(value)&&CSS.supports('color',value)?value:'';
    function copy(node,parent){
      if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
      if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','IMG','TEMPLATE'].includes(node.tagName))return;
      const tag=node.tagName==='FONT'?'SPAN':node.tagName,next=allowed.has(tag)?document.createElement(tag.toLowerCase()):parent;
      if(next!==parent){
        if(['TD','TH'].includes(tag))for(const attr of ['colspan','rowspan']){const n=Number(node.getAttribute(attr));if(Number.isInteger(n)&&n>0&&n<=100)next.setAttribute(attr,String(n));}
        if(tag==='OL'){const start=Number(node.getAttribute('start'));if(Number.isInteger(start)&&start>0&&start<=100000)next.setAttribute('start',String(start));}
        const src=node.style,dst=next.style;
        const face=src.fontFamily||node.getAttribute('face')||'';
        if(face&&face.split(',').every(f=>fonts.has(f.trim().replace(/['"]/g,'').toLowerCase())))dst.fontFamily=face;
        const size=src.fontSize||({'1':'10px','2':'13px','3':'16px','4':'18px','5':'24px','6':'32px','7':'48px'}[node.getAttribute('size')]||'');
        if(/^(\d+(?:\.\d+)?)(px|pt)$/.test(size)&&parseFloat(size)>=6&&parseFloat(size)<=96)dst.fontSize=size;
        const fg=color(src.color||node.getAttribute('color')||''),bg=color(src.backgroundColor||'');if(fg)dst.color=fg;if(bg)dst.backgroundColor=bg;
        if(/^(normal|bold|[1-9]00)$/.test(src.fontWeight))dst.fontWeight=src.fontWeight;
        if(['normal','italic','oblique'].includes(src.fontStyle))dst.fontStyle=src.fontStyle;
        if(/^(none|underline|line-through|underline line-through|line-through underline)$/.test(src.textDecorationLine))dst.textDecorationLine=src.textDecorationLine;
        if(['left','center','right','justify'].includes(src.textAlign))dst.textAlign=src.textAlign;
        if(/^(\d+(?:\.\d+)?)$/.test(src.lineHeight)&&Number(src.lineHeight)>=1&&Number(src.lineHeight)<=3)dst.lineHeight=src.lineHeight;
        if(/^\d+(?:\.\d+)?px$/.test(src.marginLeft)&&parseFloat(src.marginLeft)<=240)dst.marginLeft=src.marginLeft;
        parent.append(next);
      }
      for(const child of node.childNodes)copy(child,next);
    }
    for(const child of source.body.childNodes)copy(child,target);
    return target.innerHTML;
  };
  app.cleanDiagram = (input,height=540) => {
    const nodes = [], ids = new Set();
    for (const item of (Array.isArray(input?.nodes) ? input.nodes : []).slice(0, 80)) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id)) continue;
      ids.add(item.id);
      nodes.push({id:item.id, text:String(item.text || '').slice(0,160), x:Math.max(0,Math.min(784,Number(item.x)||0)), y:Math.max(0,Math.min(height-80,Number(item.y)||0)), color:['sage','cream','rose'].includes(item.color)?item.color:'sage'});
    }
    const edges = [], seen = new Set();
    for (const edge of (Array.isArray(input?.edges) ? input.edges : []).slice(0,300)) {
      if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
      const key = JSON.stringify([edge.from,edge.to]);
      if (!seen.has(key)) { seen.add(key); edges.push({from:edge.from,to:edge.to}); }
    }
    return {nodes,edges};
  };
  app.decode = content => {
    try {
      const data = JSON.parse(content);
      if (data?.format === 'gocviet-v1') return {html:app.sanitize(data.html || ''),diagram:app.cleanDiagram(data.diagram)};
    } catch (_) { /* Original sections contain plain text. */ }
    const container = document.createElement('div');
    for (const line of String(content || '').split('\n')) {
      const p = document.createElement('p');
      if (line) p.textContent = line; else p.append(document.createElement('br'));
      container.append(p);
    }
    return {html:content ? container.innerHTML : '',diagram:{nodes:[],edges:[]}};
  };
  app.encode = (html,diagram) => JSON.stringify({format:'gocviet-v1',html:app.sanitize(html),diagram:app.cleanDiagram(diagram)});
  app.navItem = (section,index,tag='a') => {
    const el = document.createElement(tag);
    const n = document.createElement('span'), title = document.createElement('span'), arrow = document.createElement('span');
    n.className='nav-number'; n.textContent=String(index+1).padStart(2,'0');
    title.className='nav-title'; title.textContent=section.title || 'Chưa đặt tiêu đề';
    arrow.className='nav-arrow'; arrow.textContent='↗';
    const copy=app.el('span','nav-copy');copy.append(title,app.progressBadge(section));el.append(n,copy,arrow);return el;
  };
  app.drawEdges = (svg,diagram) => {
    svg.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const make = (tag,attrs) => {const el=document.createElementNS(ns,tag); for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v); return el;};
    const defs=make('defs',{}), marker=make('marker',{id:svg.id+'-arrow',viewBox:'0 0 10 10',refX:'9',refY:'5',markerWidth:'7',markerHeight:'7',orient:'auto-start-reverse'});
    marker.append(make('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#7f9a7b'})); defs.append(marker); svg.append(defs);
    for(const edge of diagram.edges){
      const a=diagram.nodes.find(n=>n.id===edge.from), b=diagram.nodes.find(n=>n.id===edge.to);
      if(!a||!b)continue;
      const dx=b.x-a.x,dy=b.y-a.y;
      if(!dx&&!dy)continue;
      const t=1/Math.max(Math.abs(dx)/88,Math.abs(dy)/40);
      const x1=a.x+88+dx*t,y1=a.y+40+dy*t,x2=b.x+88-dx*t,y2=b.y+40-dy*t;
      svg.append(make('path',{d:`M ${x1} ${y1} L ${x2} ${y2}`,fill:'none',stroke:'#7f9a7b','stroke-width':'1.7','marker-end':`url(#${svg.id}-arrow)`}));
    }
  };
  app.nodeElement = (node, interactive=false) => {
    const el=document.createElement(interactive?'button':'div');
    if(interactive) {el.type='button';el.setAttribute('aria-label',node.text || 'Hộp chưa có nội dung');}
    el.className='diagram-node';el.dataset.id=node.id;el.dataset.color=node.color;el.textContent=node.text || 'Ý tưởng';el.style.left=node.x+'px';el.style.top=node.y+'px';return el;
  };
  app.readDiagram = (diagram,index) => {
    const frame=document.createElement('div'), canvas=document.createElement('div'), svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    frame.className='readonly-diagram';frame.setAttribute('role','img');
    const labels=new Map(diagram.nodes.map(n=>[n.id,n.text]));
    frame.setAttribute('aria-label','Sơ đồ: '+diagram.nodes.map(n=>n.text).join('; ')+'. Kết nối: '+diagram.edges.map(e=>labels.get(e.from)+' đến '+labels.get(e.to)).join('; '));
    canvas.className='diagram-canvas';svg.classList.add('diagram-edges');svg.id='read-edges-'+index;svg.setAttribute('viewBox','0 0 960 540');canvas.append(svg);app.drawEdges(svg,diagram);
    for(const node of diagram.nodes)canvas.append(app.nodeElement(node));
    frame.append(canvas);
    const observer=new ResizeObserver(()=>{const ratio=frame.clientWidth/960;canvas.style.transform=`scale(${ratio})`;frame.style.height=540*ratio+'px';});observer.observe(frame);
    return frame;
  };
  const syncAuth = user => {
    app.user=user;
    $('login-btn').hidden=!!user; $('logout-btn').hidden=!user;
    $('profile-btn').hidden=!user;
    if(!user)document.getElementById('profile-dialog')?.close();
    window.dispatchEvent(new Event('authchange'));
  };
  app.showLogin = () => { $('login-error').textContent='';$('login-dialog').showModal();$('login-email').focus(); };
  $('login-btn').addEventListener('click',app.showLogin);
  $('login-cancel').addEventListener('click',()=>$('login-dialog').close());
  $('login-dialog').addEventListener('close',()=>$('login-password').value='');
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('login-submit').disabled=true;$('login-error').textContent='';
    try {
      if(!db)throw new Error('Chưa kết nối được dịch vụ đăng nhập. Hãy tải lại trang.');
      const {error}=await db.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
      if(error)throw new Error('Không đăng nhập được. Kiểm tra email, mật khẩu và kết nối mạng.');
      $('login-dialog').close();app.toast('Đã đăng nhập.');
    }catch(error){$('login-error').textContent=error.message;}
    finally{$('login-submit').disabled=false;}
  });
  $('logout-btn').addEventListener('click',async()=>{
    $('logout-btn').disabled=true;
    try{const {error}=await db.auth.signOut();if(error)throw error;app.toast('Đã đăng xuất.');}catch(_){app.toast('Chưa đăng xuất được. Vui lòng thử lại.');}
    finally{$('logout-btn').disabled=false;}
  });
  if(db)db.auth.onAuthStateChange((_event,session)=>syncAuth(session?.user || null));
  let loadTask=null;
  app.load = ()=>{
    if(loadTask)return loadTask;
    loadTask=(async()=>{
    if(!db)throw new Error('Không tải được dịch vụ dữ liệu. Kiểm tra kết nối mạng rồi tải lại trang.');
    const controller=new AbortController();let timeout;
    const request=db.from('sections').select('*').order('slug').abortSignal(controller.signal);
    let result;
    try{
      result=await Promise.race([request,new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('Kết nối quá chậm. Vui lòng thử tải lại nội dung.'));},10000);})]);
    }finally{clearTimeout(timeout);}
    const {data,error}=result;
    if(error)throw new Error('Chưa tải được nội dung. Vui lòng kiểm tra kết nối và thử lại.');
    app.sections=data || [];app.ready=true;
    window.dispatchEvent(new Event('sectionsloaded'));
    return app.sections;
    })().finally(()=>loadTask=null);
    return loadTask;
  };
  app.updateSection = async(section,values)=>{
    if(!app.canEdit(section))throw new Error('Bạn chỉ được chỉnh sửa nội dung do mình phụ trách.');
    let query=db.from('sections').update({...values,updated_at:new Date().toISOString()}).eq('slug',section.slug).eq('owner_id',app.user.id);
    if(section.updated_at)query=query.eq('updated_at',section.updated_at);
    else if(section.content!==null)query=query.eq('content',section.content);
    const {data,error}=await query.select();
    if(error)throw new Error('Chưa lưu được. Hãy kiểm tra kết nối và quyền chỉnh sửa.');
    if(!data?.length)throw new Error('Trang đã được cập nhật ở nơi khác. Bản nháp vẫn được giữ; tải lại để lấy phiên bản mới.');
    const local=app.sections.find(s=>s.slug===section.slug);if(local)Object.assign(local,data[0]);
    try{localStorage.setItem('nhom12-section-saved',JSON.stringify({slug:section.slug,at:Date.now()}));}catch{}
    return data[0];
  };
})();
