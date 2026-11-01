'use strict';
(() => {
 function bindRecord(form) {
  const body=form.querySelector('.dialog-body'),original=body.querySelector('.form-grid');
  const get=name=>form.elements.namedItem(name);
  const sections=[
   ['identity','01','Thông tin định danh','Thông tin bắt buộc để tạo hồ sơ công dân.',['name','cccd','dob','gender']],
   ['contact','02','Liên hệ','Số điện thoại dùng để liên hệ với công dân.',['phone','email','occupation']],
   ['residence','03','Địa chỉ cư trú','Chọn tỉnh/thành theo danh mục trước sáp nhập, sau đó nhập địa chỉ chi tiết.',['provinceCode','address','temporaryProvinceCode','temporaryAddress','currentProvinceCode','currentAddress']],
   ['household','04','Hộ gia đình','Chỉ chọn chủ hộ từ hồ sơ công dân đã được lưu. Có thể bổ sung mục này sau.',['householdCode','householdHeadId','householdRelation']]
  ];
  const links=document.createElement('nav');links.className='record-jumps';links.setAttribute('aria-label','Các mục trong hồ sơ');
  for(const [id,number,title,description,keys] of sections){
   const section=document.createElement('section');section.className='record-section';section.id='record-'+id;section.setAttribute('aria-labelledby',section.id+'-title');
   const heading=document.createElement('h3');heading.id=section.id+'-title';heading.innerHTML=`<span aria-hidden="true">${number}</span>${title}`;section.append(heading);
   const help=document.createElement('p');help.className='record-section-help';help.textContent=description;section.append(help);
   const grid=document.createElement('div');grid.className='form-grid';section.append(grid);
   original.before(section);
   for(const key of keys){const label=get(key)?.closest('label');if(label)grid.append(label);}
   if(id==='residence'){
    const optional=document.createElement('details');optional.className='record-subsection';optional.innerHTML='<summary>Tạm trú và nơi ở hiện tại <span>Chỉ bổ sung khi khác thường trú</span></summary>';
    const optionalGrid=document.createElement('div');optionalGrid.className='form-grid';optional.append(optionalGrid);
    for(const key of keys.slice(2)){const label=get(key)?.closest('label');if(label)optionalGrid.append(label);}
    optional.open=!!(get('temporaryAddress')?.value||get('currentAddress')?.value);section.append(optional);
   }
   const button=document.createElement('button');button.type='button';button.textContent=title;button.addEventListener('click',()=>{get(keys[0])?.focus({preventScroll:true});section.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});links.append(button);
  }
  const extra=document.createElement('details');extra.className='record-extra';extra.innerHTML='<summary>Thông tin bổ sung <span>Nhân thân, quê quán, hôn nhân</span></summary>';
  extra.open=[...original.querySelectorAll('input:not([type=hidden])')].some(input=>input.value.trim());
  original.before(extra);extra.append(original);
  const card=body.querySelector('.citizen-request-detail');if(card){card.classList.add('record-extra');card.classList.remove('citizen-request-detail');card.open=!!get('cardIssuedOn')?.value;}
  form.querySelector('.dialog-head').after(links);
  const error=form.querySelector('#record-error');error.tabIndex=-1;
  let firstInvalid=null;
  const clear=el=>{el.removeAttribute('aria-invalid');const message=el.closest('.field')?.querySelector('.field-error');message?.remove();const ids=(el.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==message?.id);if(ids.length)el.setAttribute('aria-describedby',ids.join(' '));else el.removeAttribute('aria-describedby');};
  form.addEventListener('invalid',event=>{
   event.preventDefault();const el=event.target;if(!el.closest('.field'))return;clear(el);el.setAttribute('aria-invalid','true');
   for(let parent=el.parentElement;parent&&parent!==form;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   const message=document.createElement('small');message.className='field-error';message.id='record-error-'+el.name;
   const label=el.closest('.field').querySelector('span')?.textContent.replace(/\s*\*$/,'')||'thông tin này';
   message.textContent=el.validity.customError?el.validationMessage:el.validity.valueMissing?`Vui lòng ${el.tagName==='SELECT'?'chọn':'nhập'} ${label.toLowerCase()}.`:el.name==='cccd'?'Số CCCD cần đủ 12 chữ số và bắt đầu bằng 000.':el.name==='phone'?'Số điện thoại cần đủ 10 chữ số và bắt đầu bằng 000.':el.type==='email'?'Vui lòng nhập địa chỉ email hợp lệ.':`Vui lòng kiểm tra ${label.toLowerCase()}.`;
   el.closest('.field').append(message);el.setAttribute('aria-describedby',[(el.getAttribute('aria-describedby')||''),message.id].filter(Boolean).join(' '));
   if(!firstInvalid){firstInvalid=el;queueMicrotask(()=>{firstInvalid?.focus();firstInvalid=null;});}
  },true);
  for(const name of ['input','change'])form.addEventListener(name,event=>{if(event.target.matches('input,select,textarea'))clear(event.target);error.textContent='';});
  for(const input of form.querySelectorAll('[name=cccd],[name=phone],[name=email]'))input.spellcheck=false;
 }
 window.PortalInterface=Object.freeze({bindRecord});
})();
