'use strict';
(() => {
 const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 const C=window.PortalReference,esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function bind(form,record,repository){
  const people=repository.list(),find=name=>form.elements.namedItem(name);
  function province(key,address,title,required){
   const input=find(address);if(!input)return;const label=document.createElement('label');label.className='field province-field';label.innerHTML=`<span>${title}${required?' *':''}</span><select name="${key}" ${required?'required':''}>${C.provinceOptions(record[key]||'',!required)}</select><small>Danh mục 63 tỉnh/thành trước sáp nhập · mốc 31/12/2024.</small>`;input.closest('label').before(label);const select=label.querySelector('select');const update=()=>{select.required=required||!!input.value.trim();};input.addEventListener('input',update);update();
  }
  province('provinceCode','address','Tỉnh/thành thường trú (trước sáp nhập)',true);
  province('temporaryProvinceCode','temporaryAddress','Tỉnh/thành tạm trú (trước sáp nhập)',false);
  province('currentProvinceCode','currentAddress','Tỉnh/thành nơi ở hiện tại (trước sáp nhập)',false);
  const temp=find('temporaryAddress');
  for(const [key,title,value] of [['temporaryFrom','Ngày bắt đầu tạm trú',record.temporaryRegistration?.from||repository.today()],['temporaryUntil','Ngày hết hạn tạm trú',record.temporaryRegistration?.until||'']]){const label=document.createElement('label');label.className='field';label.innerHTML='<span>'+title+'</span><input type="date" name="'+key+'" value="'+esc(value)+'">';temp.closest('label').after(label);const input=label.querySelector('input');const update=()=>{input.required=!!temp.value.trim()&&(!record.temporaryAddress||!!record.temporaryRegistration?.until);};temp.addEventListener('input',update);update();}
  find('address').closest('label').querySelector('span').textContent='Địa chỉ thường trú chi tiết *';
  const ward=find('ward');if(ward){const hidden=document.createElement('input');hidden.type='hidden';hidden.name='ward';hidden.value=record.ward||repository.units()[0]?.name||'';ward.closest('label').replaceWith(hidden);}
  const code=find('householdCode'),relation=find('householdRelation');if(!code||!relation)return;
  const relationHint=document.createElement('small');relationHint.id='household-relation-hint';relation.closest('label').append(relationHint);relation.setAttribute('aria-describedby',relationHint.id);
  const label=document.createElement('label');label.className='field wide household-selector';label.innerHTML=`<span>Chủ hộ — chọn công dân đã có hồ sơ</span><input type="search" id="household-head-search" placeholder="Lọc theo tên hoặc CCCD" aria-label="Tìm công dân làm chủ hộ"><select name="householdHeadId" aria-label="Chủ hộ — công dân đã có hồ sơ"></select><input type="hidden" name="householdHeadVersion"><small id="household-head-hint"></small>`;code.closest('label').after(label);
  const select=find('householdHeadId'),version=find('householdHeadVersion'),search=label.querySelector('input[type=search]'),hint=label.querySelector('small');let selected=record.householdHeadId||'';
  function draw(){const query=fold(search.value),house=code.value.trim();select.innerHTML='<option value="">Chọn chủ hộ từ hồ sơ đã lưu…</option>'+people.filter(p=>p.id===selected||!query||fold(p.name+' '+p.cccd).includes(query)).map(p=>{const other=p.householdCode&&p.householdCode!==house&&p.id!==record.id;return `<option value="${esc(p.id)}" ${p.id===selected?'selected':''} ${other?'disabled':''}>${esc(p.name)} · ${esc(p.cccd)}${other?' — thuộc hộ '+esc(p.householdCode):''}</option>`;}).join('');select.required=!!house;select.disabled=!house;search.disabled=!house;update();}
  function update(){selected=select.value;const person=people.find(p=>p.id===selected);version.value=person?String(person.rowVersion):'';select.setCustomValidity(person&&person.householdCode&&person.householdCode!==code.value.trim()&&person.id!==record.id?'Người này đang thuộc hộ khác. Vui lòng chọn công dân phù hợp hoặc xử lý chuyển hộ trước.':'');const self=!!record.id&&selected===record.id;const option=[...relation.options].find(o=>o.value==='chu_ho');if(option)option.disabled=!record.id||!code.value.trim();if(self)relation.value='chu_ho';else if(relation.value==='chu_ho')relation.value='khac';
   relationHint.textContent=!record.id?'Muốn đặt người này làm chủ hộ: lưu hồ sơ trước (để trống mã hộ), mở “Sửa hồ sơ”, nhập mã hộ rồi chọn “Chủ hộ”.':!code.value.trim()?'Nhập mã hộ để có thể chọn “Chủ hộ”.':self?'Người trong hồ sơ này được chọn làm chủ hộ.':'Chọn “Chủ hộ” để đặt chính người trong hồ sơ này làm chủ hộ; hệ thống tự liên kết hồ sơ đã lưu.';
   hint.textContent=!code.value.trim()?'Không nhập hộ gia đình thì không cần chọn chủ hộ.':!people.length?'Chưa có công dân đã lưu. Lưu hồ sơ trước, sau đó mở lại để chọn chủ hộ.':!record.id?'Người đang nhập chưa có hồ sơ nên chưa thể làm chủ hộ. Muốn chọn người này: lưu trước, rồi mở lại để thêm vào hộ.':person?`Đã chọn hồ sơ ${person.name}. Tên được lấy từ database, không nhập tự do.`:'Bắt buộc chọn công dân đã tồn tại; không dùng tên tự gõ.';
  }
  code.addEventListener('input',()=>{if(!code.value.trim())selected='';draw();});search.addEventListener('input',draw);select.addEventListener('change',update);relation.addEventListener('change',()=>{if(relation.value==='chu_ho'&&record.id&&code.value.trim()){selected=record.id;search.value='';draw();}else if(selected===record.id){selected='';draw();}});draw();
 }
 window.PortalResidence=Object.freeze({bind});
})();
