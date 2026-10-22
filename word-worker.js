'use strict';
// Parsing stays off the UI thread; the caller can cancel/terminate this worker.
self.onmessage = async ({data}) => {
  try {
    importScripts('mammoth.browser.min.js');
    const images = [], warnings = [];
    const result = await mammoth.convertToHtml({arrayBuffer:data}, {
      externalFileAccess:false, includeEmbeddedStyleMap:false,
      styleMap:['u => u', 'strike => s'],
      convertImage:mammoth.images.imgElement(async image => {
        if (!['image/png','image/jpeg','image/webp','image/gif'].includes(image.contentType)) {
          warnings.push('Một ảnh có định dạng không hỗ trợ đã được bỏ qua.');
          return {src:'unsupported-image'};
        }
        if (images.length >= 40) throw new Error('Tài liệu có quá nhiều ảnh. Hãy chia thành các file nhỏ hơn (tối đa 40 ảnh mỗi lần).');
        const id = images.length;
        images.push(null);
        const bytes = await image.readAsArrayBuffer();
        const buffer = await new Blob([bytes]).arrayBuffer();
        if (buffer.byteLength > 15*1024*1024) throw new Error('Một ảnh trong tài liệu vượt quá 15 MB.');
        images[id] = {buffer,type:image.contentType};
        return {src:'word-image-'+id};
      })
    });
    if (result.value.length > 2000000) throw new Error('Tài liệu quá dài. Hãy chia nhỏ trước khi nhập.');
    if (result.messages.length) warnings.push('Một số định dạng hoặc đối tượng Word không chuyển đổi đầy đủ. Hãy kiểm tra bản xem trước.');
    self.postMessage({html:result.value,images,warnings},images.map(i=>i.buffer));
  } catch (error) {
    self.postMessage({error:error.message || 'Không đọc được tài liệu Word.'});
  }
};
