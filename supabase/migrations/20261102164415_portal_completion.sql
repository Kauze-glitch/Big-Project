begin;
-- Separate coursework report roles from operational permissions. Preserve current access initially.
alter table public.cd_thanh_vien_du_an add column if not exists business_role text not null default 'admin';
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.cd_thanh_vien_du_an'::regclass and conname='cd_business_role_check') then
 alter table public.cd_thanh_vien_du_an add constraint cd_business_role_check check(business_role in ('admin','intake','processor','approver'));
end if;end;$$;
alter table public.cd_tai_khoan_cong_dan add column if not exists telegram_otp_phone text;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.cd_tai_khoan_cong_dan'::regclass and conname='cd_telegram_phone_check') then
 alter table public.cd_tai_khoan_cong_dan add constraint cd_telegram_phone_check check(telegram_otp_phone is null or telegram_otp_phone ~ '^\+[1-9][0-9]{6,14}$');
end if;end;$$;

create or replace function public.cd_has_capability(p_user uuid,p_capability text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.cd_is_member_user(p_user) and exists(select 1 from public.cd_thanh_vien_du_an m where m.auth_user_id=p_user and
  (m.business_role='admin' or p_capability='records.read' or
   (m.business_role='intake' and p_capability in ('records.write','accounts.manage','requests.write','requests.receive')) or
   (m.business_role='processor' and p_capability in ('records.write','documents.write','imports.write','requests.write','requests.process')) or
   (m.business_role='approver' and p_capability='requests.decide')));
$$;
create or replace function public.cd_require_capability(p_capability text) returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin if not public.cd_is_member() then raise exception 'MEMBER_REQUIRED' using errcode='42501';end if;
 if not public.cd_has_capability(auth.uid(),p_capability) then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return auth.uid();end;$$;
create or replace function public.cd_member_permissions() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid;begin actor:=public.cd_require_member();return jsonb_build_object(
 'role',(select business_role from public.cd_thanh_vien_du_an where auth_user_id=actor),
 'capabilities',(select jsonb_agg(cap) from unnest(array['records.read','records.write','records.restore','accounts.manage','documents.write','imports.write','requests.write','requests.receive','requests.process','requests.decide','roles.manage','backup.manage']) cap where public.cd_has_capability(actor,cap)),
 'members',case when public.cd_has_capability(actor,'roles.manage') then (select jsonb_agg(jsonb_build_object('id',m.id,'name',m.ten_hien_thi,'role',m.business_role,'version',m.row_version,'self',m.auth_user_id=actor) order by m.created_at,m.id) from public.cd_thanh_vien_du_an m where public.cd_is_member_user(m.auth_user_id)) else '[]'::jsonb end);
end;$$;
create or replace function public.cd_set_member_role(p_id uuid,p_role text,p_expected_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;target public.cd_thanh_vien_du_an;begin
 -- Serialize role changes before checking the last administrator invariant.
 perform 1 from public.cd_thanh_vien_du_an order by id for update;
 actor:=public.cd_require_capability('roles.manage');
 if p_role is null or p_role not in ('admin','intake','processor','approver') or coalesce(char_length(btrim(p_reason)),0) not between 5 and 1000 then raise exception 'INVALID_ROLE';end if;
 select * into target from public.cd_thanh_vien_du_an where id=p_id;
 if target.id is null or not public.cd_is_member_user(target.auth_user_id) then raise exception 'MEMBER_REQUIRED';end if;
 if target.row_version is distinct from p_expected_version then raise exception 'ROLE_CONFLICT';end if;
 if target.business_role='admin' and p_role<>'admin' and not exists(select 1 from public.cd_thanh_vien_du_an m where m.id<>target.id and m.business_role='admin' and public.cd_is_member_user(m.auth_user_id)) then raise exception 'LAST_ADMIN_REQUIRED';end if;
 update public.cd_thanh_vien_du_an set business_role=p_role,updated_by=actor where id=p_id;
 perform public.cd_audit('Thay đổi quyền nghiệp vụ','member',p_id,jsonb_build_object('role',target.business_role),jsonb_build_object('role',p_role,'reason',p_reason),actor);
 return public.cd_member_permissions();
end;$$;

create or replace function public.cd_account_otp_settings(p_citizen uuid,p_channel text,p_phone text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;account public.cd_tai_khoan_cong_dan;begin
 actor:=public.cd_require_capability('accounts.manage');select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=p_citizen for update;
 if account.id is null or account.auth_user_id is null then raise exception 'ACCOUNT_NOT_ISSUED';end if;
 if account.row_version is distinct from p_expected_version then raise exception 'ACCOUNT_CONFLICT';end if;
 if p_channel is null or p_channel not in ('demo','telegram') or (p_channel='telegram' and (p_phone is null or p_phone !~ '^\+[1-9][0-9]{6,14}$')) then raise exception 'INVALID_OTP_CHANNEL';end if;
 if account.provisioning_key is not null and account.provisioning_started_at>now()-interval '2 minutes' then raise exception 'ACCOUNT_PROVISIONING_BUSY';end if;
 update public.cd_tai_khoan_cong_dan set kenh_otp=p_channel,telegram_otp_phone=case when p_channel='telegram' then p_phone end,phien_ban_bao_mat=phien_ban_bao_mat+1,updated_by=actor where id=account.id;
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi='Thay đổi kênh nhận OTP',updated_by=actor where tai_khoan_id=account.id and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi',updated_by=actor where tai_khoan_id=account.id and trang_thai='cho_xac_thuc';
 perform public.cd_audit('Thay đổi kênh nhận OTP','account',p_citizen,jsonb_build_object('channel',account.kenh_otp),jsonb_build_object('channel',p_channel,'phoneMasked',case when p_channel='telegram' then left(p_phone,3)||' •••• '||right(p_phone,3) end),actor);
 return public.cd_record_doc(p_citizen);
end;$$;
create or replace function public.cd_challenge_delivery_result(p_challenge uuid,p_provider_request text,p_success boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.cd_thach_thuc_otp set provider_request_id=left(p_provider_request,180),trang_thai=case when p_success then trang_thai else 'gui_that_bai' end where id=p_challenge and trang_thai='cho_xac_thuc';return found;
end;$$;
create or replace function public.cd_citizen_security_context() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare citizen uuid;begin citizen:=public.cd_current_citizen();if citizen is null then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;
 return (select jsonb_build_object('accountId',a.id,'citizenId',citizen,'email',u.email,'version',a.row_version) from public.cd_tai_khoan_cong_dan a join auth.users u on u.id=a.auth_user_id where a.cong_dan_id=citizen and a.auth_user_id=auth.uid());
end;$$;
create or replace function public.cd_citizen_password_prepare(p_operation uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare citizen uuid;account public.cd_tai_khoan_cong_dan;begin
 citizen:=public.cd_current_citizen();if citizen is null then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;
 select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=citizen for update;
 if account.row_version is distinct from p_expected_version or p_operation is null then raise exception 'ACCOUNT_CONFLICT';end if;
 if account.provisioning_key is not null and account.provisioning_started_at>now()-interval '2 minutes' then raise exception 'ACCOUNT_PROVISIONING_BUSY';end if;
 if exists(select 1 from public.sections where owner_id=account.auth_user_id) then raise exception 'PROJECT_ACCOUNT_PROTECTED';end if;
 update public.cd_tai_khoan_cong_dan set provisioning_key=p_operation,provisioning_started_at=clock_timestamp(),phien_ban_bao_mat=phien_ban_bao_mat+1,updated_by=auth.uid() where id=account.id;
 -- Revoke before the external Auth call so a timeout cannot leave a verified old portal session active.
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi='Đổi mật khẩu',updated_by=auth.uid() where tai_khoan_id=account.id and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi' where tai_khoan_id=account.id and trang_thai='cho_xac_thuc';
 return jsonb_build_object('accountId',account.id,'userId',account.auth_user_id);
end;$$;
create or replace function public.cd_citizen_password_finish(p_account uuid,p_user uuid,p_operation uuid,p_success boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account public.cd_tai_khoan_cong_dan;begin
 select * into account from public.cd_tai_khoan_cong_dan where id=p_account for update;
 if account.id is null or account.auth_user_id is distinct from p_user or account.provisioning_key is distinct from p_operation or account.provisioning_started_at<now()-interval '2 minutes' or exists(select 1 from public.sections where owner_id=p_user) then raise exception 'ACCOUNT_OPERATION_EXPIRED';end if;
 update public.cd_tai_khoan_cong_dan set provisioning_key=null,provisioning_started_at=null,updated_by=p_user where id=account.id;
 perform public.cd_audit(case when p_success then 'Công dân đổi mật khẩu' else 'Đổi mật khẩu chưa hoàn tất' end,'account',account.cong_dan_id,null,jsonb_build_object('success',p_success),p_user);return true;
end;$$;

create or replace function public.cd_administrative_lookup(p_query text default '') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_capability('records.read');
 if coalesce(char_length(p_query),0)>100 then raise exception 'INVALID_INPUT';end if;
 return jsonb_build_object('simulation',true,'source','Danh mục nội bộ đồ án — không kết nối cơ sở dữ liệu hành chính quốc gia','snapshot','2024-12-31','queriedAt',clock_timestamp(),
 'provinces',coalesce((select jsonb_agg(jsonb_build_object('code',code,'name',name) order by name) from public.cd_tinh_thanh_cu where coalesce(p_query,'')='' or name ilike '%'||p_query||'%' or code ilike '%'||p_query||'%'),'[]'));
end;$$;

create or replace function public.cd_backup_inventory() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare item record;tables jsonb:='[]';n bigint;fingerprint text;begin
 for item in select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and (left(table_name,3)='cd_' or table_name in ('sections','section_order')) and table_name not in ('cd_rate_limits','cd_thach_thuc_otp','cd_phien_xac_thuc_cong_dan') order by table_name loop
  execute format('select count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),'''')) from public.%I t',item.table_name) into n,fingerprint;
  tables:=tables||jsonb_build_array(jsonb_build_object('name',item.table_name,'rows',n,'fingerprint',fingerprint));
 end loop;
 return jsonb_build_object('format','nhom12-backup-inventory-v1','schemaVersion',(select schema_version from public.cd_portal_meta where id=1),'createdAt',clock_timestamp(),'tables',tables,
 'transientTables',jsonb_build_array('cd_rate_limits','cd_thach_thuc_otp','cd_phien_xac_thuc_cong_dan'),
 'files',coalesce((select jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'size',coalesce((metadata->>'size')::bigint,0),'mime',metadata->>'mimetype') order by name) from storage.objects where bucket_id='cd-documents'),'[]'));
end;$$;
create or replace function public.cd_backup_manifest() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_capability('backup.manage');return public.cd_backup_inventory();end;$$;

-- Public release information needs no privileged database access.
create or replace function public.cd_portal_status() returns jsonb language sql immutable security invoker set search_path=pg_catalog as $$
 select jsonb_build_object('schemaVersion',4,'fictionalOnly',true,'otpMode','per-account');
$$;

-- Entry point definitions with explicit capability guards are appended by the migration builder.

create or replace function public.cd_save_record(p_data jsonb,p_expected_version integer default null,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;begin actor:=public.cd_require_capability('records.write');return public.cd_write_record(p_data,p_expected_version,p_reason,actor);end;$$;

create or replace function public.cd_restore_record(p_id uuid,p_revision uuid,p_expected_version integer,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;snapshot jsonb;card jsonb;begin
 actor:=public.cd_require_capability('records.restore');if char_length(btrim(p_reason))<5 then raise exception 'RESTORE_REASON_REQUIRED';end if;
 select sau_thay_doi into snapshot from public.cd_nhat_ky_thao_tac where id=p_revision and doi_tuong_loai='citizen' and doi_tuong_id=p_id;
 if snapshot is null then raise exception 'REVISION_NOT_FOUND';end if;
 card:=snapshot->'identityCard';snapshot:=(snapshot-'householdHeadVersion')||jsonb_build_object('id',p_id);
 if card is not null and jsonb_typeof(card)='object' then snapshot:=snapshot||jsonb_build_object('cardIssuedOn',card->>'issuedOn','cardExpiresOn',card->>'expiresOn','cardIssuer',card->>'issuer','cardStatus',card->>'status');end if;
 return public.cd_write_record(snapshot,p_expected_version,p_reason,actor,'Khôi phục hồ sơ');
end;$$;

create or replace function public.cd_household_operation(p_id uuid,p_expected_version integer,p_code text,p_head uuid,p_relation text,p_reason text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;doc jsonb;result jsonb;existing uuid;previous uuid;begin
 actor:=public.cd_require_capability('records.write');
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
 actor:=public.cd_require_capability('records.write');
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
 actor:=public.cd_require_capability('documents.write');perform 1 from public.cd_cong_dan where id=p_citizen for update;if not found then raise exception 'CITIZEN_NOT_FOUND';end if;
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

create or replace function public.cd_prepare_attachment(p_document uuid,p_name text,p_mime text,p_size bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;f public.cd_tep_dinh_kem;fid uuid:=gen_random_uuid();begin
 actor:=public.cd_require_capability('documents.write');perform 1 from public.cd_giay_to_ho_tich where id=p_document and trang_thai='hieu_luc' for update;if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 if p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg','image/webp') or p_size is null or p_size<1 or p_size>2097152 or p_name is null or char_length(p_name) not between 1 and 180 or p_name~'[\x00-\x1F]' then raise exception 'INVALID_ATTACHMENT';end if;
 if (select count(*) from public.cd_tep_dinh_kem where giay_to_ho_tich_id=p_document and trang_thai='san_sang')>=5 then raise exception 'ATTACHMENT_LIMIT';end if;
 insert into public.cd_tep_dinh_kem(id,giay_to_ho_tich_id,vai_tro_tep,bucket,object_path,ten_tep_goc,mime_type,kich_thuoc_bytes,nguoi_tai_len_user_id,trang_thai,created_by,updated_by) values(fid,p_document,'ban_sao','cd-documents',p_document::text||'/'||fid::text,p_name,p_mime,p_size,actor,'dang_tai',actor,actor) returning * into f;
 return jsonb_build_object('id',f.id,'path',f.object_path,'bucket',f.bucket);
end;$$;

create or replace function public.cd_finish_attachment(p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;f public.cd_tep_dinh_kem;obj jsonb;begin
 actor:=public.cd_require_capability('documents.write');select * into f from public.cd_tep_dinh_kem where id=p_id and nguoi_tai_len_user_id=actor for update;
 if f.id is null then raise exception 'DOCUMENT_NOT_FOUND';end if;if f.trang_thai='san_sang' then return jsonb_build_object('id',f.id);end if;
 perform 1 from public.cd_giay_to_ho_tich where id=f.giay_to_ho_tich_id and trang_thai='hieu_luc' for update;if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 if (select count(*) from public.cd_tep_dinh_kem where giay_to_ho_tich_id=f.giay_to_ho_tich_id and trang_thai='san_sang')>=5 then raise exception 'ATTACHMENT_LIMIT';end if;
 select metadata into obj from storage.objects where bucket_id=f.bucket and name=f.object_path;
 if obj is null or (obj->>'size')::bigint is distinct from f.kich_thuoc_bytes or obj->>'mimetype' is distinct from f.mime_type then raise exception 'INVALID_ATTACHMENT';end if;
 update public.cd_tep_dinh_kem set trang_thai='san_sang',updated_by=actor where id=f.id;
 perform public.cd_audit('Thêm tệp giấy tờ','attachment',f.id,null,jsonb_build_object('documentId',f.giay_to_ho_tich_id,'filename',f.ten_tep_goc),actor);return jsonb_build_object('id',f.id);
end;$$;

create or replace function public.cd_import_preview(p_rows jsonb,p_mode text default 'create') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare row_item jsonb;row_doc jsonb;existing public.cd_cong_dan;results jsonb:='[]';message text;line integer;normalized jsonb;begin
 perform public.cd_require_capability('imports.write');
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
 actor:=public.cd_require_capability('imports.write');member_id:=public.cd_member_id(actor);
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

create or replace function public.cd_account_state(p_citizen uuid,p_expected_version integer,p_next text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;account public.cd_tai_khoan_cong_dan;begin
 actor:=public.cd_require_capability('accounts.manage');select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=p_citizen for update;
 if account.id is null or account.auth_user_id is null then raise exception 'ACCOUNT_NOT_ISSUED';end if;
 if account.row_version is distinct from p_expected_version then raise exception 'ACCOUNT_CONFLICT';end if;
 if not ((account.trang_thai='active' and p_next='locked') or (account.trang_thai='locked' and p_next='active')) or char_length(btrim(p_reason))<5 or char_length(p_reason)>1000 then raise exception 'INVALID_ACCOUNT_TRANSITION';end if;
 update public.cd_tai_khoan_cong_dan set trang_thai=p_next,phien_ban_bao_mat=phien_ban_bao_mat+1,nguoi_khoa_id=case when p_next='locked' then public.cd_member_id(actor) end,thoi_diem_khoa=case when p_next='locked' then clock_timestamp() end,ly_do_khoa=case when p_next='locked' then p_reason end,updated_by=actor where id=account.id;
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi=p_reason,updated_by=actor where tai_khoan_id=account.id and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi',updated_by=actor where tai_khoan_id=account.id and trang_thai='cho_xac_thuc';
 perform public.cd_audit(case when p_next='locked' then 'Khóa tài khoản' else 'Mở khóa tài khoản' end,'account',p_citizen,jsonb_build_object('account',account.trang_thai),jsonb_build_object('account',p_next,'reason',p_reason),actor);
 return public.cd_record_doc(p_citizen);
end;$$;

create or replace function public.cd_account_prepare(p_citizen uuid,p_actor uuid,p_expected_version integer,p_operation uuid,p_reset boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account public.cd_tai_khoan_cong_dan;citizen public.cd_cong_dan;v_email text;known_user uuid;begin
 if not public.cd_has_capability(p_actor,'accounts.manage') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 select * into citizen from public.cd_cong_dan where id=p_citizen for update;
 if citizen.id is null then raise exception 'CITIZEN_NOT_FOUND';end if;
 select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=p_citizen for update;
 if account.id is null then
  if p_reset or p_expected_version is distinct from 0 then raise exception 'ACCOUNT_CONFLICT';end if;
  insert into public.cd_tai_khoan_cong_dan(cong_dan_id,so_dien_thoai_otp,kenh_otp,trang_thai,nguoi_cap_id,ngay_cap,phien_ban_bao_mat,created_by,updated_by)
  values(p_citizen,citizen.so_dien_thoai_lien_he,'demo','not-issued',public.cd_member_id(p_actor),clock_timestamp(),1,p_actor,p_actor) returning * into account;
 elsif account.row_version is distinct from p_expected_version and account.provisioning_key is distinct from p_operation then raise exception 'ACCOUNT_CONFLICT';end if;
 if not p_reset and account.trang_thai<>'not-issued' then raise exception 'ACCOUNT_ALREADY_ISSUED';end if;
 if p_reset and account.auth_user_id is null then raise exception 'ACCOUNT_NOT_ISSUED';end if;
 if p_operation is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
 if account.provisioning_key is not null and account.provisioning_key<>p_operation and account.provisioning_started_at>now()-interval '2 minutes' then raise exception 'ACCOUNT_PROVISIONING_BUSY';end if;
 v_email:='cd.'||replace(p_citizen::text,'-','')||'@citizen.invalid';
 select id into known_user from auth.users where lower(auth.users.email)=v_email and raw_app_meta_data->>'citizen_id'=p_citizen::text;
 if account.auth_user_id is not null and account.auth_user_id is distinct from known_user then raise exception 'ACCOUNT_IDENTITY_MISMATCH';end if;
 if known_user is not null and exists(select 1 from public.sections where owner_id=known_user) then raise exception 'PROJECT_ACCOUNT_PROTECTED';end if;
 update public.cd_tai_khoan_cong_dan set provisioning_key=p_operation,provisioning_started_at=clock_timestamp(),updated_by=p_actor where id=account.id;
 return jsonb_build_object('id',account.id,'email',v_email,'authUserId',known_user,'citizenId',p_citizen,'operation',p_operation);
end;$$;

create or replace function public.cd_account_finish(p_account uuid,p_actor uuid,p_operation uuid,p_auth_user uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account public.cd_tai_khoan_cong_dan;v_email text;before_doc jsonb;begin
 if not public.cd_has_capability(p_actor,'accounts.manage') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 select * into account from public.cd_tai_khoan_cong_dan where id=p_account for update;
 if account.id is null or account.provisioning_key is distinct from p_operation or account.provisioning_started_at<now()-interval '2 minutes' then raise exception 'ACCOUNT_OPERATION_EXPIRED';end if;
 v_email:='cd.'||replace(account.cong_dan_id::text,'-','')||'@citizen.invalid';
 if not exists(select 1 from auth.users u where u.id=p_auth_user and lower(u.email)=v_email and u.raw_app_meta_data->>'citizen_id'=account.cong_dan_id::text) or exists(select 1 from public.sections where owner_id=p_auth_user) then raise exception 'PROJECT_ACCOUNT_PROTECTED';end if;
 before_doc:=jsonb_build_object('account',account.trang_thai);
 update public.cd_tai_khoan_cong_dan set auth_user_id=p_auth_user,trang_thai=case when trang_thai='not-issued' then 'active' else trang_thai end,phien_ban_bao_mat=phien_ban_bao_mat+1,provisioning_key=null,provisioning_started_at=null,updated_by=p_actor where id=p_account;
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi='Thay đổi thông tin bảo mật',updated_by=p_actor where tai_khoan_id=p_account and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi',updated_by=p_actor where tai_khoan_id=p_account and trang_thai='cho_xac_thuc';
 perform public.cd_audit(case when account.trang_thai='not-issued' then 'Cấp tài khoản công dân' else 'Đặt lại mật khẩu công dân' end,'account',account.cong_dan_id,before_doc,jsonb_build_object('account',case when account.trang_thai='not-issued' then 'active' else account.trang_thai end),p_actor);
 return public.cd_record_doc(account.cong_dan_id);
end;$$;

create or replace function public.cd_save_request(p_data jsonb,p_expected_version integer default null,p_submit boolean default true,p_idempotency uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare citizen uuid;actor uuid:=auth.uid();member boolean:=public.cd_is_member();existing public.cd_ho_so_yeu_cau;request_id uuid;unit_id uuid;next_state text;changes jsonb;code text;before_doc jsonb;result jsonb;citizen_version integer;begin
 if member then perform public.cd_require_capability('requests.write');citizen:=nullif(p_data->>'citizenId','')::uuid;else citizen:=public.cd_current_citizen();if citizen is null or (p_data ? 'citizenId' and p_data->>'citizenId'<>citizen::text) then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;end if;
 if citizen is null or not exists(select 1 from public.cd_cong_dan where id=citizen) then raise exception 'CITIZEN_NOT_FOUND';end if;
 if jsonb_typeof(p_data)<>'object' or pg_column_size(p_data)>16000 or char_length(btrim(coalesce(p_data->>'title',''))) not between 3 and 160 or char_length(btrim(coalesce(p_data->>'description',''))) not between 5 and 5000 then raise exception 'INVALID_REQUEST_CONTENT';end if;
 if p_data->>'type' not in ('cap_nhat_thong_tin','cu_tru','chuyen_ho','ho_tich','khac') then raise exception 'INVALID_REQUEST_TYPE';end if;
 changes:=public.cd_validate_changes(coalesce(p_data->'changes','{}'));
 if changes<>'{}'::jsonb then perform public.cd_validate_record(public.cd_record_doc(citizen)||changes);end if;
 if nullif(p_data->>'id','') is null then
  if p_idempotency is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
  select * into existing from public.cd_ho_so_yeu_cau where idempotency_key=p_idempotency;
  if existing.id is not null then
   if existing.cong_dan_id<>citizen or existing.nguoi_nop_user_id<>actor then raise exception 'REQUEST_NOT_ALLOWED' using errcode='42501';end if;
   return public.cd_request_doc(existing.id,member);
  end if;
  if not member and (select count(*) from public.cd_ho_so_yeu_cau where cong_dan_id=citizen and created_at>now()-interval '1 hour')>=10 then raise exception 'REQUEST_RATE_LIMIT';end if;
  request_id:=gen_random_uuid();code:='HS-'||to_char(public.cd_today(),'YYYY')||'-'||upper(substr(replace(request_id::text,'-',''),1,12));
  select coalesce((select r.don_vi_hc_id from public.cd_cu_tru r where r.cong_dan_id=citizen and r.loai_cu_tru='thuong_tru' and r.den_ngay is null and r.trang_thai='hieu_luc' limit 1),(select id from public.cd_don_vi_hc where ma_don_vi='MAU-A')) into unit_id;
  next_state:=case when p_submit then 'da_gui' else 'nhap' end;
  select row_version into citizen_version from public.cd_cong_dan where id=citizen;
  insert into public.cd_ho_so_yeu_cau(id,ma_tra_cuu,cong_dan_id,nguoi_nop_user_id,don_vi_tiep_nhan_id,loai_yeu_cau,tieu_de,noi_dung,thay_doi_de_nghi,trang_thai,ngay_nop,idempotency_key,citizen_base_version,created_by,updated_by)
  values(request_id,code,citizen,actor,unit_id,p_data->>'type',btrim(p_data->>'title'),btrim(p_data->>'description'),changes,next_state,case when p_submit then clock_timestamp() end,p_idempotency,citizen_version,actor,actor);
 else
  request_id:=(p_data->>'id')::uuid;select * into existing from public.cd_ho_so_yeu_cau where id=request_id for update;
  if existing.id is null or existing.cong_dan_id<>citizen or (member and existing.nguoi_nop_user_id<>actor) then raise exception 'REQUEST_NOT_ALLOWED' using errcode='42501';end if;
  if existing.row_version is distinct from p_expected_version then raise exception 'REQUEST_CONFLICT';end if;
  if existing.trang_thai not in ('nhap','can_bo_sung') then raise exception 'REQUEST_NOT_EDITABLE';end if;
  before_doc:=public.cd_request_doc(request_id,true);next_state:=case when p_submit then 'da_gui' else existing.trang_thai end;
  select row_version into citizen_version from public.cd_cong_dan where id=citizen;
  update public.cd_ho_so_yeu_cau set loai_yeu_cau=p_data->>'type',tieu_de=btrim(p_data->>'title'),noi_dung=btrim(p_data->>'description'),thay_doi_de_nghi=changes,trang_thai=next_state,ngay_nop=case when p_submit then clock_timestamp() else ngay_nop end,citizen_base_version=citizen_version,updated_by=actor where id=request_id;
 end if;
 insert into public.cd_lich_su_xu_ly(ho_so_id,nguoi_thuc_hien_user_id,hanh_dong,trang_thai_truoc,trang_thai_sau,noi_dung,hien_cho_cong_dan,thoi_diem)
 values(request_id,actor,case when existing.trang_thai='can_bo_sung' and p_submit then 'Bổ sung và gửi lại' when p_submit then 'Gửi yêu cầu' else 'Lưu bản nháp yêu cầu' end,existing.trang_thai,next_state,case when p_submit then 'Nội dung đã được gửi đến bộ phận xử lý.' else 'Nội dung chưa được gửi.' end,true,clock_timestamp());
 result:=public.cd_request_doc(request_id,member);perform public.cd_audit(case when p_submit then 'Gửi yêu cầu' else 'Lưu bản nháp yêu cầu' end,'request',request_id,before_doc,result,actor);return result;
end;$$;

create or replace function public.cd_process_request(p_id uuid,p_expected_version integer,p_next text,p_note text default '',p_staff_id uuid default null,p_apply_changes boolean default false,p_expected_citizen_version integer default null,p_public_note boolean default true) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare old public.cd_ho_so_yeu_cau;member boolean:=public.cd_is_member();citizen uuid:=public.cd_current_citizen();actor uuid:=auth.uid();staff_id uuid;before_doc jsonb;result jsonb;doc jsonb;version integer;allowed boolean:=false;begin
 if member then perform public.cd_require_capability(case when p_next='da_tiep_nhan' then 'requests.receive' when p_next in ('dang_xu_ly','can_bo_sung') then 'requests.process' else 'requests.decide' end);end if;
 select * into old from public.cd_ho_so_yeu_cau where id=p_id for update;
 if old.id is null or (not member and (citizen is null or old.cong_dan_id<>citizen)) then raise exception 'REQUEST_NOT_ALLOWED' using errcode='42501';end if;
 if old.row_version is distinct from p_expected_version then raise exception 'REQUEST_CONFLICT';end if;
 if old.trang_thai in ('hoan_thanh','tu_choi','da_huy') then raise exception 'REQUEST_TERMINAL';end if;
 if not member then allowed:=p_next='da_huy' and old.trang_thai in ('nhap','da_gui');
 else
  allowed:=case old.trang_thai when 'da_gui' then p_next in ('da_tiep_nhan','tu_choi','da_huy') when 'da_tiep_nhan' then p_next in ('dang_xu_ly','tu_choi','da_huy') when 'dang_xu_ly' then p_next in ('can_bo_sung','hoan_thanh','tu_choi','da_huy') when 'can_bo_sung' then p_next in ('tu_choi','da_huy') else false end;
 end if;
 if not allowed then raise exception 'INVALID_REQUEST_TRANSITION';end if;
 if p_next in ('can_bo_sung','hoan_thanh','tu_choi','da_huy') and p_public_note is distinct from true then raise exception 'REQUEST_PUBLIC_NOTE_REQUIRED';end if;
 if p_note is null or char_length(p_note)>5000 or (p_next in ('can_bo_sung','hoan_thanh','tu_choi','da_huy') and char_length(btrim(p_note))<5) then raise exception 'REQUEST_NOTE_REQUIRED';end if;
 staff_id:=coalesce(p_staff_id,old.can_bo_phu_trach_id,(select id from public.cd_can_bo where thanh_vien_du_an_id=public.cd_member_id(actor) and trang_thai='dang_cong_tac' limit 1));
 if member and (staff_id is null or not exists(select 1 from public.cd_can_bo b join public.cd_thanh_vien_du_an m on m.id=b.thanh_vien_du_an_id where b.id=staff_id and b.trang_thai='dang_cong_tac' and public.cd_is_member_user(m.auth_user_id))) then raise exception 'INVALID_ASSIGNED_STAFF';end if;
 before_doc:=public.cd_request_doc(p_id,true);
 if p_apply_changes then
  if not member or p_next<>'hoan_thanh' or old.thay_doi_de_nghi is null or old.thay_doi_de_nghi='{}' then raise exception 'REQUEST_CHANGES_NOT_APPLICABLE';end if;
  select row_version into version from public.cd_cong_dan where id=old.cong_dan_id for update;
  if version is distinct from p_expected_citizen_version then raise exception 'RECORD_CONFLICT';end if;
  doc:=public.cd_record_doc(old.cong_dan_id)||public.cd_validate_changes(old.thay_doi_de_nghi);
  perform public.cd_write_record(doc,version,'Theo yêu cầu '||old.ma_tra_cuu||': '||p_note,actor,'Duyệt điều chỉnh hồ sơ');
 end if;
 update public.cd_ho_so_yeu_cau set trang_thai=p_next,can_bo_phu_trach_id=case when member then staff_id else can_bo_phu_trach_id end,
 ket_qua=case when p_next='hoan_thanh' then p_note else ket_qua end,ly_do_tu_choi=case when p_next='tu_choi' then p_note else ly_do_tu_choi end,
 ngay_ket_thuc=case when p_next in ('hoan_thanh','tu_choi','da_huy') then clock_timestamp() end,updated_by=actor where id=p_id;
 insert into public.cd_lich_su_xu_ly(ho_so_id,nguoi_thuc_hien_user_id,can_bo_id,hanh_dong,trang_thai_truoc,trang_thai_sau,noi_dung,hien_cho_cong_dan,thoi_diem)
 values(p_id,actor,case when member then staff_id end,case p_next when 'da_tiep_nhan' then 'Tiếp nhận hồ sơ' when 'dang_xu_ly' then 'Bắt đầu xử lý' when 'can_bo_sung' then 'Yêu cầu bổ sung' when 'hoan_thanh' then 'Hoàn thành' when 'tu_choi' then 'Từ chối' else 'Hủy yêu cầu' end,old.trang_thai,p_next,coalesce(nullif(btrim(p_note),''),'Đã cập nhật trạng thái hồ sơ.'),case when member then p_public_note else true end,clock_timestamp());
 result:=public.cd_request_doc(p_id,member);perform public.cd_audit('Cập nhật tiến trình yêu cầu','request',p_id,before_doc,result,actor);return result;
end;$$;

create or replace function public.cd_member_bundle() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return jsonb_build_object('permissions',public.cd_member_permissions()) || jsonb_build_object(
 'records',coalesce((select jsonb_agg(public.cd_record_doc(id) order by updated_at desc,id) from public.cd_cong_dan),'[]'),
 'requests',coalesce((select jsonb_agg(public.cd_request_doc(id,true) order by created_at desc,id) from public.cd_ho_so_yeu_cau where trang_thai<>'nhap' or nguoi_nop_user_id=auth.uid()),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',hanh_dong,'name',coalesce(sau_thay_doi->>'name',actor_label),'actor',actor_label,'kind',doi_tuong_loai,'entityId',doi_tuong_id,'at',thoi_diem) order by thoi_diem desc) from (select * from public.cd_nhat_ky_thao_tac order by thoi_diem desc limit 30) recent),'[]'),
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',ten_don_vi) order by ten_don_vi) from public.cd_don_vi_hc where trang_thai='hoat_dong'),'[]'),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',ho_ten) order by ho_ten) from public.cd_can_bo where trang_thai='dang_cong_tac'),'[]')
 );end;$$;

create or replace function public.cd_file_access(p_path text,p_upload boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.cd_tep_dinh_kem f join public.cd_giay_to_ho_tich d on d.id=f.giay_to_ho_tich_id where f.bucket='cd-documents' and f.object_path=p_path and ((p_upload and public.cd_has_capability(auth.uid(),'documents.write') and f.trang_thai='dang_tai' and f.nguoi_tai_len_user_id=auth.uid()) or (not p_upload and f.trang_thai='san_sang' and (public.cd_is_member() or d.cong_dan_id=public.cd_current_citizen()))));
$$;

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
 'otpChannel',coalesce(a.kenh_otp,'demo'),'otpPhoneMasked',case when a.kenh_otp='telegram' then left(a.telegram_otp_phone,3)||' •••• '||right(a.telegram_otp_phone,3) else '' end,
 'account',coalesce(a.trang_thai,'not-issued'),'accountVersion',coalesce(a.row_version,0),'rowVersion',c.row_version,'updatedAt',c.updated_at,
 'identityCard',(select jsonb_build_object('id',t.id,'type',t.phien_ban_mau,'number',t.so_tren_giay_to,'fullName',t.thong_tin_tren_the->>'fullName','dob',t.thong_tin_tren_the->>'dob','gender',t.thong_tin_tren_the->>'gender','nationality',t.thong_tin_tren_the->>'nationality','hometown',t.thong_tin_tren_the->>'hometown','address',t.thong_tin_tren_the->>'address','issuedOn',t.ngay_cap,'expiresOn',t.ngay_het_han,'issuer',t.noi_cap,'status',case t.trang_thai when 'con_hieu_luc' then 'active' when 'het_han' then 'expired' when 'da_thay_the' then 'replaced' when 'mat' then 'lost' else 'revoked' end) from public.cd_the_can_cuoc t where t.cong_dan_id=c.id order by t.created_at desc,t.id limit 1)
 ) || public.cd_residence_summary(c.id) from public.cd_cong_dan c left join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id where c.id=p_id;
$$;

create or replace function public.cd_auth_lookup(p_cccd text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('accountId',a.id,'citizenId',c.id,'authUserId',a.auth_user_id,'email',u.email,'otpChannel',a.kenh_otp,'otpPhone',a.telegram_otp_phone,'phone',a.so_dien_thoai_otp,'status',a.trang_thai,'securityVersion',a.phien_ban_bao_mat)
 from public.cd_cong_dan c join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id join auth.users u on u.id=a.auth_user_id where c.so_dinh_danh=p_cccd;
$$;

create or replace function public.cd_issue_challenge(p_account uuid,p_auth_user uuid,p_auth_session uuid,p_challenge uuid,p_otp_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account public.cd_tai_khoan_cong_dan;recent public.cd_thach_thuc_otp;challenge public.cd_thach_thuc_otp;begin
 select * into account from public.cd_tai_khoan_cong_dan where id=p_account for update;
 if account.id is null or account.auth_user_id<>p_auth_user then raise exception 'INVALID_CREDENTIALS';end if;
 if account.trang_thai<>'active' then raise exception 'ACCOUNT_LOCKED';end if;
 if not exists(select 1 from auth.sessions where id=p_auth_session and user_id=p_auth_user) then raise exception 'INVALID_CREDENTIALS';end if;
 if exists(select 1 from public.cd_phien_xac_thuc_cong_dan where auth_session_id=p_auth_session) then raise exception 'SESSION_RESTART_REQUIRED';end if;
 if p_challenge is null or p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CHALLENGE';end if;
 select * into recent from public.cd_thach_thuc_otp where tai_khoan_id=p_account order by created_at desc limit 1;
 if recent.id is not null and recent.created_at>now()-interval '30 seconds' then raise exception 'OTP_COOLDOWN';end if;
 update public.cd_thach_thuc_otp set trang_thai='thay_the' where tai_khoan_id=p_account and trang_thai='cho_xac_thuc';
 insert into public.cd_thach_thuc_otp(id,tai_khoan_id,phien_dang_nhap_id,muc_dich,kenh,ma_bam_otp,het_han_luc,duoc_gui_lai_luc,so_lan_sai,gioi_han_thu,trang_thai,phien_ban_bao_mat)
 values(p_challenge,p_account,p_auth_session,'dang_nhap',account.kenh_otp,p_otp_hash,clock_timestamp()+interval '2 minutes',clock_timestamp()+interval '30 seconds',0,5,'cho_xac_thuc',account.phien_ban_bao_mat) returning * into challenge;
 return jsonb_build_object('challengeId',challenge.id,'expiresAt',challenge.het_han_luc,'resendAt',challenge.duoc_gui_lai_luc,'phoneMasked',left(case when account.kenh_otp='telegram' then account.telegram_otp_phone else account.so_dien_thoai_otp end,3)||' •••• '||right(case when account.kenh_otp='telegram' then account.telegram_otp_phone else account.so_dien_thoai_otp end,3));
end;$$;

revoke all on function public.cd_backup_inventory() from public,anon,authenticated;
grant execute on function public.cd_backup_inventory() to service_role;

revoke all on function public.cd_backup_manifest() from public,anon,authenticated;
grant execute on function public.cd_backup_manifest() to service_role;
grant execute on function public.cd_backup_manifest() to authenticated;

revoke all on function public.cd_has_capability(uuid,text) from public,anon,authenticated;
grant execute on function public.cd_has_capability(uuid,text) to service_role;

revoke all on function public.cd_require_capability(text) from public,anon,authenticated;
grant execute on function public.cd_require_capability(text) to service_role;

revoke all on function public.cd_member_permissions() from public,anon,authenticated;
grant execute on function public.cd_member_permissions() to service_role;
grant execute on function public.cd_member_permissions() to authenticated;

revoke all on function public.cd_set_member_role(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.cd_set_member_role(uuid,text,integer,text) to service_role;
grant execute on function public.cd_set_member_role(uuid,text,integer,text) to authenticated;

revoke all on function public.cd_account_otp_settings(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.cd_account_otp_settings(uuid,text,text,integer) to service_role;
grant execute on function public.cd_account_otp_settings(uuid,text,text,integer) to authenticated;

revoke all on function public.cd_challenge_delivery_result(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.cd_challenge_delivery_result(uuid,text,boolean) to service_role;

revoke all on function public.cd_citizen_security_context() from public,anon,authenticated;
grant execute on function public.cd_citizen_security_context() to service_role;
grant execute on function public.cd_citizen_security_context() to authenticated;

revoke all on function public.cd_citizen_password_prepare(uuid,integer) from public,anon,authenticated;
grant execute on function public.cd_citizen_password_prepare(uuid,integer) to service_role;
grant execute on function public.cd_citizen_password_prepare(uuid,integer) to authenticated;

revoke all on function public.cd_citizen_password_finish(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.cd_citizen_password_finish(uuid,uuid,uuid,boolean) to service_role;

revoke all on function public.cd_administrative_lookup(text) from public,anon,authenticated;
grant execute on function public.cd_administrative_lookup(text) to service_role;
grant execute on function public.cd_administrative_lookup(text) to authenticated;

update public.cd_portal_meta set schema_version=4 where id=1;
notify pgrst,'reload schema';
commit;
