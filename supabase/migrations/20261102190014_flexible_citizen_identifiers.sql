begin;
-- Broaden formats without rewriting stored identifiers, Auth users or OTP delivery settings.
-- Keep legacy constraint names so rerunning the initial schema remains compatible.
alter table public.cd_cong_dan drop constraint if exists cd_fictional_identifier;
alter table public.cd_cong_dan add constraint cd_fictional_identifier check(so_dinh_danh is null or so_dinh_danh ~ '^[0-9]{12}$');
alter table public.cd_cong_dan drop constraint if exists cd_profile_text_bounds;
alter table public.cd_cong_dan add constraint cd_profile_text_bounds check(
 char_length(ho_ten_khai_sinh) between 2 and 80
 and (email_lien_he is null or (char_length(email_lien_he)<=100 and email_lien_he ~ '^[^[:space:]@]+@example[.]invalid$'))
 and (so_dien_thoai_lien_he is null or so_dien_thoai_lien_he ~ '^([0-9]{10}|[+][1-9][0-9]{6,14})$')
);
alter table public.cd_tai_khoan_cong_dan drop constraint if exists cd_account_phone;
alter table public.cd_tai_khoan_cong_dan add constraint cd_account_phone check(so_dien_thoai_otp ~ '^([0-9]{10}|[+][1-9][0-9]{6,14})$');

-- The latest record validator and status definition follow below.

create or replace function public.cd_validate_record(p jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare k text;v text;d date;issued date;expires date; normalized jsonb:='{}';head public.cd_cong_dan;head_member public.cd_thanh_vien_ho;target_house uuid;head_id uuid;key text;code text;begin
 if p is null or jsonb_typeof(p)<>'object' or pg_column_size(p)>40000 then raise exception 'INVALID_RECORD';end if;
 foreach k in array array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryFrom','temporaryUntil','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','householdHeadId','householdHeadCccd','householdHeadVersion','provinceCode','temporaryProvinceCode','currentProvinceCode','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'] loop
  v:=btrim(coalesce(p->>k,''));if char_length(v)>(case when k in ('name','otherName') then 80 when k in ('email','occupation') then 100 else 200 end) then raise exception 'FIELD_TOO_LONG:%',k;end if;
  normalized:=normalized||jsonb_build_object(k,v);
 end loop;
 if char_length(normalized->>'name')<2 then raise exception 'INVALID_NAME';end if;
 if normalized->>'cccd' !~ '^[0-9]{12}$' then raise exception 'INVALID_IDENTIFIER';end if;
 if normalized->>'phone' !~ '^([0-9]{10}|[+][1-9][0-9]{6,14})$' then raise exception 'INVALID_CONTACT_PHONE';end if;
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
create or replace function public.cd_portal_status() returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$ select jsonb_build_object('schemaVersion',5,'fictionalOnly',false,'otpMode','per-account','identifierPolicy','twelve-digits','contactPhonePolicy','ten-digits-or-international');$$;
update public.cd_portal_meta set schema_version=5 where id=1;
notify pgrst,'reload schema';
commit;
