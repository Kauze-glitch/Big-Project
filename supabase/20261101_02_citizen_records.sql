begin;
create or replace function public.cd_audit(p_action text,p_kind text,p_id uuid,p_before jsonb,p_after jsonb,p_actor uuid default auth.uid()) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare event_id uuid;begin
 insert into public.cd_nhat_ky_thao_tac(actor_user_id,actor_label,hanh_dong,doi_tuong_loai,doi_tuong_id,truoc_thay_doi,sau_thay_doi,request_id,thoi_diem)
 values(p_actor,public.cd_actor_label(p_actor),p_action,p_kind,p_id,p_before,p_after,gen_random_uuid(),clock_timestamp()) returning id into event_id;return event_id;
end; $$;
create or replace function public.cd_validate_record(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;v text;d date;issued date;expires date; normalized jsonb:='{}';begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>40000 then raise exception 'INVALID_RECORD';end if;
 foreach k in array array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'] loop
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
 if not exists(select 1 from public.cd_don_vi_hc where ten_don_vi=normalized->>'ward' and trang_thai='hoat_dong') then raise exception 'UNKNOWN_ADMIN_UNIT';end if;
 if normalized->>'cardIssuedOn'<>'' or normalized->>'cardExpiresOn'<>'' or normalized->>'cardIssuer'<>'' then
  begin issued:=(normalized->>'cardIssuedOn')::date;expires:=nullif(normalized->>'cardExpiresOn','')::date;exception when others then raise exception 'INVALID_CARD_DATES';end;
  if issued is null or issued>public.cd_today() or issued<d or (expires is not null and expires<issued) or normalized->>'cardIssuer'='' then raise exception 'INVALID_CARD_DATES';end if;
  if normalized->>'cardStatus' not in ('active','expired','replaced','lost','revoked') then raise exception 'INVALID_CARD_STATUS';end if;
 end if;
 return normalized;
end; $$;
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
 'householdCode',coalesce((select h.ma_ho from public.cd_thanh_vien_ho m join public.cd_ho_gia_dinh h on h.id=m.ho_id where m.cong_dan_id=c.id and m.den_ngay is null limit 1),''),
 'householdRelation',coalesce((select m.quan_he_voi_chu_ho from public.cd_thanh_vien_ho m where m.cong_dan_id=c.id and m.den_ngay is null limit 1),''),
 'householdHead',coalesce((select head.ho_ten_khai_sinh from public.cd_thanh_vien_ho own join public.cd_thanh_vien_ho leader on leader.ho_id=own.ho_id and leader.quan_he_voi_chu_ho='chu_ho' and leader.den_ngay is null join public.cd_cong_dan head on head.id=leader.cong_dan_id where own.cong_dan_id=c.id and own.den_ngay is null limit 1),''),
 'fatherName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='cha' and r.den_ngay is null limit 1),''),
 'motherName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='me' and r.den_ngay is null limit 1),''),
 'representativeName',coalesce((select coalesce(other.ho_ten_khai_sinh,r.ho_ten_ngoai_he_thong) from public.cd_quan_he_nhan_than r left join public.cd_cong_dan other on other.id=r.nguoi_lien_quan_id where r.cong_dan_id=c.id and r.loai_quan_he='dai_dien' and r.den_ngay is null limit 1),''),
 'account',coalesce(a.trang_thai,'not-issued'),'accountVersion',coalesce(a.row_version,0),'rowVersion',c.row_version,'updatedAt',c.updated_at,
 'identityCard',(select jsonb_build_object('id',t.id,'type',t.phien_ban_mau,'number',t.so_tren_giay_to,'fullName',t.thong_tin_tren_the->>'fullName','dob',t.thong_tin_tren_the->>'dob','gender',t.thong_tin_tren_the->>'gender','nationality',t.thong_tin_tren_the->>'nationality','hometown',t.thong_tin_tren_the->>'hometown','address',t.thong_tin_tren_the->>'address','issuedOn',t.ngay_cap,'expiresOn',t.ngay_het_han,'issuer',t.noi_cap,'status',case t.trang_thai when 'con_hieu_luc' then 'active' when 'het_han' then 'expired' when 'da_thay_the' then 'replaced' when 'mat' then 'lost' else 'revoked' end) from public.cd_the_can_cuoc t where t.cong_dan_id=c.id order by t.created_at desc,t.id limit 1)
 ) from public.cd_cong_dan c left join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id where c.id=p_id;
$$;
create or replace function public.cd_request_doc(p_id uuid,p_member boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'code',r.ma_tra_cuu,'citizenId',r.cong_dan_id,'citizenName',c.ho_ten_khai_sinh,'title',r.tieu_de,'type',r.loai_yeu_cau,'description',r.noi_dung,'changes',coalesce(r.thay_doi_de_nghi,'{}'),'status',r.trang_thai,'rowVersion',r.row_version,'baseVersion',r.citizen_base_version,'submittedOn',r.ngay_nop::date,'createdAt',r.created_at,'updatedAt',r.updated_at,'unit',u.ten_don_vi,'assignedId',r.can_bo_phu_trach_id,'assignedName',cb.ho_ten,'result',coalesce(r.ket_qua,r.ly_do_tu_choi,''),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'date',h.thoi_diem::date,'at',h.thoi_diem,'title',h.hanh_dong,'description',h.noi_dung,'actor',public.cd_actor_label(h.nguoi_thuc_hien_user_id),'from',h.trang_thai_truoc,'to',h.trang_thai_sau) order by h.thoi_diem,h.id) from public.cd_lich_su_xu_ly h where h.ho_so_id=r.id and (p_member or h.hien_cho_cong_dan)),'[]'))
 from public.cd_ho_so_yeu_cau r join public.cd_cong_dan c on c.id=r.cong_dan_id join public.cd_don_vi_hc u on u.id=r.don_vi_tiep_nhan_id left join public.cd_can_bo cb on cb.id=r.can_bo_phu_trach_id where r.id=p_id;
$$;
create or replace function public.cd_write_record(p_input jsonb,p_expected_version integer,p_reason text,p_actor uuid,p_action text default 'Cập nhật hồ sơ') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v jsonb;old_doc jsonb;result jsonb;c public.cd_cong_dan;record_id uuid;unit_id uuid;kind text;address_value text;current_res public.cd_cu_tru;
 old_house public.cd_thanh_vien_ho;house_id uuid;relation text;old_card public.cd_the_can_cuoc;card_status text;card_snapshot jsonb;previous_head uuid;previous_head_doc jsonb;
 national public.cd_quoc_tich_cong_dan;marital public.cd_tinh_trang_hon_nhan;relative public.cd_quan_he_nhan_than;field_key text;relation_kind text;
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
  select * into current_res from public.cd_cu_tru where cong_dan_id=record_id and loai_cu_tru=kind and den_ngay is null and trang_thai='hieu_luc' for update;
  if current_res.id is not null and (current_res.dia_chi_chi_tiet<>address_value or current_res.don_vi_hc_id<>unit_id) then
   update public.cd_cu_tru set den_ngay=public.cd_today(),trang_thai='ket_thuc',updated_by=p_actor where id=current_res.id;
   current_res.id:=null;
  end if;
  if address_value<>'' and current_res.id is null then
   insert into public.cd_cu_tru(cong_dan_id,loai_cu_tru,don_vi_hc_id,dia_chi_chi_tiet,dia_chi_day_du_tai_thoi_diem,tu_ngay,trang_thai,created_by,updated_by)
   values(record_id,kind,unit_id,address_value,address_value||', '||(v->>'ward'),public.cd_today(),'hieu_luc',p_actor,p_actor);
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
  select id into house_id from public.cd_ho_gia_dinh where ma_ho=v->>'householdCode' and trang_thai='hoat_dong' for update;
  if house_id is null then
   insert into public.cd_ho_gia_dinh(ma_ho,don_vi_hc_id,dia_chi,ngay_lap,trang_thai,created_by,updated_by) values(v->>'householdCode',unit_id,v->>'address',public.cd_today(),'hoat_dong',p_actor,p_actor) returning id into house_id;
  end if;
  relation:=coalesce(nullif(v->>'householdRelation',''),'khac');
  if not exists(select 1 from public.cd_thanh_vien_ho where ho_id=house_id and quan_he_voi_chu_ho='chu_ho' and den_ngay is null and cong_dan_id<>record_id) then relation:='chu_ho';end if;
  if relation not in ('chu_ho','vo_chong','con','cha_me','khac') then raise exception 'INVALID_HOUSEHOLD_RELATION';end if;
 else house_id:=null;relation:=null;
 end if;
 if old_house.id is not null and (old_house.ho_id is distinct from house_id or old_house.quan_he_voi_chu_ho is distinct from relation) then
  if old_house.quan_he_voi_chu_ho='chu_ho' and old_house.ho_id is distinct from house_id and exists(select 1 from public.cd_thanh_vien_ho where ho_id=old_house.ho_id and cong_dan_id<>record_id and den_ngay is null) then raise exception 'HOUSEHOLD_HEAD_REQUIRED';end if;
  update public.cd_thanh_vien_ho set den_ngay=public.cd_today(),ly_do_thay_doi=coalesce(nullif(p_reason,''),'Cập nhật hồ sơ'),updated_by=p_actor where id=old_house.id;old_house.id:=null;
 end if;
 if house_id is not null and old_house.id is null then
  if relation='chu_ho' then
   select cong_dan_id into previous_head from public.cd_thanh_vien_ho where ho_id=house_id and quan_he_voi_chu_ho='chu_ho' and den_ngay is null;
   if previous_head is not null then
    perform 1 from public.cd_cong_dan where id=previous_head for update;
    previous_head_doc:=public.cd_record_doc(previous_head);
   end if;
   with closed as (
    update public.cd_thanh_vien_ho set den_ngay=public.cd_today(),ly_do_thay_doi='Thay đổi chủ hộ',updated_by=p_actor
    where ho_id=house_id and quan_he_voi_chu_ho='chu_ho' and den_ngay is null returning ho_id,cong_dan_id
   ) insert into public.cd_thanh_vien_ho(ho_id,cong_dan_id,quan_he_voi_chu_ho,tu_ngay,ly_do_thay_doi,created_by,updated_by)
    select ho_id,cong_dan_id,'khac',public.cd_today(),'Thay đổi chủ hộ',p_actor,p_actor from closed;
   if previous_head is not null then
    update public.cd_cong_dan set updated_by=p_actor where id=previous_head;
    perform public.cd_audit('Thay đổi chủ hộ','citizen',previous_head,previous_head_doc,public.cd_record_doc(previous_head),p_actor);
   end if;
  end if;
  insert into public.cd_thanh_vien_ho(ho_id,cong_dan_id,quan_he_voi_chu_ho,tu_ngay,ly_do_thay_doi,created_by,updated_by) values(house_id,record_id,relation,public.cd_today(),nullif(p_reason,''),p_actor,p_actor);
 end if;
 if p_input ? 'cardIssuedOn' then
  select * into old_card from public.cd_the_can_cuoc where cong_dan_id=record_id order by created_at desc,id limit 1 for update;
  if v->>'cardIssuedOn'<>'' then
   card_status:=case v->>'cardStatus' when 'active' then 'con_hieu_luc' when 'expired' then 'het_han' when 'replaced' then 'da_thay_the' when 'lost' then 'mat' else 'thu_hoi' end;
   if old_card.id is null or old_card.ngay_cap is distinct from (v->>'cardIssuedOn')::date or old_card.ngay_het_han is distinct from nullif(v->>'cardExpiresOn','')::date or old_card.noi_cap is distinct from v->>'cardIssuer' or old_card.so_tren_giay_to is distinct from v->>'cccd' then
    if old_card.id is not null then update public.cd_the_can_cuoc set trang_thai='da_thay_the',ly_do_ngung_hieu_luc='Cấp đổi thông tin thẻ',updated_by=p_actor where id=old_card.id;end if;
    card_snapshot:=jsonb_build_object('fullName',v->>'name','dob',v->>'dob','gender',v->>'gender','nationality',v->>'nationality','hometown',v->>'hometown','address',(v->>'address')||', '||(v->>'ward'));
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
create or replace function public.cd_save_record(p_data jsonb,p_expected_version integer default null,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;begin actor:=public.cd_require_member();return public.cd_write_record(p_data,p_expected_version,p_reason,actor);end;$$;
create or replace function public.cd_member_bundle() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return jsonb_build_object(
 'records',coalesce((select jsonb_agg(public.cd_record_doc(id) order by updated_at desc,id) from public.cd_cong_dan),'[]'),
 'requests',coalesce((select jsonb_agg(public.cd_request_doc(id,true) order by created_at desc,id) from public.cd_ho_so_yeu_cau where trang_thai<>'nhap' or nguoi_nop_user_id=auth.uid()),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',hanh_dong,'name',coalesce(sau_thay_doi->>'name',actor_label),'actor',actor_label,'kind',doi_tuong_loai,'entityId',doi_tuong_id,'at',thoi_diem) order by thoi_diem desc) from (select * from public.cd_nhat_ky_thao_tac order by thoi_diem desc limit 30) recent),'[]'),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',ten_don_vi) order by ten_don_vi) from public.cd_don_vi_hc where trang_thai='hoat_dong'),'[]'),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',ho_ten) order by ho_ten) from public.cd_can_bo where trang_thai='dang_cong_tac'),'[]')
 );end;$$;
create or replace function public.cd_citizen_bundle() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare citizen uuid;begin citizen:=public.cd_current_citizen();if citizen is null then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;
 return jsonb_build_object('record',public.cd_record_doc(citizen),'requests',coalesce((select jsonb_agg(public.cd_request_doc(id,false) order by created_at desc) from public.cd_ho_so_yeu_cau where cong_dan_id=citizen),'[]'));
end;$$;
create or replace function public.cd_record_history(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return coalesce((select jsonb_agg(to_jsonb(h) order by h.thoi_diem desc) from (select id,actor_label,hanh_dong,truoc_thay_doi,sau_thay_doi,thoi_diem from public.cd_nhat_ky_thao_tac where doi_tuong_loai='citizen' and doi_tuong_id=p_id order by thoi_diem desc limit 100) h),'[]');end;$$;
create or replace function public.cd_restore_record(p_id uuid,p_revision uuid,p_expected_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;snapshot jsonb;card jsonb;begin
 actor:=public.cd_require_member();if char_length(btrim(p_reason))<5 then raise exception 'RESTORE_REASON_REQUIRED';end if;
 select sau_thay_doi into snapshot from public.cd_nhat_ky_thao_tac where id=p_revision and doi_tuong_loai='citizen' and doi_tuong_id=p_id;
 if snapshot is null then raise exception 'REVISION_NOT_FOUND';end if;
 card:=snapshot->'identityCard';snapshot:=snapshot||jsonb_build_object('id',p_id);
 if card is not null and jsonb_typeof(card)='object' then snapshot:=snapshot||jsonb_build_object('cardIssuedOn',card->>'issuedOn','cardExpiresOn',card->>'expiresOn','cardIssuer',card->>'issuer','cardStatus',card->>'status');end if;
 return public.cd_write_record(snapshot,p_expected_version,p_reason,actor,'Khôi phục hồ sơ');
end;$$;
-- Deny public execution of internal helpers, including SECURITY DEFINER functions.
do $permissions$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cd\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname=any(array['cd_is_member','cd_current_citizen','cd_member_bundle','cd_citizen_bundle','cd_save_record','cd_record_history','cd_restore_record','cd_save_request','cd_process_request','cd_import_commit','cd_import_batches','cd_erd_load','cd_erd_save','cd_section_history','cd_restore_section','cd_account_state']) then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if f.proname='cd_portal_status' then execute format('grant execute on function %s to anon,authenticated',f.signature);end if;
 end loop;
end $permissions$;
commit;
