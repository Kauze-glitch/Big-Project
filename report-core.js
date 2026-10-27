'use strict';
(() => {
  const R=window.ReportExport={},A=window.GocViet;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const colors=document.createElement('canvas').getContext('2d');
  function color(value){if(!value||value==='transparent')return undefined;colors.fillStyle='#000000';colors.fillStyle=value;const v=colors.fillStyle;return /^#[\da-f]{6}$/i.test(v)?v.slice(1):undefined;}
  function styleOf(el,parent={}){
    const s={...parent},css=el.style,tag=el.tagName;
    if(['B','STRONG','TH'].includes(tag))s.bold=true;if(['I','EM'].includes(tag))s.italics=true;if(tag==='U')s.underline=true;if(['S','STRIKE'].includes(tag))s.strike=true;
    if(tag==='SUB'){s.subscript=true;s.superscript=false;}if(tag==='SUP'){s.superscript=true;s.subscript=false;}
    if(/^H[1-6]$/.test(tag)){s.bold=true;s.size=[22,19,17,15,14,13][Number(tag[1])-1];}
    if(css.fontWeight)s.bold=css.fontWeight==='bold'||Number(css.fontWeight)>=600;
    if(css.fontStyle)s.italics=css.fontStyle!=='normal';
    if(css.textDecorationLine){s.underline=css.textDecorationLine.includes('underline');s.strike=css.textDecorationLine.includes('line-through');}
    if(css.fontSize)s.size=clamp(parseFloat(css.fontSize)*(css.fontSize.endsWith('px')?.75:1),6,72);
    if(css.fontFamily)s.font=css.fontFamily.split(',')[0].trim().replace(/['"]/g,'');
    if(color(css.color))s.color=color(css.color);if(color(css.backgroundColor))s.background=color(css.backgroundColor);
    return s;
  }
  const blockTags=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','TABLE','HR']);
  function parseChildren(parent,inherited={},depth=0){
    const output=[];let runs=[];
    const flush=(element=parent,label='')=>{if(runs.length||label){output.push({type:'p',runs:label?[{text:label,...inherited},...runs]:runs,align:element.style?.textAlign||'left',line:Number(element.style?.lineHeight)||1.35,indent:(parseFloat(element.style?.marginLeft)||0)*.75,heading:/^H[1-6]$/.test(element.tagName)?Number(element.tagName[1]):0});runs=[];}};
    function inline(node,style){
      if(node.nodeType===3){const text=node.textContent.replace(/[\t\r\n ]+/g,' ');if(text)runs.push({text,...style});return;}
      if(node.nodeType!==1)return;const next=styleOf(node,style);
      if(node.tagName==='BR'){runs.push({text:'\n',...next});return;}
      for(const child of node.childNodes)inline(child,next);
    }
    for(const node of parent.childNodes){
      if(node.nodeType!==1||!blockTags.has(node.tagName)){inline(node,inherited);continue;}
      flush();const style=styleOf(node,inherited);
      if(node.tagName==='TABLE'){output.push(parseTable(node,style,depth+1));continue;}
      if(['UL','OL'].includes(node.tagName)){
        let n=Number(node.getAttribute('start'))||1;
        for(const li of [...node.children].filter(e=>e.tagName==='LI')){
          const items=parseChildren(li,styleOf(li,style),depth+1),label=node.tagName==='OL'?`${n++}. `:'• ';
          if(items[0]?.type==='p')items[0].runs.unshift({text:label,...style});else items.unshift({type:'p',runs:[{text:label,...style}],align:'left',line:1.35});
          for(const p of items)if(p.type==='p')p.indent=(p.indent||0)+14;
          output.push(...items);
        }continue;
      }
      if(node.tagName==='HR'){output.push({type:'rule'});continue;}
      if([...node.children].some(el=>blockTags.has(el.tagName))){output.push(...parseChildren(node,style,depth+1));continue;}
      for(const child of node.childNodes)inline(child,style);if(!runs.length)runs=[{text:'',...style}];flush(node);
    }
    flush();return output;
  }
  function parseTable(table,style,depth){
    if(depth>15)throw new Error('Bảng lồng quá nhiều cấp. Hãy đơn giản hóa bảng trước khi xuất.');
    const source=[...table.rows].filter(row=>row.closest('table')===table),rows=[],widths=[];let columns=0;
    source.forEach((tr,y)=>{
      rows[y] ||= [];let x=0;
      for(const td of tr.cells){
        while(rows[y][x])x++;
        const colspan=clamp(td.colSpan||1,1,100),rowspan=clamp(td.rowSpan||1,1,source.length-y);
        const cell={content:parseChildren(td,styleOf(td,style),depth+1),colspan,rowspan,header:td.tagName==='TH'};
        rows[y][x]=cell;
        for(let yy=y;yy<y+rowspan;yy++){rows[yy] ||= [];for(let xx=x;xx<x+colspan;xx++)if(yy!==y||xx!==x)rows[yy][xx]={covered:true,vertical:yy>y};}
        x+=colspan;
      }
      columns=Math.max(columns,rows[y].length);
    });
    if(!columns)return {type:'p',runs:[{text:''}]};
    for(const row of rows)for(let x=0;x<columns;x++)row[x] ||= {content:[],colspan:1,rowspan:1};
    return {type:'table',rows,columns,headerRows:source[0]&&[...source[0].cells].every(c=>c.tagName==='TH')?1:0};
  }
  R.parseHtml=html=>{const root=document.createElement('div');root.innerHTML=A.sanitize(html);return parseChildren(root);};
  function wrapText(ctx,text,width){
    const lines=[];for(const paragraph of String(text).split('\n')){let line='';for(const char of paragraph){if(ctx.measureText(line+char).width>width&&line){lines.push(line.trimEnd());line=char.trimStart();}else line+=char;}lines.push(line);}return lines;
  }
  R.boardImage=async input=>{
    const board=A.cleanBoard(input),canvas=document.createElement('canvas');canvas.width=1920;canvas.height=board.height*2;
    const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,960,board.height);
    for(const edge of board.edges){const a=board.nodes.find(n=>n.id===edge.from),b=board.nodes.find(n=>n.id===edge.to);if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y;if(!dx&&!dy)continue;const t=1/Math.max(Math.abs(dx)/88,Math.abs(dy)/40),x1=a.x+88+dx*t,y1=a.y+40+dy*t,x2=b.x+88-dx*t,y2=b.y+40-dy*t;ctx.strokeStyle='#70896d';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const angle=Math.atan2(y2-y1,x2-x1);ctx.fillStyle='#70896d';ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-10*Math.cos(angle-.45),y2-10*Math.sin(angle-.45));ctx.lineTo(x2-10*Math.cos(angle+.45),y2-10*Math.sin(angle+.45));ctx.fill();}
    for(const item of board.images){const image=new Image();image.src=item.src;try{await image.decode();}catch{throw new Error('Có ảnh không đọc được. Hãy sửa hoặc thay ảnh đó rồi xuất lại.');}const scale=Math.min(item.w/image.naturalWidth,item.h/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale;ctx.drawImage(image,item.x+(item.w-w)/2,item.y+(item.h-h)/2,w,h);}
    for(const node of board.nodes){
      ctx.fillStyle=({sage:'#e3ecdd',cream:'#f4eedb',rose:'#f1e2df'})[node.color];ctx.strokeStyle='#adbea4';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(node.x,node.y,176,80,8);ctx.fill();ctx.stroke();
      let size=16,lines;do{ctx.font=`${size}px Arial`;lines=wrapText(ctx,node.text||'Ý tưởng',156);if(lines.length*size*1.2<=64)break;size--;}while(size>8);
      ctx.fillStyle='#263c35';ctx.textAlign='center';ctx.textBaseline='middle';const lineHeight=size*1.2,start=node.y+40-(lines.length-1)*lineHeight/2;lines.forEach((line,i)=>ctx.fillText(line,node.x+88,start+i*lineHeight,156));
    }
    const src=canvas.toDataURL('image/png');canvas.width=canvas.height=0;return {type:'image',src,width:960,height:board.height};
  };
  R.prepare=async(sections,onProgress=()=>{})=>{
    const result=[];
    for(const [index,section] of sections.entries()){
      onProgress(`Đang chuẩn bị phần ${index+1}/${sections.length}…`);const decoded=A.decode(section.content),items=[];
      for(const block of decoded.blocks){if(block.type==='text')items.push(...R.parseHtml(block.html));else{const image=await R.boardImage(block.board);image.caption=block.caption;items.push(image);}}
      if(!A.hasContent(decoded.blocks))items.push({type:'p',runs:[{text:'Chưa có nội dung được đăng.',italics:true,color:'617168'}]});
      result.push({title:section.title||'Chưa đặt tiêu đề',slug:section.slug,items});
    }
    return result;
  };
  function pdfRuns(runs){return runs.map(r=>({text:r.text,bold:r.bold,italics:r.italics,decoration:[r.underline?'underline':null,r.strike?'lineThrough':null].filter(Boolean),fontSize:r.size||12,color:r.color?'#'+r.color:undefined,background:r.background?'#'+r.background:undefined}));}
  function pdfItem(item){
    if(item.type==='p')return {text:pdfRuns(item.runs),alignment:item.align||'left',lineHeight:Math.min(item.line||1.35,2),margin:[item.indent||0,item.heading?10:0,0,8],...(item.heading?{headlineLevel:item.heading}:{}),preserveLeadingSpaces:true,unbreakable:item.runs.reduce((n,r)=>n+r.text.length,0)<=300&&item.runs.every(r=>(r.size||12)<=18)};
    if(item.type==='rule')return {canvas:[{type:'line',x1:0,y1:0,x2:475,y2:0,lineWidth:.5,lineColor:'#d9d9d9'}],margin:[0,8,0,12]};
    if(item.type==='image')return {stack:[{image:item.src,fit:[475,540],alignment:'center'},...(item.caption?[{text:item.caption,alignment:'center',fontSize:10,italics:true,margin:[0,6,0,0]}]:[])],unbreakable:true,margin:[0,10,0,14]};
    return {table:{headerRows:item.headerRows,widths:Array(item.columns).fill('*'),body:item.rows.map(row=>row.map(cell=>cell.covered?{}:{stack:cell.content.length?cell.content.map(pdfItem):[{text:''}],colSpan:cell.colspan,rowSpan:cell.rowspan,fillColor:cell.header?'#eaf0f5':undefined,margin:[3,3,3,3]}))},layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=>'#d9d9d9',vLineColor:()=>'#d9d9d9'},margin:[0,6,0,14]};
  }
  R.pdfDefinition=(report)=>{
    const content=[];
    if(report.cover){
      content.push({text:'BÁO CÁO ĐỀ TÀI',alignment:'center',fontSize:14,characterSpacing:2,margin:[0,35,0,38]},{text:report.title,alignment:'center',fontSize:25,bold:true,margin:[0,0,0,25]},{text:report.group,alignment:'center',fontSize:15,margin:[0,0,0,30]},{text:'Thành viên thực hiện',bold:true,fontSize:13,margin:[0,0,0,12]});
      content.push({table:{headerRows:1,widths:[140,90,'*'],body:[['Họ và tên','Vai trò','Nhiệm vụ'].map(text=>({text,bold:true,fillColor:'#eaf0f5'})),...report.members.map(m=>[m.name,m.role||'Thành viên',m.task||''])]},layout:{hLineWidth:()=>.5,vLineWidth:()=>.5,hLineColor:()=>'#d9d9d9',vLineColor:()=>'#d9d9d9',paddingTop:()=>8,paddingBottom:()=>8},fontSize:10});
      content.push({text:report.date,alignment:'center',fontSize:11,margin:[0,28,0,0]});
    }
    if(report.toc)content.push({toc:{title:{text:'Mục lục',fontSize:22,bold:true,margin:[0,0,0,24]},textStyle:{fontSize:12},numberStyle:{bold:true}},...(content.length?{pageBreak:'before'}:{})});
    report.sections.forEach((section,i)=>{content.push({text:`${i+1}. ${section.title}`,fontSize:22,bold:true,tocItem:true,id:'section'+i,margin:[0,0,0,24],...(content.length?{pageBreak:'before'}:{})});content.push(...section.items.map(pdfItem));});
    return {info:{title:report.title,author:report.group,subject:'Báo cáo đề tài'},pageSize:'A4',pageMargins:[60,55,60,55],defaultStyle:{font:'Roboto',fontSize:12,lineHeight:1.35,color:'#111111'},content,footer:(page,total)=>({text:`${page} / ${total}`,alignment:'center',fontSize:9,color:'#607169',margin:[0,15,0,0]}),pageBreakBefore:(node,following)=>!!node.headlineLevel&&following.length===0};
  };
  function wordRun(D,r){
    const options={bold:r.bold,italics:r.italics,underline:r.underline?{}:undefined,strike:r.strike,subScript:r.subscript,superScript:r.superscript,font:r.font||'Times New Roman',size:Math.round((r.size||12)*2),color:r.color,shading:r.background?{fill:r.background}:undefined};
    return r.text.split('\n').map((text,i)=>new D.TextRun({...options,text,...(i?{break:1}:{})}));
  }
  function wordItem(D,item,width=9500){
    if(item.type==='p')return new D.Paragraph({children:item.runs.flatMap(r=>wordRun(D,r)),alignment:item.align||'left',spacing:{after:140,line:Math.round((item.line||1.35)*240)},indent:item.indent?{left:Math.round(item.indent*20)}:undefined,keepNext:!!item.heading,widowControl:true});
    if(item.type==='rule')return new D.Paragraph({border:{bottom:{color:'D9D9D9',size:4,style:D.BorderStyle.SINGLE}},spacing:{after:160}});
    if(item.type==='image'){const scale=Math.min((width/15)/item.width,680/item.height);return [new D.Paragraph({alignment:'center',keepNext:!!item.caption,children:[new D.ImageRun({type:'png',data:item.src,transformation:{width:Math.round(item.width*scale),height:Math.round(item.height*scale)},altText:{title:item.caption||'Ảnh và sơ đồ',description:item.caption||'Bố cục ảnh và sơ đồ từ website',name:'Minh họa'}})],spacing:{before:160,after:100}}),...(item.caption?[new D.Paragraph({alignment:'center',children:[new D.TextRun({text:item.caption,italics:true,size:20})],spacing:{after:180}})]:[])];}
    const borders=Object.fromEntries(['top','bottom','left','right','insideHorizontal','insideVertical'].map(k=>[k,{style:D.BorderStyle.SINGLE,size:4,color:'D9D9D9'}]));
    return new D.Table({width:{size:width,type:D.WidthType.DXA},columnWidths:Array(item.columns).fill(Math.floor(width/item.columns)),layout:D.TableLayoutType.FIXED,borders,margins:{top:100,bottom:100,left:100,right:100},rows:item.rows.map((row,i)=>new D.TableRow({tableHeader:i<item.headerRows,children:row.filter(c=>!c.covered).map(cell=>new D.TableCell({columnSpan:cell.colspan,rowSpan:cell.rowspan,verticalAlign:D.VerticalAlign.CENTER,shading:cell.header?{fill:'EAF0F5'}:undefined,children:cell.content.length?cell.content.flatMap(c=>wordItem(D,c,Math.max(300,Math.floor(width*cell.colspan/item.columns)-200))):[new D.Paragraph('')]}))}))});
  }
  R.wordDocument=(report,D=window.docx)=>{
    const children=[],p=(text,opts={})=>new D.Paragraph({text,...opts});
    if(report.cover){children.push(p('BÁO CÁO ĐỀ TÀI',{alignment:'center',spacing:{before:700,after:600}}),new D.Paragraph({heading:D.HeadingLevel.TITLE,alignment:'center',children:[new D.TextRun({text:report.title,bold:true,size:48,color:'000000'})],spacing:{after:420}}),p(report.group,{alignment:'center',spacing:{after:500}}),p('Thành viên thực hiện',{spacing:{after:180}}));
      const rows=[['Họ và tên','Vai trò','Nhiệm vụ'],...report.members.map(m=>[m.name,m.role||'Thành viên',m.task||''])];
      children.push(wordItem(D,{type:'table',columns:3,headerRows:1,rows:rows.map((row,i)=>row.map(text=>({colspan:1,rowspan:1,header:i===0,content:[{type:'p',runs:[{text,bold:i===0,size:11}],line:1.2}]})))}),p(report.date,{alignment:'center',spacing:{before:450,after:100}}));
    }
    if(report.toc){children.push(new D.Paragraph({children:[new D.TextRun({text:'Mục lục',size:44,bold:true})],pageBreakBefore:children.length>0,spacing:{after:350}}));children.push(new D.TableOfContents('Mục lục',{hyperlink:true,headingStyleRange:'1-1',beginDirty:true,cachedEntries:report.sections.map((s,i)=>({title:`${i+1}. ${s.title}`,level:1,href:'section'+i}))}));}
    report.sections.forEach((section,i)=>{children.push(new D.Paragraph({heading:D.HeadingLevel.HEADING_1,pageBreakBefore:children.length>0,children:[new D.Bookmark({id:'section'+i,children:[new D.TextRun({text:`${i+1}. ${section.title}`,bold:true,size:40,color:'000000'})]})],spacing:{after:350}}));children.push(...section.items.flatMap(item=>wordItem(D,item)));});
    return new D.Document({creator:report.group,title:report.title,description:'Báo cáo đề tài',features:{updateFields:true},styles:{default:{document:{run:{font:'Times New Roman',size:24,color:'000000'},paragraph:{spacing:{after:140,line:324}}},heading1:{run:{font:'Times New Roman',size:40,bold:true,color:'000000'}},title:{run:{font:'Times New Roman',size:48,bold:true,color:'000000'}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1100,bottom:1100,left:1203,right:1203,header:400,footer:500}}},footers:{default:new D.Footer({children:[new D.Paragraph({alignment:'center',children:[new D.TextRun({children:[D.PageNumber.CURRENT,' / ',D.PageNumber.TOTAL_PAGES],size:18,color:'607169'})]})]})},children}]});
  };
})();
