-- Additive coursework operations. No existing accounts or records are removed.
begin;
alter table public.cd_cu_tru add column if not exists han_dang_ky date;
create or replace function public.cd_residence_summary(p_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('temporaryRegistration',(select jsonb_build_object('id',id,'from',tu_ngay,'until',han_dang_ky,'expired',han_dang_ky<public.cd_today()) from public.cd_cu_tru where cong_dan_id=p_id and loai_cu_tru='tam_tru' and den_ngay is null and trang_thai='hieu_luc' limit 1));
$$;
create or replace function public.cd_business_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.cd_is_member() and p_id is distinct from public.cd_current_citizen() then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;
 if not exists(select 1 from public.cd_cong_dan where id=p_id) then raise exception 'CITIZEN_NOT_FOUND';end if;
 return jsonb_build_object(
 'residences',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.loai_cu_tru,'address',r.dia_chi_chi_tiet,'provinceCode',r.tinh_thanh_code,'provinceName',p.name,'from',r.tu_ngay,'to',r.den_ngay,'until',r.han_dang_ky,'status',case when r.den_ngay is not null or r.trang_thai<>'hieu_luc' then 'ended' when r.han_dang_ky<public.cd_today() then 'expired' else 'active' end) order by r.tu_ngay desc,r.created_at desc) from public.cd_cu_tru r left join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=p_id),'[]'),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('code',h.ma_ho,'relation',m.quan_he_voi_chu_ho,'from',m.tu_ngay,'to',m.den_ngay,'reason',m.ly_do_thay_doi) order by m.created_at desc) from public.cd_thanh_vien_ho m join public.cd_ho_gia_dinh h on h.id=m.ho_id where m.cong_dan_id=p_id),'[]'),
 'changes',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'kind',b.loai_bien_dong,'effectiveOn',b.ngay_hieu_luc,'reason',b.ly_do,'at',b.thoi_diem_ghi_nhan) order by b.thoi_diem_ghi_nhan desc) from public.cd_bien_dong b where b.cong_dan_id=p_id),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.ten_tep_goc,'size',f.kich_thuoc_bytes,'mime',f.mime_type,'path',f.object_path)) from public.cd_tep_dinh_kem f where f.giay_to_ho_tich_id=d.id and f.trang_thai='san_sang'),'[]')) order by d.created_at desc) from public.cd_giay_to_ho_tich d where d.cong_dan_id=p_id),'[]'));
end;$$;
create or replace function public.cd_business_bundle() returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return jsonb_build_object(
 'households',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'code',h.ma_ho,'address',h.dia_chi,'from',h.ngay_lap,'status',h.trang_thai,'version',h.row_version,'members',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.ho_ten_khai_sinh,'cccd',c.so_dinh_danh,'relation',m.quan_he_voi_chu_ho,'from',m.tu_ngay) order by (m.quan_he_voi_chu_ho='chu_ho') desc,c.ho_ten_khai_sinh) from public.cd_thanh_vien_ho m join public.cd_cong_dan c on c.id=m.cong_dan_id where m.ho_id=h.id and m.den_ngay is null),'[]')) order by h.ma_ho) from public.cd_ho_gia_dinh h),'[]'),
 'residences',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'citizenId',r.cong_dan_id,'kind',r.loai_cu_tru,'provinceCode',r.tinh_thanh_code,'from',r.tu_ngay,'until',r.han_dang_ky,'expired',coalesce(r.han_dang_ky<public.cd_today(),false))) from public.cd_cu_tru r where r.den_ngay is null and r.trang_thai='hieu_luc'),'[]'),
 'changes',coalesce((select jsonb_agg(to_jsonb(b) order by b.thoi_diem_ghi_nhan desc) from (select b.id,b.cong_dan_id,c.ho_ten_khai_sinh as name,b.loai_bien_dong,b.ngay_hieu_luc,b.ly_do,b.thoi_diem_ghi_nhan from public.cd_bien_dong b join public.cd_cong_dan c on c.id=b.cong_dan_id order by b.thoi_diem_ghi_nhan desc limit 500) b),'[]'));
end;$$;
create or replace function public.cd_household_operation(p_id uuid,p_expected_version integer,p_code text,p_head uuid,p_relation text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;doc jsonb;result jsonb;existing uuid;previous uuid;begin
 actor:=public.cd_require_member();
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise exception 'REQUEST_NOTE_REQUIRED';end if;
 -- Serialize all checked household operations, including changes affecting another citizen.
 perform pg_advisory_xact_lock(73120701);
 select id into existing from public.cd_cong_dan where id=p_id for update;if existing is null then raise exception 'CITIZEN_NOT_FOUND';end if;
 doc:=public.cd_record_doc(p_id);if (doc->>'rowVersion')::integer is distinct from p_expected_version then raise exception 'RECORD_CONFLICT';end if;
 previous:=nullif(doc->>'householdHeadId','')::uuid;
 if coalesce(btrim(p_code),'')='' then
  if p_head is not null then raise exception 'HOUSEHOLD_CODE_REQUIRED';end if;
  doc:=doc||jsonb_build_object('householdCode','','householdHeadId','','householdHeadCccd','','householdHead','','householdRelation','khac');
 else
  if p_head is null then raise exception 'HOUSEHOLD_HEAD_NOT_FOUND';end if;
  if exists(select 1 from public.cd_ho_gia_dinh where ma_ho=btrim(p_code) and trang_thai<>'hoat_dong') then raise exception 'HOUSEHOLD_CODE_RETIRED';end if;
  if p_head=p_id and exists(select 1 from public.cd_ho_gia_dinh h where h.ma_ho=btrim(p_code)) and not exists(select 1 from public.cd_thanh_vien_ho m join public.cd_ho_gia_dinh h on h.id=m.ho_id where h.ma_ho=btrim(p_code) and m.cong_dan_id=p_id and m.den_ngay is null) then raise exception 'HOUSEHOLD_EXISTS';end if;
  if char_length(btrim(p_code))>80 then raise exception 'INVALID_INPUT';end if;
  -- A transfer joins an existing household, unless the selected citizen is the new head.
  if p_head<>p_id and not exists(select 1 from public.cd_ho_gia_dinh h join public.cd_thanh_vien_ho m on m.ho_id=h.id and m.den_ngay is null and m.quan_he_voi_chu_ho='chu_ho' where h.ma_ho=btrim(p_code) and h.trang_thai='hoat_dong' and m.cong_dan_id=p_head) then raise exception 'HOUSEHOLD_HEAD_NOT_FOUND';end if;
  doc:=(doc-'householdHeadVersion')||jsonb_build_object('householdCode',btrim(p_code),'householdHeadId',p_head,'householdHeadCccd','','householdHead','','householdRelation',case when p_id=p_head then 'chu_ho' else p_relation end);
 end if;
 result:=public.cd_write_record(doc,p_expected_version,p_reason,actor,'Nghiệp vụ hộ gia đình');
 update public.cd_ho_gia_dinh h set trang_thai='da_giai_the',ngay_giai_the=public.cd_today(),updated_by=actor where h.trang_thai='hoat_dong' and not exists(select 1 from public.cd_thanh_vien_ho m where m.ho_id=h.id and m.den_ngay is null);
 insert into public.cd_bien_dong(cong_dan_id,nguoi_ghi_nhan_user_id,loai_bien_dong,ngay_hieu_luc,du_lieu_truoc,du_lieu_sau,ly_do) values(p_id,actor,case when doc->>'householdCode'='' then 'tach_khoi_ho' when previous is distinct from p_head and result->>'householdRelation'='chu_ho' then 'doi_chu_ho' else 'chuyen_ho' end,public.cd_today(),null,result,p_reason);
 return result;
end;$$;
create or replace function public.cd_residence_operation(p_id uuid,p_expected_version integer,p_kind text,p_address text,p_province text,p_from date,p_until date,p_reason text,p_end boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;before_doc jsonb;c public.cd_cong_dan;old_res public.cd_cu_tru;unit_id uuid;province text;result jsonb;effective date;begin
 actor:=public.cd_require_member();
 if p_end is null then raise exception 'INVALID_INPUT';end if;
 if p_kind is null or p_kind not in ('thuong_tru','tam_tru','hien_tai') then raise exception 'INVALID_INPUT';end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise exception 'REQUEST_NOTE_REQUIRED';end if;
 select * into c from public.cd_cong_dan where id=p_id for update;if c.id is null then raise exception 'CITIZEN_NOT_FOUND';end if;
 if c.row_version is distinct from p_expected_version then raise exception 'RECORD_CONFLICT';end if;
 before_doc:=public.cd_record_doc(p_id);select * into old_res from public.cd_cu_tru where cong_dan_id=p_id and loai_cu_tru=p_kind and den_ngay is null and trang_thai='hieu_luc' for update;
 effective:=case when p_end then public.cd_today() else p_from end;
 if effective is null or effective>public.cd_today() or effective<c.ngay_sinh or (old_res.id is not null and effective<old_res.tu_ngay) then raise exception 'INVALID_RESIDENCE_DATES';end if;
 if p_end and (p_kind='thuong_tru' or old_res.id is null) then raise exception 'INVALID_RESIDENCE_END';end if;
 if not p_end then
  province:=public.cd_province_code(p_province);if province is null then raise exception 'PROVINCE_REQUIRED';end if;
  if p_address is null or char_length(btrim(p_address)) not between 1 and 200 then raise exception 'ADDRESS_REQUIRED';end if;
  if p_kind='tam_tru' and (p_until is null or p_until<effective) then raise exception 'INVALID_RESIDENCE_DATES';end if;
  if p_kind<>'tam_tru' and p_until is not null then raise exception 'INVALID_RESIDENCE_DATES';end if;
  select id into unit_id from public.cd_don_vi_hc where ten_don_vi=before_doc->>'ward' and trang_thai='hoat_dong';
  if unit_id is null then select id into unit_id from public.cd_don_vi_hc where trang_thai='hoat_dong' order by ma_don_vi limit 1;end if;
 end if;
 if old_res.id is not null then update public.cd_cu_tru set den_ngay=effective,trang_thai='ket_thuc',updated_by=actor where id=old_res.id;end if;
 if not p_end then insert into public.cd_cu_tru(cong_dan_id,loai_cu_tru,don_vi_hc_id,tinh_thanh_code,dia_chi_chi_tiet,dia_chi_day_du_tai_thoi_diem,tu_ngay,han_dang_ky,trang_thai,created_by,updated_by) values(p_id,p_kind,unit_id,province,btrim(p_address),btrim(p_address)||', '||(select name from public.cd_tinh_thanh_cu where code=province),effective,case when p_kind='tam_tru' then p_until end,'hieu_luc',actor,actor);end if;
 update public.cd_cong_dan set updated_by=actor where id=p_id;result:=public.cd_record_doc(p_id);
 insert into public.cd_bien_dong(cong_dan_id,nguoi_ghi_nhan_user_id,loai_bien_dong,ngay_hieu_luc,du_lieu_truoc,du_lieu_sau,ly_do) values(p_id,actor,case when p_end then 'ket_thuc_' else 'dang_ky_' end||p_kind,effective,before_doc,result,p_reason);
 perform public.cd_audit('Cập nhật cư trú','citizen',p_id,before_doc,result,actor);return result;
end;$$;
create or replace function public.cd_save_document(p_citizen uuid,p_data jsonb,p_expected_version integer default null,p_reason text default '') returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;doc public.cd_giay_to_ho_tich;old jsonb;doc_id uuid;issued date;begin
 actor:=public.cd_require_member();perform 1 from public.cd_cong_dan where id=p_citizen for update;if not found then raise exception 'CITIZEN_NOT_FOUND';end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 5 and 1000 then raise exception 'REQUEST_NOTE_REQUIRED';end if;
 if p_data->>'type' is null or p_data->>'type' not in ('khai_sinh','ket_hon','khai_tu','xac_nhan_cu_tru','khac') or coalesce(char_length(btrim(p_data->>'number')),0) not between 1 and 80 or coalesce(char_length(btrim(p_data->>'issuer')),0) not between 2 and 200 or coalesce(char_length(p_data->>'note'),0)>1000 then raise exception 'INVALID_DOCUMENT';end if;
 if coalesce(p_data->>'issuedOn','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_DOCUMENT';end if;issued:=(p_data->>'issuedOn')::date;
 if issued>public.cd_today() or issued<(select ngay_sinh from public.cd_cong_dan where id=p_citizen) then raise exception 'INVALID_DOCUMENT';end if;
 if coalesce(p_data->>'status','hieu_luc') not in ('hieu_luc','da_thu_hoi','da_thay_the') then raise exception 'INVALID_DOCUMENT';end if;
 if nullif(p_data->>'id','') is not null then
  select * into doc from public.cd_giay_to_ho_tich where id=(p_data->>'id')::uuid and cong_dan_id=p_citizen for update;
  if doc.id is null then raise exception 'DOCUMENT_NOT_FOUND';end if;if doc.row_version is distinct from p_expected_version then raise exception 'DOCUMENT_CONFLICT';end if;old:=to_jsonb(doc);doc_id:=doc.id;
 else
  if p_expected_version is not null then raise exception 'DOCUMENT_CONFLICT';end if;
  insert into public.cd_giay_to_ho_tich(cong_dan_id,loai_giay_to,so_giay_to,ngay_cap,co_quan_cap,trang_thai,created_by,updated_by) values(p_citizen,p_data->>'type',btrim(p_data->>'number'),issued,btrim(p_data->>'issuer'),'hieu_luc',actor,actor) returning id into doc_id;
 end if;
 update public.cd_giay_to_ho_tich set loai_giay_to=p_data->>'type',so_giay_to=btrim(p_data->>'number'),ngay_cap=issued,co_quan_cap=btrim(p_data->>'issuer'),trang_thai=coalesce(p_data->>'status','hieu_luc'),ghi_chu=p_data->>'note',updated_by=actor where id=doc_id returning * into doc;
 perform public.cd_audit('Lưu giấy tờ hộ tịch','document',doc_id,old,to_jsonb(doc),actor);return to_jsonb(doc);
end;$$;
create or replace function public.cd_validate_record(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;v text;d date;issued date;expires date; normalized jsonb:='{}';head public.cd_cong_dan;head_member public.cd_thanh_vien_ho;target_house uuid;head_id uuid;key text;code text;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>40000 then raise exception 'INVALID_RECORD';end if;
 foreach k in array array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryFrom','temporaryUntil','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','householdHeadId','householdHeadCccd','householdHeadVersion','provinceCode','temporaryProvinceCode','currentProvinceCode','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'] loop
  v:=btrim(coalesce(p->>k,''));if char_length(v)>(case when k in ('name','otherName') then 80 when k in ('email','occupation') then 100 else 200 end) then raise exception 'FIELD_TOO_LONG:%',k;end if;
  normalized:=normalized||jsonb_build_object(k,v);
 end loop;
 if char_length(normalized->>'name')<2 then raise exception 'INVALID_NAME';end if;
 if normalized->>'cccd' !~ '^000[0-9]{9}$' then raise exception 'FICTIONAL_IDENTIFIER_REQUIRED';end if;
 if normalized->>'phone' !~ '^000[0-9]{7}$' then raise exception 'FICTIONAL_PHONE_REQUIRED';end if;
 if normalized->>'email'<>'' and normalized->>'email' !~ '^[^[:space:]@]+@example[.]invalid$' then raise exception 'FICTIONAL_EMAIL_REQUIRED';end if;
 if normalized->>'dob' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_BIRTH_DATE';end if;
 begin d:=(normalized->>'dob')::date;exception when others then raise exception 'INVALID_BIRTH_DATE';end;
 if d<date '1900-01-01' or d>public.cd_today() then raise exception 'INVALID_BIRTH_DATE';end if;
 if normalized->>'gender' not in ('Nam','Nữ','Khác') then raise exception 'INVALID_GENDER';end if;
 if char_length(normalized->>'address')<1 then raise exception 'ADDRESS_REQUIRED';end if;
 if normalized->>'ward'='' then normalized:=jsonb_set(normalized,'{ward}',to_jsonb((select ten_don_vi from public.cd_don_vi_hc where ma_don_vi='MAU-A')));end if;
 if not exists(select 1 from public.cd_don_vi_hc where ten_don_vi=normalized->>'ward' and trang_thai='hoat_dong') then raise exception 'UNKNOWN_ADMIN_UNIT';end if;
 if normalized->>'cardIssuedOn'<>'' or normalized->>'cardExpiresOn'<>'' or normalized->>'cardIssuer'<>'' then
  begin issued:=(normalized->>'cardIssuedOn')::date;expires:=nullif(normalized->>'cardExpiresOn','')::date;exception when others then raise exception 'INVALID_CARD_DATES';end;
  if issued is null or issued>public.cd_today() or issued<d or (expires is not null and expires<issued) or normalized->>'cardIssuer'='' then raise exception 'INVALID_CARD_DATES';end if;
  if normalized->>'cardStatus' not in ('active','expired','replaced','lost','revoked') then raise exception 'INVALID_CARD_STATUS';end if;
 end if;
 foreach key in array array['provinceCode','temporaryProvinceCode','currentProvinceCode'] loop
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
 return normalized;
end; $$;

create or replace function public.cd_write_record(p_input jsonb,p_expected_version integer,p_reason text,p_actor uuid,p_action text default 'Cập nhật hồ sơ') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 temp_from date;temp_until date;temp_changed boolean;v jsonb;old_doc jsonb;result jsonb;c public.cd_cong_dan;record_id uuid;unit_id uuid;kind text;address_value text;current_res public.cd_cu_tru;
 old_house public.cd_thanh_vien_ho;house_id uuid;relation text;old_card public.cd_the_can_cuoc;card_status text;card_snapshot jsonb;previous_head uuid;previous_head_doc jsonb;
 national public.cd_quoc_tich_cong_dan;marital public.cd_tinh_trang_hon_nhan;relative public.cd_quan_he_nhan_than;field_key text;relation_kind text;province text;selected_head uuid;leader uuid;head_member public.cd_thanh_vien_ho;affected_id uuid;affected jsonb;affected_before jsonb;
begin
 v:=public.cd_validate_record(p_input);record_id:=coalesce(nullif(p_input->>'id','')::uuid,gen_random_uuid());
 select * into c from public.cd_cong_dan where id=record_id for update;
 if found then
  if p_expected_version is null or c.row_version<>p_expected_version then raise exception 'RECORD_CONFLICT';end if;
  old_doc:=public.cd_record_doc(record_id);
 else
  if p_expected_version is not null then raise exception 'RECORD_NOT_FOUND';end if;
  if exists(select 1 from public.cd_cong_dan where so_dinh_danh=v->>'cccd') then raise exception 'DUPLICATE_IDENTIFIER';end if;
 end if;
 select id into unit_id from public.cd_don_vi_hc where ten_don_vi=v->>'ward' and trang_thai='hoat_dong';
 if old_doc is null then
  insert into public.cd_cong_dan(id,so_dinh_danh,ho_ten_khai_sinh,ngay_sinh,do_chinh_xac_ngay_sinh,gioi_tinh,tinh_trang_ca_nhan,trang_thai_ho_so,created_by,updated_by)
  values(record_id,v->>'cccd',v->>'name',(v->>'dob')::date,'day_du',case v->>'gender' when 'Nam' then 'nam' when 'Nữ' then 'nu' else 'khac' end,'con_song','da_xac_nhan',p_actor,p_actor);
 end if;
 update public.cd_cong_dan set so_dinh_danh=v->>'cccd',ho_ten_khai_sinh=v->>'name',ten_goi_khac=nullif(v->>'otherName',''),ngay_sinh=(v->>'dob')::date,do_chinh_xac_ngay_sinh='day_du',
 gioi_tinh=case v->>'gender' when 'Nam' then 'nam' when 'Nữ' then 'nu' else 'khac' end,noi_sinh=nullif(v->>'birthplace',''),noi_dang_ky_khai_sinh=nullif(v->>'birthRegistration',''),que_quan=nullif(v->>'hometown',''),dan_toc=nullif(v->>'ethnicity',''),ton_giao=nullif(v->>'religion',''),nghe_nghiep=nullif(v->>'occupation',''),so_dien_thoai_lien_he=v->>'phone',email_lien_he=nullif(v->>'email',''),updated_by=p_actor where id=record_id;
 -- Updating identity/contact never silently changes the enrolled OTP destination.
 foreach kind in array array['thuong_tru','tam_tru','hien_tai'] loop
  address_value:=v->>case kind when 'thuong_tru' then 'address' when 'tam_tru' then 'temporaryAddress' else 'currentAddress' end;
  province:=nullif(v->>case kind when 'thuong_tru' then 'provinceCode' when 'tam_tru' then 'temporaryProvinceCode' else 'currentProvinceCode' end,'');
  select * into current_res from public.cd_cu_tru where cong_dan_id=record_id and loai_cu_tru=kind and den_ngay is null and trang_thai='hieu_luc' for update;
  temp_changed:=false;
  if kind='tam_tru' and address_value<>'' then
   temp_changed:=current_res.id is null or current_res.dia_chi_chi_tiet<>address_value or current_res.tinh_thanh_code is distinct from province;
   begin
    temp_from:=coalesce(nullif(p_input->>'temporaryFrom','')::date,nullif(p_input->'temporaryRegistration'->>'from','')::date,current_res.tu_ngay,public.cd_today());
    temp_until:=coalesce(nullif(p_input->>'temporaryUntil','')::date,nullif(p_input->'temporaryRegistration'->>'until','')::date,case when not temp_changed then current_res.han_dang_ky end);
   exception when others then raise exception 'INVALID_RESIDENCE_DATES';end;
   if (temp_changed or temp_until is not null) and (temp_until is null or temp_until<temp_from or temp_from>public.cd_today() or temp_from<(v->>'dob')::date or (current_res.id is not null and temp_from<current_res.tu_ngay)) then raise exception 'INVALID_RESIDENCE_DATES';end if;
   temp_changed:=temp_changed or current_res.han_dang_ky is distinct from temp_until or current_res.tu_ngay is distinct from temp_from;
  end if;
  if current_res.id is not null and (current_res.dia_chi_chi_tiet<>address_value or current_res.don_vi_hc_id<>unit_id or current_res.tinh_thanh_code is distinct from province or (kind='tam_tru' and temp_changed)) then
   update public.cd_cu_tru set den_ngay=case when kind='tam_tru' and address_value<>'' then temp_from else public.cd_today() end,trang_thai='ket_thuc',updated_by=p_actor where id=current_res.id;
   current_res.id:=null;
  end if;
  if address_value<>'' and current_res.id is null then
   insert into public.cd_cu_tru(cong_dan_id,loai_cu_tru,don_vi_hc_id,tinh_thanh_code,dia_chi_chi_tiet,dia_chi_day_du_tai_thoi_diem,tu_ngay,han_dang_ky,trang_thai,created_by,updated_by)
   values(record_id,kind,unit_id,province,address_value,address_value||', '||(select name from public.cd_tinh_thanh_cu where code=province),case when kind='tam_tru' then temp_from else public.cd_today() end,case when kind='tam_tru' then temp_until end,'hieu_luc',p_actor,p_actor);
  end if;
 end loop;
 select * into national from public.cd_quoc_tich_cong_dan where cong_dan_id=record_id and den_ngay is null order by created_at desc limit 1;
 if coalesce(national.ghi_chu,'')<>v->>'nationality' then
  update public.cd_quoc_tich_cong_dan set den_ngay=public.cd_today(),updated_by=p_actor where cong_dan_id=record_id and den_ngay is null;
  if v->>'nationality'<>'' then insert into public.cd_quoc_tich_cong_dan(cong_dan_id,ma_quoc_gia,ghi_chu,tu_ngay,created_by,updated_by) values(record_id,case when v->>'nationality'='Việt Nam' then 'VN' else 'KHAC' end,v->>'nationality',public.cd_today(),p_actor,p_actor);end if;
 end if;
 select * into marital from public.cd_tinh_trang_hon_nhan where cong_dan_id=record_id and den_ngay is null limit 1;
 if coalesce(marital.tinh_trang,'')<>v->>'maritalStatus' then
  update public.cd_tinh_trang_hon_nhan set den_ngay=public.cd_today(),updated_by=p_actor where cong_dan_id=record_id and den_ngay is null;
  if v->>'maritalStatus'<>'' then insert into public.cd_tinh_trang_hon_nhan(cong_dan_id,tinh_trang,tu_ngay,created_by,updated_by) values(record_id,v->>'maritalStatus',public.cd_today(),p_actor,p_actor);end if;
 end if;
 foreach field_key in array array['fatherName','motherName','representativeName'] loop
  relation_kind:=case field_key when 'fatherName' then 'cha' when 'motherName' then 'me' else 'dai_dien' end;
  select * into relative from public.cd_quan_he_nhan_than where cong_dan_id=record_id and loai_quan_he=relation_kind and den_ngay is null limit 1;
  if coalesce(relative.ho_ten_ngoai_he_thong,'')<>v->>field_key then
   update public.cd_quan_he_nhan_than set den_ngay=public.cd_today(),updated_by=p_actor where cong_dan_id=record_id and loai_quan_he=relation_kind and den_ngay is null;
   if v->>field_key<>'' then insert into public.cd_quan_he_nhan_than(cong_dan_id,loai_quan_he,ho_ten_ngoai_he_thong,tu_ngay,created_by,updated_by) values(record_id,relation_kind,v->>field_key,public.cd_today(),p_actor,p_actor);end if;
  end if;
 end loop;

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
 if p_input ? 'cardIssuedOn' then
  select * into old_card from public.cd_the_can_cuoc where cong_dan_id=record_id order by created_at desc,id limit 1 for update;
  if v->>'cardIssuedOn'<>'' then
   card_status:=case v->>'cardStatus' when 'active' then 'con_hieu_luc' when 'expired' then 'het_han' when 'replaced' then 'da_thay_the' when 'lost' then 'mat' else 'thu_hoi' end;
   if old_card.id is null or old_card.ngay_cap is distinct from (v->>'cardIssuedOn')::date or old_card.ngay_het_han is distinct from nullif(v->>'cardExpiresOn','')::date or old_card.noi_cap is distinct from v->>'cardIssuer' or old_card.so_tren_giay_to is distinct from v->>'cccd' then
    if old_card.id is not null then update public.cd_the_can_cuoc set trang_thai='da_thay_the',ly_do_ngung_hieu_luc='Cấp đổi thông tin thẻ',updated_by=p_actor where id=old_card.id;end if;
    card_snapshot:=jsonb_build_object('fullName',v->>'name','dob',v->>'dob','gender',v->>'gender','nationality',v->>'nationality','hometown',v->>'hometown','address',(v->>'address')||', '||(select name from public.cd_tinh_thanh_cu where code=v->>'provinceCode'));
    insert into public.cd_the_can_cuoc(cong_dan_id,loai_giay_to,so_tren_giay_to,ngay_cap,noi_cap,ngay_het_han,trang_thai,thay_the_giay_to_id,phien_ban_mau,thong_tin_tren_the,ly_do_cap,created_by,updated_by)
    values(record_id,'cccd',v->>'cccd',(v->>'cardIssuedOn')::date,v->>'cardIssuer',nullif(v->>'cardExpiresOn','')::date,card_status,old_card.id,'cccd',card_snapshot,case when old_card.id is null then 'cap_lan_dau' else 'cap_doi' end,p_actor,p_actor);
   else update public.cd_the_can_cuoc set trang_thai=card_status,updated_by=p_actor where id=old_card.id;end if;
  elsif old_card.id is not null then
   update public.cd_the_can_cuoc set trang_thai='thu_hoi',ngay_thu_hoi=public.cd_today(),ly_do_ngung_hieu_luc='Thành viên gỡ thông tin thẻ hiện tại',updated_by=p_actor where id=old_card.id;
  end if;
 end if;
 result:=public.cd_record_doc(record_id);
 perform public.cd_audit(case when old_doc is null then 'Thêm hồ sơ' else p_action end,'citizen',record_id,old_doc,result,p_actor);
 if old_doc is not null then
  insert into public.cd_bien_dong(cong_dan_id,nguoi_ghi_nhan_user_id,loai_bien_dong,ngay_hieu_luc,du_lieu_truoc,du_lieu_sau,ly_do,thoi_diem_ghi_nhan)
  values(record_id,p_actor,'dieu_chinh_nhan_than',public.cd_today(),old_doc,result,coalesce(nullif(p_reason,''),p_action),clock_timestamp());
 end if;
 return result;
end;$$;

create or replace function public.cd_record_doc(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'id',c.id,'cccd',c.so_dinh_danh,'name',c.ho_ten_khai_sinh,'otherName',coalesce(c.ten_goi_khac,''),'dob',c.ngay_sinh,'gender',case c.gioi_tinh when 'nam' then 'Nam' when 'nu' then 'Nữ' else 'Khác' end,
 'phone',coalesce(c.so_dien_thoai_lien_he,''),'email',coalesce(c.email_lien_he,''),'occupation',coalesce(c.nghe_nghiep,''),'ethnicity',coalesce(c.dan_toc,''),'religion',coalesce(c.ton_giao,''),'hometown',coalesce(c.que_quan,''),'birthplace',coalesce(c.noi_sinh,''),'birthRegistration',coalesce(c.noi_dang_ky_khai_sinh,''),
 'nationality',coalesce((select coalesce(nullif(n.ghi_chu,''),n.ma_quoc_gia) from public.cd_quoc_tich_cong_dan n where n.cong_dan_id=c.id and n.den_ngay is null order by n.created_at desc limit 1),''),
 'maritalStatus',coalesce((select h.tinh_trang from public.cd_tinh_trang_hon_nhan h where h.cong_dan_id=c.id and h.den_ngay is null limit 1),''),
 'address',coalesce((select r.dia_chi_chi_tiet from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'ward',coalesce((select u.ten_don_vi from public.cd_cu_tru r join public.cd_don_vi_hc u on u.id=r.don_vi_hc_id where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'temporaryAddress',coalesce((select r.dia_chi_chi_tiet from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='tam_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'currentAddress',coalesce((select r.dia_chi_chi_tiet from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='hien_tai' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),

 'provinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'provinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'temporaryProvinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='tam_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'temporaryProvinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='tam_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'currentProvinceCode',coalesce((select r.tinh_thanh_code from public.cd_cu_tru r where r.cong_dan_id=c.id and r.loai_cu_tru='hien_tai' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'currentProvinceName',coalesce((select p.name from public.cd_cu_tru r join public.cd_tinh_thanh_cu p on p.code=r.tinh_thanh_code where r.cong_dan_id=c.id and r.loai_cu_tru='hien_tai' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),''),
 'householdHeadId',public.cd_household_head(c.id),
 'householdHeadCccd',coalesce((select so_dinh_danh from public.cd_cong_dan where id=public.cd_household_head(c.id)),''),
 'householdHeadVersion',(select row_version from public.cd_cong_dan where id=public.cd_household_head(c.id)),
 'householdCode',coalesce((select h.ma_ho from public.cd_thanh_vien_ho m join public.cd_ho_gia_dinh h on h.id=m.ho_id where m.cong_dan_id=c.id and m.den_ngay is null limit 1),''),
 'householdRelation',coalesce((select m.quan_he_voi_chu_ho from public.cd_thanh_vien_ho m where m.cong_dan_id=c.id and m.den_ngay is null limit 1),''),
 'householdHead',coalesce((select head.ho_ten_khai_sinh from public.cd_thanh_vien_ho own join public.cd_thanh_vien_ho leader on leader.ho_id=own.ho_id and leader.quan_he_voi_chu_ho='chu_ho' and leader.den_ngay is null join public.cd_cong_dan head on head.id=leader.cong_dan_id where own.cong_dan_id=c.id and own.den_ngay is null limit 1),''),
 'fatherName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='cha' and r.den_ngay is null limit 1),''),
 'motherName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='me' and r.den_ngay is null limit 1),''),
 'representativeName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='dai_dien' and r.den_ngay is null limit 1),''),
 'account',coalesce(a.trang_thai,'not-issued'),'accountVersion',coalesce(a.row_version,0),'rowVersion',c.row_version,'updatedAt',c.updated_at,
 'identityCard',(select jsonb_build_object('id',t.id,'type',t.phien_ban_mau,'number',t.so_tren_giay_to,'fullName',t.thong_tin_tren_the->>'fullName','dob',t.thong_tin_tren_the->>'dob','gender',t.thong_tin_tren_the->>'gender','nationality',t.thong_tin_tren_the->>'nationality','hometown',t.thong_tin_tren_the->>'hometown','address',t.thong_tin_tren_the->>'address','issuedOn',t.ngay_cap,'expiresOn',t.ngay_het_han,'issuer',t.noi_cap,'status',case t.trang_thai when 'con_hieu_luc' then 'active' when 'het_han' then 'expired' when 'da_thay_the' then 'replaced' when 'mat' then 'lost' else 'revoked' end) from public.cd_the_can_cuoc t where t.cong_dan_id=c.id order by t.created_at desc,t.id limit 1)
 ) || public.cd_residence_summary(c.id) from public.cd_cong_dan c left join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id where c.id=p_id;
$$;

update public.cd_portal_meta set schema_version=3 where id=1;
revoke all on function public.cd_residence_summary(uuid) from public,anon,authenticated;
revoke all on function public.cd_business_detail(uuid),public.cd_business_bundle(),public.cd_household_operation(uuid,integer,text,uuid,text,text),public.cd_residence_operation(uuid,integer,text,text,text,date,date,text,boolean),public.cd_save_document(uuid,jsonb,integer,text) from public,anon;
grant execute on function public.cd_business_detail(uuid),public.cd_business_bundle(),public.cd_household_operation(uuid,integer,text,uuid,text,text),public.cd_residence_operation(uuid,integer,text,text,text,date,date,text,boolean),public.cd_save_document(uuid,jsonb,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
