begin;
create unique index if not exists cd_verified_auth_session_idx on public.cd_phien_xac_thuc_cong_dan(auth_session_id);
create or replace function public.cd_portal_status() returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$ select jsonb_build_object('schemaVersion',schema_version,'fictionalOnly',true,'otpMode','demo') from public.cd_portal_meta where id=1;$$;
create or replace function public.cd_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare entry public.cd_rate_limits;begin
 if char_length(p_key)>180 or p_limit not between 1 and 300 or p_window_seconds not between 1 and 86400 then return false;end if;
 insert into public.cd_rate_limits(key,window_start,attempts) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set attempts=case when cd_rate_limits.window_start<=clock_timestamp()-make_interval(secs=>p_window_seconds) then 1 else cd_rate_limits.attempts+1 end,window_start=case when cd_rate_limits.window_start<=clock_timestamp()-make_interval(secs=>p_window_seconds) then clock_timestamp() else cd_rate_limits.window_start end returning * into entry;
 return entry.attempts<=p_limit;
end;$$;
create or replace function public.cd_auth_lookup(p_cccd text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('accountId',a.id,'citizenId',c.id,'authUserId',a.auth_user_id,'email',u.email,'phone',a.so_dien_thoai_otp,'status',a.trang_thai,'securityVersion',a.phien_ban_bao_mat)
 from public.cd_cong_dan c join public.cd_tai_khoan_cong_dan a on a.cong_dan_id=c.id join auth.users u on u.id=a.auth_user_id where c.so_dinh_danh=p_cccd;
$$;
create or replace function public.cd_account_prepare(p_citizen uuid,p_actor uuid,p_expected_version integer,p_operation uuid,p_reset boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare account public.cd_tai_khoan_cong_dan;citizen public.cd_cong_dan;v_email text;known_user uuid;begin
 if not public.cd_is_member_user(p_actor) then raise exception 'MEMBER_REQUIRED' using errcode='42501';end if;
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
 if not public.cd_is_member_user(p_actor) then raise exception 'MEMBER_REQUIRED' using errcode='42501';end if;
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
create or replace function public.cd_account_state(p_citizen uuid,p_expected_version integer,p_next text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;account public.cd_tai_khoan_cong_dan;begin
 actor:=public.cd_require_member();select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=p_citizen for update;
 if account.id is null or account.auth_user_id is null then raise exception 'ACCOUNT_NOT_ISSUED';end if;
 if account.row_version is distinct from p_expected_version then raise exception 'ACCOUNT_CONFLICT';end if;
 if not ((account.trang_thai='active' and p_next='locked') or (account.trang_thai='locked' and p_next='active')) or char_length(btrim(p_reason))<5 or char_length(p_reason)>1000 then raise exception 'INVALID_ACCOUNT_TRANSITION';end if;
 update public.cd_tai_khoan_cong_dan set trang_thai=p_next,phien_ban_bao_mat=phien_ban_bao_mat+1,nguoi_khoa_id=case when p_next='locked' then public.cd_member_id(actor) end,thoi_diem_khoa=case when p_next='locked' then clock_timestamp() end,ly_do_khoa=case when p_next='locked' then p_reason end,updated_by=actor where id=account.id;
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi=p_reason,updated_by=actor where tai_khoan_id=account.id and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi',updated_by=actor where tai_khoan_id=account.id and trang_thai='cho_xac_thuc';
 perform public.cd_audit(case when p_next='locked' then 'Khóa tài khoản' else 'Mở khóa tài khoản' end,'account',p_citizen,jsonb_build_object('account',account.trang_thai),jsonb_build_object('account',p_next,'reason',p_reason),actor);
 return public.cd_record_doc(p_citizen);
end;$$;
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
 values(p_challenge,p_account,p_auth_session,'dang_nhap','demo',p_otp_hash,clock_timestamp()+interval '2 minutes',clock_timestamp()+interval '30 seconds',0,5,'cho_xac_thuc',account.phien_ban_bao_mat) returning * into challenge;
 return jsonb_build_object('challengeId',challenge.id,'expiresAt',challenge.het_han_luc,'resendAt',challenge.duoc_gui_lai_luc,'phoneMasked',left(account.so_dien_thoai_otp,3)||' •••• '||right(account.so_dien_thoai_otp,3));
end;$$;
create or replace function public.cd_verify_challenge(p_challenge uuid,p_auth_user uuid,p_auth_session uuid,p_otp_hash text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare challenge public.cd_thach_thuc_otp;account public.cd_tai_khoan_cong_dan;session_id uuid;expires timestamptz;begin
 select * into challenge from public.cd_thach_thuc_otp where id=p_challenge;
 if challenge.id is null then return jsonb_build_object('ok',false,'error','OTP_INVALID');end if;
 select * into account from public.cd_tai_khoan_cong_dan where id=challenge.tai_khoan_id for update;
 select * into challenge from public.cd_thach_thuc_otp where id=p_challenge for update;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_SESSION_HASH';end if;
 if account.auth_user_id is distinct from p_auth_user or challenge.phien_dang_nhap_id is distinct from p_auth_session then return jsonb_build_object('ok',false,'error','OTP_INVALID');end if;
 if account.trang_thai<>'active' or account.phien_ban_bao_mat<>challenge.phien_ban_bao_mat then return jsonb_build_object('ok',false,'error','ACCOUNT_LOCKED');end if;
 if challenge.trang_thai<>'cho_xac_thuc' or challenge.het_han_luc<=now() or challenge.so_lan_sai>=challenge.gioi_han_thu then return jsonb_build_object('ok',false,'error','OTP_EXPIRED');end if;
 if not exists(select 1 from auth.sessions where id=p_auth_session and user_id=p_auth_user) then return jsonb_build_object('ok',false,'error','SESSION_EXPIRED');end if;
 if challenge.ma_bam_otp is distinct from p_otp_hash then
  update public.cd_thach_thuc_otp set so_lan_sai=so_lan_sai+1,trang_thai=case when so_lan_sai+1>=gioi_han_thu then 'khoa' else trang_thai end where id=p_challenge;
  return jsonb_build_object('ok',false,'error','OTP_INVALID','remaining',greatest(0,challenge.gioi_han_thu-challenge.so_lan_sai-1));
 end if;
 update public.cd_thach_thuc_otp set trang_thai='da_xac_thuc',da_su_dung_luc=clock_timestamp() where id=p_challenge;
 expires:=clock_timestamp()+interval '8 hours';
 insert into public.cd_phien_xac_thuc_cong_dan(tai_khoan_id,thach_thuc_otp_id,auth_session_id,token_hash,phien_ban_bao_mat,cap_luc,het_han_luc,hoat_dong_cuoi_luc)
 values(account.id,p_challenge,p_auth_session,p_token_hash,account.phien_ban_bao_mat,clock_timestamp(),expires,clock_timestamp()) returning id into session_id;
 return jsonb_build_object('ok',true,'citizenId',account.cong_dan_id,'verifiedUntil',expires,'id',session_id);
end;$$;
create or replace function public.cd_citizen_logout() returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 update public.cd_phien_xac_thuc_cong_dan s set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi='Công dân đăng xuất'
 from public.cd_tai_khoan_cong_dan a where a.id=s.tai_khoan_id and a.auth_user_id=auth.uid() and s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and s.thu_hoi_luc is null;return true;
end;$$;
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

commit;
notify pgrst,'reload schema';
