begin;
create table if not exists public.cd_tinh_thanh_cu (code text primary key,name text not null unique,snapshot date not null default date '2024-12-31');
insert into public.cd_tinh_thanh_cu(code,name) values
('HA_NOI','Hà Nội'),
('HA_GIANG','Hà Giang'),
('CAO_BANG','Cao Bằng'),
('BAC_KAN','Bắc Kạn'),
('TUYEN_QUANG','Tuyên Quang'),
('LAO_CAI','Lào Cai'),
('DIEN_BIEN','Điện Biên'),
('LAI_CHAU','Lai Châu'),
('SON_LA','Sơn La'),
('YEN_BAI','Yên Bái'),
('HOA_BINH','Hòa Bình'),
('THAI_NGUYEN','Thái Nguyên'),
('LANG_SON','Lạng Sơn'),
('QUANG_NINH','Quảng Ninh'),
('BAC_GIANG','Bắc Giang'),
('BAC_NINH','Bắc Ninh'),
('PHU_THO','Phú Thọ'),
('VINH_PHUC','Vĩnh Phúc'),
('HAI_DUONG','Hải Dương'),
('HAI_PHONG','Hải Phòng'),
('HUNG_YEN','Hưng Yên'),
('THAI_BINH','Thái Bình'),
('HA_NAM','Hà Nam'),
('NAM_DINH','Nam Định'),
('NINH_BINH','Ninh Bình'),
('THANH_HOA','Thanh Hóa'),
('NGHE_AN','Nghệ An'),
('HA_TINH','Hà Tĩnh'),
('QUANG_BINH','Quảng Bình'),
('QUANG_TRI','Quảng Trị'),
('THUA_THIEN_HUE','Thừa Thiên Huế'),
('DA_NANG','Đà Nẵng'),
('QUANG_NAM','Quảng Nam'),
('QUANG_NGAI','Quảng Ngãi'),
('BINH_DINH','Bình Định'),
('PHU_YEN','Phú Yên'),
('KHANH_HOA','Khánh Hòa'),
('NINH_THUAN','Ninh Thuận'),
('BINH_THUAN','Bình Thuận'),
('KON_TUM','Kon Tum'),
('GIA_LAI','Gia Lai'),
('DAK_LAK','Đắk Lắk'),
('DAK_NONG','Đắk Nông'),
('LAM_DONG','Lâm Đồng'),
('BINH_PHUOC','Bình Phước'),
('TAY_NINH','Tây Ninh'),
('BINH_DUONG','Bình Dương'),
('DONG_NAI','Đồng Nai'),
('BA_RIA_VUNG_TAU','Bà Rịa - Vũng Tàu'),
('HO_CHI_MINH','Hồ Chí Minh'),
('LONG_AN','Long An'),
('TIEN_GIANG','Tiền Giang'),
('BEN_TRE','Bến Tre'),
('TRA_VINH','Trà Vinh'),
('VINH_LONG','Vĩnh Long'),
('DONG_THAP','Đồng Tháp'),
('AN_GIANG','An Giang'),
('KIEN_GIANG','Kiên Giang'),
('CAN_THO','Cần Thơ'),
('HAU_GIANG','Hậu Giang'),
('SOC_TRANG','Sóc Trăng'),
('BAC_LIEU','Bạc Liêu'),
('CA_MAU','Cà Mau') on conflict(code) do nothing;
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
create or replace function public.cd_validate_record(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;v text;d date;issued date;expires date; normalized jsonb:='{}';head public.cd_cong_dan;head_member public.cd_thanh_vien_ho;target_house uuid;head_id uuid;key text;code text;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>40000 then raise exception 'INVALID_RECORD';end if;
 foreach k in array array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','householdHeadId','householdHeadCccd','householdHeadVersion','provinceCode','temporaryProvinceCode','currentProvinceCode','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'] loop
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
 ) from public.cd_cong_dan c left join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id where c.id=p_id;
$$;
create or replace function public.cd_write_record(p_input jsonb,p_expected_version integer,p_reason text,p_actor uuid,p_action text default 'Cập nhật hồ sơ') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v jsonb;old_doc jsonb;result jsonb;c public.cd_cong_dan;record_id uuid;unit_id uuid;kind text;address_value text;current_res public.cd_cu_tru;
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
  if current_res.id is not null and (current_res.dia_chi_chi_tiet<>address_value or current_res.don_vi_hc_id<>unit_id or current_res.tinh_thanh_code is distinct from province) then
   update public.cd_cu_tru set den_ngay=public.cd_today(),trang_thai='ket_thuc',updated_by=p_actor where id=current_res.id;
   current_res.id:=null;
  end if;
  if address_value<>'' and current_res.id is null then
   insert into public.cd_cu_tru(cong_dan_id,loai_cu_tru,don_vi_hc_id,tinh_thanh_code,dia_chi_chi_tiet,dia_chi_day_du_tai_thoi_diem,tu_ngay,trang_thai,created_by,updated_by)
   values(record_id,kind,unit_id,province,address_value,address_value||', '||(select name from public.cd_tinh_thanh_cu where code=province),public.cd_today(),'hieu_luc',p_actor,p_actor);
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
create or replace function public.cd_restore_record(p_id uuid,p_revision uuid,p_expected_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;snapshot jsonb;card jsonb;begin
 actor:=public.cd_require_member();if char_length(btrim(p_reason))<5 then raise exception 'RESTORE_REASON_REQUIRED';end if;
 select sau_thay_doi into snapshot from public.cd_nhat_ky_thao_tac where id=p_revision and doi_tuong_loai='citizen' and doi_tuong_id=p_id;
 if snapshot is null then raise exception 'REVISION_NOT_FOUND';end if;
 card:=snapshot->'identityCard';snapshot:=(snapshot-'householdHeadVersion')||jsonb_build_object('id',p_id);
 if card is not null and jsonb_typeof(card)='object' then snapshot:=snapshot||jsonb_build_object('cardIssuedOn',card->>'issuedOn','cardExpiresOn',card->>'expiresOn','cardIssuer',card->>'issuer','cardStatus',card->>'status');end if;
 return public.cd_write_record(snapshot,p_expected_version,p_reason,actor,'Khôi phục hồ sơ');
end;$$;
create or replace function public.cd_import_household(p_doc jsonb) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
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
create or replace function public.cd_import_preview(p_rows jsonb,p_mode text default 'create') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare row_item jsonb;row_doc jsonb;existing public.cd_cong_dan;results jsonb:='[]';message text;line integer;normalized jsonb;begin
 perform public.cd_require_member();
 if p_mode not in ('create','merge') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 or pg_column_size(p_rows)>2000000 then raise exception 'INVALID_IMPORT_ROWS';end if;
 for row_item in select value from jsonb_array_elements(p_rows) loop
  message:=null;normalized:=null;existing:=null;
  begin
   line:=(row_item->>'row')::integer;if line<2 or line>100000 then raise exception 'INVALID_ROW_NUMBER';end if;
   row_doc:=row_item->'data';if jsonb_typeof(row_doc)<>'object' then raise exception 'INVALID_RECORD';end if;
   if (select count(*) from jsonb_array_elements(p_rows) x where x->'data'->>'cccd'=row_doc->>'cccd')>1 then raise exception 'DUPLICATE_IN_FILE';end if;
   select * into existing from public.cd_cong_dan where so_dinh_danh=btrim(row_doc->>'cccd');
   if existing.id is not null and p_mode='create' then raise exception 'DUPLICATE_IDENTIFIER';end if;
   normalized:=case when existing.id is not null then (public.cd_record_doc(existing.id)-case when row_doc ? 'householdHeadCccd' then 'householdHeadId' else '__unused' end)||row_doc else row_doc-'id' end;
   normalized:=public.cd_import_household(normalized);normalized:=normalized||public.cd_validate_record(normalized);
  exception when others then message:=sqlerrm;end;
  results:=results||jsonb_build_array(jsonb_build_object('row',coalesce(line,0),'data',normalized,'error',message,'action',case when existing.id is null then 'create' else 'update' end,'expectedVersion',existing.row_version));
 end loop;return results;
end;$$;
create or replace function public.cd_import_commit(p_rows jsonb,p_mode text,p_filename text,p_idempotency uuid,p_allow_partial boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;member_id uuid;batch public.cd_dot_nhap_du_lieu;batch_id uuid;fingerprint text;row_item jsonb;raw jsonb;doc jsonb;checked jsonb;existing public.cd_cong_dan;saved jsonb;line integer;message text;results jsonb:='[]';result jsonb;created_count integer:=0;updated_count integer:=0;failed_count integer:=0;begin
 actor:=public.cd_require_member();member_id:=public.cd_member_id(actor);
 if p_idempotency is null or p_mode not in ('create','merge') or char_length(p_filename) not between 1 and 180 or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 or pg_column_size(p_rows)>2000000 then raise exception 'INVALID_IMPORT_ROWS';end if;
 if (select count(distinct x->>'row') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then raise exception 'INVALID_ROW_NUMBER';end if;
 fingerprint:=md5(p_rows::text||p_mode||p_filename||p_allow_partial::text);
 insert into public.cd_dot_nhap_du_lieu(nguoi_nhap_id,loai_du_lieu,ten_tep,phien_ban_mau,che_do,trang_thai,idempotency_key,bat_dau_luc,input_fingerprint,created_by,updated_by)
 values(member_id,'cong_dan',p_filename,'citizen-v1',p_mode,'dang_nhap',p_idempotency,clock_timestamp(),fingerprint,actor,actor)
 on conflict(idempotency_key) do nothing returning id into batch_id;
 if batch_id is null then
  select * into batch from public.cd_dot_nhap_du_lieu where idempotency_key=p_idempotency for update;
  if batch.nguoi_nhap_id<>member_id or batch.input_fingerprint<>fingerprint then raise exception 'IMPORT_KEY_CONFLICT';end if;
  if batch.ket_qua is not null then return batch.ket_qua;end if;
  raise exception 'IMPORT_IN_PROGRESS';
 end if;
 for row_item in select value from jsonb_array_elements(p_rows) loop
  message:=null;saved:=null;line:=0;existing:=null;raw:=row_item->'data';
  begin
   line:=(row_item->>'row')::integer;if line<2 or line>100000 then raise exception 'INVALID_ROW_NUMBER';end if;
   if jsonb_typeof(raw)<>'object' then raise exception 'INVALID_RECORD';end if;
   if coalesce(jsonb_array_length(row_item->'clientErrors'),0)>0 then raise exception 'INVALID_IMPORT_CELL';end if;
   if (select count(*) from jsonb_array_elements(p_rows) x where x->'data'->>'cccd'=raw->>'cccd')>1 then raise exception 'DUPLICATE_IN_FILE';end if;
   select * into existing from public.cd_cong_dan where so_dinh_danh=btrim(raw->>'cccd') for update;
   if existing.id is not null then
    if p_mode='create' then raise exception 'DUPLICATE_IDENTIFIER';end if;
    if existing.row_version is distinct from nullif(row_item->>'expectedVersion','')::integer then raise exception 'RECORD_CONFLICT';end if;
    doc:=(public.cd_record_doc(existing.id)-case when raw ? 'householdHeadCccd' then 'householdHeadId' else '__unused' end)||raw||jsonb_build_object('id',existing.id);
   else
    if nullif(row_item->>'expectedVersion','') is not null then raise exception 'RECORD_CONFLICT';end if;
    doc:=raw-'id';
   end if;
   doc:=public.cd_import_household(doc);
   saved:=public.cd_write_record(doc,existing.row_version,'Nhập tệp '||p_filename,actor,'Nhập dữ liệu hồ sơ');
  exception when others then message:=sqlerrm;end;
  if message is not null then failed_count:=failed_count+1;elsif existing.id is null then created_count:=created_count+1;else updated_count:=updated_count+1;end if;
  insert into public.cd_dong_nhap(dot_nhap_id,so_dong,du_lieu_goc,du_lieu_chuan_hoa,loi_kiem_tra,trang_thai,cong_dan_id,created_by,updated_by)
  values(batch_id,line,coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(raw)='object' then raw else '{}'::jsonb end) where key=any(array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','householdHeadCccd','provinceCode','temporaryProvinceCode','currentProvinceCode','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'])), '{}'::jsonb),saved,case when message is not null then jsonb_build_array(message) else '[]' end,case when message is not null then 'loi' else 'da_nhap' end,nullif(saved->>'id','')::uuid,actor,actor);
  results:=results||jsonb_build_array(jsonb_build_object('row',line,'error',message,'id',saved->>'id','action',case when existing.id is null then 'create' else 'update' end));
 end loop;
 result:=jsonb_build_object('batchId',batch_id,'created',created_count,'updated',updated_count,'failed',failed_count,'rows',results);
 if failed_count>0 and not p_allow_partial then raise exception 'IMPORT_HAS_ERRORS' using detail=result::text;end if;
 update public.cd_dot_nhap_du_lieu set trang_thai=case when failed_count=0 then 'hoan_thanh' else 'co_loi' end,ket_thuc_luc=clock_timestamp(),ket_qua=result,updated_by=actor where id=batch_id;
 perform public.cd_audit('Nhập dữ liệu từ tệp','import',batch_id,null,result,actor);return result;
end;$$;
create or replace function public.cd_validate_changes(p_changes jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare pair record;begin
 if p_changes is null then return '{}'::jsonb;end if;
 if jsonb_typeof(p_changes)<>'object' or pg_column_size(p_changes)>8000 then raise exception 'INVALID_PROPOSED_CHANGES';end if;
 for pair in select key,value from jsonb_each(p_changes) loop
  if pair.key not in ('name','dob','gender','phone','email','occupation','address','ward','provinceCode','temporaryProvinceCode','currentProvinceCode','hometown','birthplace','birthRegistration','nationality','ethnicity','religion','maritalStatus','temporaryAddress','currentAddress','otherName','fatherName','motherName','representativeName') or jsonb_typeof(pair.value)<>'string' or char_length(pair.value#>>'{}')>200 then raise exception 'INVALID_PROPOSED_FIELD:%',pair.key;end if;
 end loop;return p_changes;
end;$$;
update public.cd_portal_meta set schema_version=2 where id=1;
-- Deny public execution of internal helpers, including SECURITY DEFINER functions.
do $permissions$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cd\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname=any(array['cd_is_member','cd_current_citizen','cd_member_bundle','cd_citizen_bundle','cd_save_record','cd_record_history','cd_restore_record','cd_save_request','cd_process_request','cd_import_preview','cd_import_commit','cd_import_batches','cd_erd_load','cd_erd_save','cd_section_history','cd_section_revision','cd_restore_section','cd_account_state','cd_citizen_logout']) then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if f.proname='cd_portal_status' then execute format('grant execute on function %s to anon,authenticated',f.signature);end if;
 end loop;
end $permissions$;
commit;

notify pgrst,'reload schema';
