begin;
create or replace function public.cd_validate_changes(p_changes jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare pair record;begin
 if p_changes is null then return '{}'::jsonb;end if;
 if jsonb_typeof(p_changes)<>'object' or pg_column_size(p_changes)>8000 then raise exception 'INVALID_PROPOSED_CHANGES';end if;
 for pair in select key,value from jsonb_each(p_changes) loop
  if pair.key not in ('name','dob','gender','phone','email','occupation','address','ward','hometown','birthplace','birthRegistration','nationality','ethnicity','religion','maritalStatus','temporaryAddress','currentAddress','otherName','fatherName','motherName','representativeName') or jsonb_typeof(pair.value)<>'string' or char_length(pair.value#>>'{}')>200 then raise exception 'INVALID_PROPOSED_FIELD:%',pair.key;end if;
 end loop;return p_changes;
end;$$;
create or replace function public.cd_save_request(p_data jsonb,p_expected_version integer default null,p_submit boolean default true,p_idempotency uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare citizen uuid;actor uuid:=auth.uid();member boolean:=public.cd_is_member();existing public.cd_ho_so_yeu_cau;request_id uuid;unit_id uuid;next_state text;changes jsonb;code text;before_doc jsonb;result jsonb;citizen_version integer;begin
 if member then citizen:=nullif(p_data->>'citizenId','')::uuid;else citizen:=public.cd_current_citizen();if citizen is null or (p_data ? 'citizenId' and p_data->>'citizenId'<>citizen::text) then raise exception 'CITIZEN_SESSION_REQUIRED' using errcode='42501';end if;end if;
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

