import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('provinces-vn-2024.json','utf8'));
const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').replace(/[^a-z0-9]/gi,'_').replace(/_+/g,'_').toUpperCase();
const provinces=catalog.names.map(name=>({code:fold(name),name}));
const reference=`'use strict';\n(()=>{const provinces=${JSON.stringify(provinces)};const fold=s=>String(s??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');const normalize=value=>{let s=fold(value).replace(/^(thanhpho|tinh|tp)/,'');if(s==='hue')s='thuathienhue';return provinces.find(p=>fold(p.code)===s||fold(p.name)===s)?.code||'';};const name=code=>provinces.find(p=>p.code===code)?.name||'';const options=(selected='',optional=false)=>'<option value="">'+(optional?'Không đăng ký':'Chọn tỉnh/thành…')+'</option>'+provinces.map(p=>'<option value="'+p.code+'" '+(selected===p.code?'selected':'')+'>'+p.name+'</option>').join('');window.PortalReference=Object.freeze({snapshot:'2024-12-31',provinces:Object.freeze(provinces.map(Object.freeze)),normalizeProvince:normalize,provinceName:name,provinceOptions:options});})();\n`;
fs.writeFileSync('portal-reference.js',reference);
const old=fs.readFileSync('supabase/20261101_02_citizen_records.sql','utf8');
const fn=(source,name)=>{const start=source.indexOf('create or replace function public.'+name+'(');if(start<0)throw Error(name);const end=source.indexOf('$$;',source.indexOf('as $$',start))+3;return source.slice(start,end)+'\n';};
let sql=`begin;
create table if not exists public.cd_tinh_thanh_cu (code text primary key,name text not null unique,snapshot date not null default date '2024-12-31');
insert into public.cd_tinh_thanh_cu(code,name) values
${provinces.map(p=>`('${p.code}','${p.name}')`).join(',\n')} on conflict(code) do nothing;
alter table public.cd_tinh_thanh_cu enable row level security;
revoke all on public.cd_tinh_thanh_cu from public,anon,authenticated;
grant select on public.cd_tinh_thanh_cu to anon,authenticated;grant all on public.cd_tinh_thanh_cu to service_role;
drop policy if exists cd_catalog_read on public.cd_tinh_thanh_cu;
create policy cd_catalog_read on public.cd_tinh_thanh_cu for select to anon,authenticated using(true);
alter table public.cd_cu_tru add column if not exists tinh_thanh_code text references public.cd_tinh_thanh_cu(code) on delete restrict;
-- Existing rows are retained as unknown; never guess a province from an old free-text address.
create index if not exists cd_residence_province_idx on public.cd_cu_tru(tinh_thanh_code);
create or replace function public.cd_province_code(p_value text) returns text language sql stable security definer set search_path=pg_catalog,public as $$
select code from public.cd_tinh_thanh_cu where code=upper(btrim(p_value)) or lower(name)=lower(regexp_replace(btrim(p_value),'^(Tỉnh |Thành phố |TP[.]? )','','i')) or (code='THUA_THIEN_HUE' and lower(btrim(p_value))='huế') limit 1;
$$;
create or replace function public.cd_household_head(p_citizen uuid) returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
select head.cong_dan_id from public.cd_thanh_vien_ho own join public.cd_thanh_vien_ho head on head.ho_id=own.ho_id and head.quan_he_voi_chu_ho='chu_ho' and head.den_ngay is null where own.cong_dan_id=p_citizen and own.den_ngay is null limit 1;
$$;
`;
let validate=fn(old,'cd_validate_record').replace("normalized jsonb:='{}';begin","normalized jsonb:='{}';head public.cd_cong_dan;head_member public.cd_thanh_vien_ho;target_house uuid;head_id uuid;key text;code text;begin");
validate=validate.replace("'householdHead','householdRelation'","'householdHead','householdRelation','householdHeadId','householdHeadCccd','householdHeadVersion','provinceCode','temporaryProvinceCode','currentProvinceCode'");
validate=validate.replace(" if not exists(select 1 from public.cd_don_vi_hc",()=>" if normalized->>'ward'='' then normalized:=jsonb_set(normalized,'{ward}',to_jsonb((select ten_don_vi from public.cd_don_vi_hc where ma_don_vi='MAU-A')));end if;\n if not exists(select 1 from public.cd_don_vi_hc");
validate=validate.replace(' return normalized;',` foreach key in array array['provinceCode','temporaryProvinceCode','currentProvinceCode'] loop
  code:=public.cd_province_code(normalized->>key);
  if (key='provinceCode' or (key='temporaryProvinceCode' and normalized->>'temporaryAddress'<>'') or (key='currentProvinceCode' and normalized->>'currentAddress'<>'')) and code is null then raise exception 'PROVINCE_REQUIRED:%',key;end if;
  normalized:=jsonb_set(normalized,array[key],to_jsonb(coalesce(code,'')));
 end loop;
 if normalized->>'householdCode'<>'' then
  select id into target_house from public.cd_ho_gia_dinh where ma_ho=normalized->>'householdCode' and trang_thai='hoat_dong';
  if normalized->>'householdHeadId'<>'' then
   begin head_id:=(normalized->>'householdHeadId')::uuid;exception when others then raise exception 'HOUSEHOLD_HEAD_NOT_FOUND';end;
  elsif normalized->>'householdHeadCccd'<>'' then
   select id into head_id from public.cd_cong_dan where so_dinh_danh=normalized->>'householdHeadCccd';
  else
   select cong_dan_id into head_id from public.cd_thanh_vien_ho where ho_id=target_house and quan_he_voi_chu_ho='chu_ho' and den_ngay is null;
  end if;
  select * into head from public.cd_cong_dan where id=head_id;
  if head.id is null then raise exception 'HOUSEHOLD_HEAD_NOT_FOUND';end if;
  if normalized->>'householdHeadCccd'<>'' and normalized->>'householdHeadCccd'<>head.so_dinh_danh then raise exception 'HOUSEHOLD_HEAD_IDENTITY_MISMATCH';end if;
  if normalized->>'householdHeadVersion'<>'' and normalized->>'householdHeadVersion'<>head.row_version::text then raise exception 'HOUSEHOLD_HEAD_CONFLICT';end if;
  select * into head_member from public.cd_thanh_vien_ho where cong_dan_id=head.id and den_ngay is null;
  if head_member.id is not null and head_member.ho_id is distinct from target_house and head.id::text is distinct from p->>'id' then raise exception 'HOUSEHOLD_HEAD_OTHER_HOUSE';end if;
  if normalized->>'householdRelation'='chu_ho' and head.id::text is distinct from p->>'id' then raise exception 'HOUSEHOLD_RELATION_MISMATCH';end if;
  normalized:=normalized||jsonb_build_object('householdHeadId',head.id,'householdHeadCccd',head.so_dinh_danh,'householdHeadVersion',head.row_version,'householdHead',head.ho_ten_khai_sinh,'householdRelation',case when head.id::text=p->>'id' then 'chu_ho' else coalesce(nullif(normalized->>'householdRelation',''),'khac') end);
 elsif normalized->>'householdHeadId'<>'' or normalized->>'householdHeadCccd'<>'' or normalized->>'householdHead'<>'' then raise exception 'HOUSEHOLD_CODE_REQUIRED';end if;
 return normalized;`);
sql+=validate;
let doc=fn(old,'cd_record_doc');const extras=`
 'provinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'provinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'temporaryProvinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='tam_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'temporaryProvinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='tam_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'currentProvinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='hien_tai' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'currentProvinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='hien_tai' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'householdHeadId',public.cd_household_head(c.id),
 'householdHeadCccd',coalesce((select so_dinh_danh from public.cd_cong_dan where id=public.cd_household_head(c.id)),''),
 'householdHeadVersion',(select row_version from public.cd_cong_dan where id=public.cd_household_head(c.id)),
 `;
doc=doc.replace(" 'householdCode',",()=>extras+"'householdCode',");sql+=doc;
let write=fn(old,'cd_write_record');write=write.replace('field_key text;relation_kind text;','field_key text;relation_kind text;province text;selected_head uuid;leader uuid;head_member public.cd_thanh_vien_ho;affected_id uuid;affected jsonb;affected_before jsonb;');
write=write.replace("  select * into current_res",`  province:=nullif(v->>case kind when 'thuong_tru' then 'provinceCode' when 'tam_tru' then 'temporaryProvinceCode' else 'currentProvinceCode' end,'');
  select * into current_res`);
write=write.replace('current_res.don_vi_hc_id<>unit_id)', 'current_res.don_vi_hc_id<>unit_id or current_res.tinh_thanh_code is distinct from province)');
write=write.replace('loai_cu_tru,don_vi_hc_id,dia_chi_chi_tiet,','loai_cu_tru,don_vi_hc_id,tinh_thanh_code,dia_chi_chi_tiet,').replace("values(record_id,kind,unit_id,address_value,address_value||', '||(v->>'ward')",()=>"values(record_id,kind,unit_id,province,address_value,address_value||', '||(select name from public.cd_tinh_thanh_cu where code=province)");
const begin=write.indexOf(' select * into old_house'),end=write.indexOf(" if p_input ? 'cardIssuedOn'");
write=write.slice(0,begin)+`
 select * into old_house from public.cd_thanh_vien_ho where cong_dan_id=record_id and den_ngay is null for update;
 if v->>'householdCode'<>'' then
  selected_head:=(v->>'householdHeadId')::uuid;
  perform 1 from public.cd_cong_dan where id=selected_head for update;
  if selected_head<>record_id and not exists(select 1 from public.cd_cong_dan where id=selected_head and row_version::text=v->>'householdHeadVersion') then raise exception 'HOUSEHOLD_HEAD_CONFLICT';end if;
  select id into house_id from public.cd_ho_gia_dinh where ma_ho=v->>'householdCode' and trang_thai='hoat_dong' for update;
  if house_id is null then
   insert into public.cd_ho_gia_dinh(ma_ho,don_vi_hc_id,dia_chi,ngay_lap,trang_thai,created_by,updated_by) values(v->>'householdCode',unit_id,v->>'address',public.cd_today(),'hoat_dong',p_actor,p_actor) returning id into house_id;
  end if;
  select * into head_member from public.cd_thanh_vien_ho where cong_dan_id=selected_head and den_ngay is null for update;
  if head_member.id is not null and head_member.ho_id<>house_id and selected_head<>record_id then raise exception 'HOUSEHOLD_HEAD_OTHER_HOUSE';end if;
  relation:=case when selected_head=record_id then 'chu_ho' else coalesce(nullif(v->>'householdRelation',''),'khac') end;
  if relation not in ('chu_ho','vo_chong','con','cha_me','khac') then raise exception 'INVALID_HOUSEHOLD_RELATION';end if;
  select cong_dan_id into leader from public.cd_thanh_vien_ho where ho_id=house_id and quan_he_voi_chu_ho='chu_ho' and den_ngay is null;
  affected_before:='{}';
  if leader is distinct from selected_head then
   for affected_id in select distinct x from unnest(array[leader,selected_head]) x where x is not null and x<>record_id order by x loop
    perform 1 from public.cd_cong_dan where id=affected_id for update;
    affected_before:=affected_before||jsonb_build_object(affected_id::text,public.cd_record_doc(affected_id));
   end loop;
  end if;
 else house_id:=null;relation:=null;end if;
 if old_house.id is not null and (old_house.ho_id is distinct from house_id or old_house.quan_he_voi_chu_ho is distinct from relation) then
  if old_house.quan_he_voi_chu_ho='chu_ho' and old_house.ho_id is distinct from house_id and exists(select 1 from public.cd_thanh_vien_ho where ho_id=old_house.ho_id and cong_dan_id<>record_id and den_ngay is null) then raise exception 'HOUSEHOLD_HEAD_REQUIRED';end if;
  update public.cd_thanh_vien_ho set den_ngay=public.cd_today(),ly_do_thay_doi=coalesce(nullif(p_reason,''),'Cập nhật hồ sơ'),updated_by=p_actor where id=old_house.id;old_house.id:=null;
 end if;
 if house_id is not null then
  if leader is distinct from selected_head then
   with closed as (
    update public.cd_thanh_vien_ho set den_ngay=public.cd_today(),ly_do_thay_doi='Thay đổi chủ hộ',updated_by=p_actor
    where ho_id=house_id and quan_he_voi_chu_ho='chu_ho' and den_ngay is null and cong_dan_id<>selected_head returning ho_id,cong_dan_id
   ) insert into public.cd_thanh_vien_ho(ho_id,cong_dan_id,quan_he_voi_chu_ho,tu_ngay,ly_do_thay_doi,created_by,updated_by)
    select ho_id,cong_dan_id,'khac',public.cd_today(),'Thay đổi chủ hộ',p_actor,p_actor from closed;
   if selected_head<>record_id then
    update public.cd_thanh_vien_ho set den_ngay=public.cd_today(),ly_do_thay_doi='Được chọn làm chủ hộ',updated_by=p_actor where cong_dan_id=selected_head and den_ngay is null;
    insert into public.cd_thanh_vien_ho(ho_id,cong_dan_id,quan_he_voi_chu_ho,tu_ngay,ly_do_thay_doi,created_by,updated_by) values(house_id,selected_head,'chu_ho',public.cd_today(),'Được chọn làm chủ hộ',p_actor,p_actor);
   end if;
  end if;
  if not exists(select 1 from public.cd_thanh_vien_ho where cong_dan_id=record_id and den_ngay is null) then
   insert into public.cd_thanh_vien_ho(ho_id,cong_dan_id,quan_he_voi_chu_ho,tu_ngay,ly_do_thay_doi,created_by,updated_by) values(house_id,record_id,relation,public.cd_today(),nullif(p_reason,''),p_actor,p_actor);
  end if;
  for affected_id,affected in select key::uuid,value from jsonb_each(coalesce(affected_before,'{}')) loop
   update public.cd_cong_dan set updated_by=p_actor where id=affected_id;
   perform public.cd_audit('Thay đổi chủ hộ','citizen',affected_id,affected,public.cd_record_doc(affected_id),p_actor);
  end loop;
 end if;
`+write.slice(end);
write=write.replace("'address',(v->>'address')||', '||(v->>'ward')","'address',(v->>'address')||', '||(select name from public.cd_tinh_thanh_cu where code=v->>'provinceCode')");
sql+=write;
let restore=fn(old,'cd_restore_record').replace("snapshot:=snapshot||jsonb_build_object('id',p_id);","snapshot:=(snapshot-'householdHeadVersion')||jsonb_build_object('id',p_id);");sql+=restore;
let imports=fs.readFileSync('supabase/20261101_04_citizen_imports.sql','utf8');
sql+=`create or replace function public.cd_import_household(p_doc jsonb) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare doc jsonb;actual uuid;begin
 doc:=p_doc-'householdHeadVersion';
 if coalesce(doc->>'householdCode','')<>'' then
  select m.cong_dan_id into actual from public.cd_ho_gia_dinh h join public.cd_thanh_vien_ho m on m.ho_id=h.id and m.quan_he_voi_chu_ho='chu_ho' and m.den_ngay is null where h.ma_ho=doc->>'householdCode' and h.trang_thai='hoat_dong';
  if actual is null then raise exception 'HOUSEHOLD_IMPORT_MANAGE_FIRST';end if;
  if coalesce(doc->>'householdHeadCccd','')<>'' then doc:=doc-'householdHeadId';end if;
  doc:=doc||public.cd_validate_record(doc);
  if doc->>'householdHeadId'<>actual::text then raise exception 'HOUSEHOLD_IMPORT_MANAGE_FIRST';end if;
 end if;return doc;
end;$$;
`;
let preview=fn(imports,'cd_import_preview').replace('perform public.cd_validate_record(normalized);','normalized:=public.cd_import_household(normalized);normalized:=normalized||public.cd_validate_record(normalized);');
preview=preview.replace("public.cd_record_doc(existing.id)||row_doc",()=>"(public.cd_record_doc(existing.id)-case when row_doc ? 'householdHeadCccd' then 'householdHeadId' else '__unused' end)||row_doc");sql+=preview;
let commit=fn(imports,'cd_import_commit').replace("doc:=public.cd_record_doc(existing.id)||raw",()=>"doc:=(public.cd_record_doc(existing.id)-case when raw ? 'householdHeadCccd' then 'householdHeadId' else '__unused' end)||raw");commit=commit.replace('   saved:=public.cd_write_record',"   doc:=public.cd_import_household(doc);\n   saved:=public.cd_write_record");commit=commit.replace("'householdHead','householdRelation'","'householdHead','householdRelation','householdHeadCccd','provinceCode','temporaryProvinceCode','currentProvinceCode'");sql+=commit;
let changes=fn(fs.readFileSync('supabase/20261101_03_citizen_requests.sql','utf8'),'cd_validate_changes').replace("'address','ward'","'address','ward','provinceCode','temporaryProvinceCode','currentProvinceCode'");sql+=changes;
sql+="update public.cd_portal_meta set schema_version=2 where id=1;\n";
sql+=fs.readFileSync('scripts/portal-permissions.sql','utf8');sql+="\nnotify pgrst,'reload schema';\n";
fs.writeFileSync('supabase/20261101_07_household_provinces.sql',sql);
console.log('Built province reference and additive household/residence migration.');
