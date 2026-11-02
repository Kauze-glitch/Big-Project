import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {crc32} from 'node:zlib';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
const mammoth=createRequire(import.meta.url)('../mammoth.browser.min.js');
function zip(entries){
  const parts=[],directory=[];let offset=0;
  for(const [name,value] of Object.entries(entries)){
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(value),filename=Buffer.from(name),header=Buffer.alloc(30),central=Buffer.alloc(46),crc=crc32(bytes);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(filename.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE(offset,42);
    parts.push(header,filename,bytes);directory.push(central,filename);offset+=header.length+filename.length+bytes.length;
  }
  const cd=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,cd,end]);
}
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCeoAAAAASUVORK5CYII=','base64');
function docx(){return zip({
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="img1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/></Relationships>',
  'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Báo cáo cư trú</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Dữ liệu bảng</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:pict><v:shape><v:imagedata r:id="img1"/></v:shape></w:pict></w:r></w:p><w:p><w:r><w:t>Kết thúc báo cáo</w:t></w:r></w:p></w:body></w:document>',
  'word/media/diagram.png':image
});}
test('Actual DOCX conversion and import retain Vietnamese, bold text, tables and large image blocks',async()=>{
  const d=new JSDOM('<div id="auth-dialogs"></div><button id="login-btn"></button><button id="logout-btn"></button>',{url:'https://fixture.invalid/',runScripts:'outside-only'}),w=d.window;
  try{
    w.CSS={supports:()=>true};w.structuredClone=structuredClone;
    for(const path of ['shared.js','content.js'])w.eval(fs.readFileSync(path,'utf8'));
    w.GocViet.loadImage=async file=>({id:'picture',src:'data:image/png;base64,'+image.toString('base64'),x:40,y:40,w:880,h:510,alt:file.name});
    w.Worker=class{
      terminate(){}
      postMessage(buffer){
        const pictures=[];
        mammoth.convertToHtml({arrayBuffer:buffer},{externalFileAccess:false,convertImage:mammoth.images.imgElement(async image=>{const id=pictures.length;pictures.push({type:image.contentType,buffer:await image.readAsArrayBuffer()});return {src:'word-image-'+id};})}).then(result=>this.onmessage({data:{html:result.value,images:pictures,warnings:[]}})).catch(error=>this.onmessage({data:{error:error.message}}));
      }
    };
    w.eval(fs.readFileSync('word-import.js','utf8').replace('  A.initWordImport=bridge=>','  A.testPrepare=prepare;\n  A.initWordImport=bridge=>'));
    const bytes=docx(),file={name:'Báo cáo.docx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)},result=await w.GocViet.testPrepare(file,new w.AbortController().signal);
    assert.equal(result.imageCount,1);assert.equal(result.blocks.length,3);assert.match(result.blocks[0].html,/<strong>Báo cáo cư trú<\/strong>/);assert.match(result.blocks[0].html,/<table>/);assert.match(result.blocks[0].html,/Dữ liệu bảng/);assert.equal(result.blocks[1].board.images[0].w,880);assert.equal(result.blocks[1].board.height,590);assert.match(result.blocks[2].html,/Kết thúc báo cáo/);
    await assert.rejects(w.GocViet.testPrepare({...file,name:'old.doc'},new w.AbortController().signal),/\.docx/);
  }finally{w.close();}
});
