import { readSheet } from 'read-excel-file/browser';
import writeExcelFile from 'write-excel-file/browser';
import { unzipSync,strFromU8 } from 'fflate';
function validateGrid(buffer){const files=unzipSync(new Uint8Array(buffer),{filter:f=>/^xl\/worksheets\/[^/]+\.xml$/.test(f.name)});for(const bytes of Object.values(files)){const xml=strFromU8(bytes);for(const match of xml.matchAll(/\b(?:r|ref)\s*=\s*["']([^"']+)["']/g)){for(const cell of match[1].split(':')){if(/^\d+$/.test(cell)){if(Number(cell)>501)throw Error('Sheet vượt quá 500 dòng dữ liệu.');continue;}const ref=/^([A-Z]+)([0-9]+)$/.exec(cell);if(ref){let col=0;for(const c of ref[1])col=col*26+c.charCodeAt(0)-64;if(col>64||Number(ref[2])>501)throw Error('Sheet vượt quá 500 dòng hoặc 64 cột. Hãy tách nhỏ tệp.');}}}}}
window.PortalExcel={read:async(file)=>{const buffer=await file.arrayBuffer();validateGrid(buffer);return readSheet(buffer,1);},write:(data,columns)=>writeExcelFile(data,{columns,sheet:'Ho so cong dan'}).toBlob()};
