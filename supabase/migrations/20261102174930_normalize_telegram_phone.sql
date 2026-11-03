begin;
-- Canonicalize explicitly recognizable phone formats; never invent missing digits or a foreign country code.
create or replace function public.cd_normalize_telegram_phone(p_value text) returns text
language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare v text;begin
 if p_value is null or char_length(p_value)>40 then return null;end if;
 v:=translate(btrim(p_value),chr(160)||chr(8239),'  ');
 if v~'[^0-9+[:space:]().-]' then return null;end if;
 v:=regexp_replace(v,'[[:space:]().-]','','g');
 if left(v,2)='00' then v:='+'||substr(v,3);end if;
 if v~'^0[1-9][0-9]{8,9}$' then v:='+84'||substr(v,2);elsif v~'^840?[1-9][0-9]{8,9}$' then v:='+'||v;end if;
 if v~'^\+840[1-9][0-9]{8,9}$' then v:='+84'||substr(v,5);end if;
 if left(v,3)='+84' and v!~'^\+84[1-9][0-9]{8,9}$' then return null;end if;
 if v!~'^\+[1-9][0-9]{6,14}$' then return null;end if;return v;
end;$$;
revoke all on function public.cd_normalize_telegram_phone(text) from public,anon,authenticated;
grant execute on function public.cd_normalize_telegram_phone(text) to service_role;

create or replace function public.cd_account_otp_settings(p_citizen uuid,p_channel text,p_phone text,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;account public.cd_tai_khoan_cong_dan;normalized_phone text;begin
 actor:=public.cd_require_capability('accounts.manage');select * into account from public.cd_tai_khoan_cong_dan where cong_dan_id=p_citizen for update;
 if account.id is null or account.auth_user_id is null then raise exception 'ACCOUNT_NOT_ISSUED';end if;
 if account.row_version is distinct from p_expected_version then raise exception 'ACCOUNT_CONFLICT';end if;
 normalized_phone:=public.cd_normalize_telegram_phone(p_phone);
 if p_channel is null or p_channel not in ('demo','telegram') or (p_channel='telegram' and normalized_phone is null) then raise exception 'INVALID_OTP_CHANNEL';end if;
 if account.provisioning_key is not null and account.provisioning_started_at>now()-interval '2 minutes' then raise exception 'ACCOUNT_PROVISIONING_BUSY';end if;
 update public.cd_tai_khoan_cong_dan set kenh_otp=p_channel,telegram_otp_phone=case when p_channel='telegram' then normalized_phone end,phien_ban_bao_mat=phien_ban_bao_mat+1,updated_by=actor where id=account.id;
 update public.cd_phien_xac_thuc_cong_dan set thu_hoi_luc=clock_timestamp(),ly_do_thu_hoi='Thay đổi kênh nhận OTP',updated_by=actor where tai_khoan_id=account.id and thu_hoi_luc is null;
 update public.cd_thach_thuc_otp set trang_thai='thu_hoi',updated_by=actor where tai_khoan_id=account.id and trang_thai='cho_xac_thuc';
 perform public.cd_audit('Thay đổi kênh nhận OTP','account',p_citizen,jsonb_build_object('channel',account.kenh_otp),jsonb_build_object('channel',p_channel,'phoneMasked',case when p_channel='telegram' then left(normalized_phone,3)||' •••• '||right(normalized_phone,3) end),actor);
 return public.cd_record_doc(p_citizen);
end;$$;
notify pgrst,'reload schema';
commit;
