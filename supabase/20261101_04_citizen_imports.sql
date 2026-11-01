begin;
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
   normalized:=case when existing.id is not null then public.cd_record_doc(existing.id)||row_doc else row_doc-'id' end;
   perform public.cd_validate_record(normalized);
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
    doc:=public.cd_record_doc(existing.id)||raw||jsonb_build_object('id',existing.id);
   else
    if nullif(row_item->>'expectedVersion','') is not null then raise exception 'RECORD_CONFLICT';end if;
    doc:=raw-'id';
   end if;
   saved:=public.cd_write_record(doc,existing.row_version,'Nhập tệp '||p_filename,actor,'Nhập dữ liệu hồ sơ');
  exception when others then message:=sqlerrm;end;
  if message is not null then failed_count:=failed_count+1;elsif existing.id is null then created_count:=created_count+1;else updated_count:=updated_count+1;end if;
  insert into public.cd_dong_nhap(dot_nhap_id,so_dong,du_lieu_goc,du_lieu_chuan_hoa,loi_kiem_tra,trang_thai,cong_dan_id,created_by,updated_by)
  values(batch_id,line,coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(raw)='object' then raw else '{}'::jsonb end) where key=any(array['name','cccd','dob','gender','phone','email','address','ward','occupation','otherName','nationality','ethnicity','religion','hometown','birthplace','birthRegistration','maritalStatus','temporaryAddress','currentAddress','householdCode','householdHead','householdRelation','fatherName','motherName','representativeName','cardIssuedOn','cardExpiresOn','cardIssuer','cardStatus'])), '{}'::jsonb),saved,case when message is not null then jsonb_build_array(message) else '[]' end,case when message is not null then 'loi' else 'da_nhap' end,nullif(saved->>'id','')::uuid,actor,actor);
  results:=results||jsonb_build_array(jsonb_build_object('row',line,'error',message,'id',saved->>'id','action',case when existing.id is null then 'create' else 'update' end));
 end loop;
 result:=jsonb_build_object('batchId',batch_id,'created',created_count,'updated',updated_count,'failed',failed_count,'rows',results);
 if failed_count>0 and not p_allow_partial then raise exception 'IMPORT_HAS_ERRORS' using detail=result::text;end if;
 update public.cd_dot_nhap_du_lieu set trang_thai=case when failed_count=0 then 'hoan_thanh' else 'co_loi' end,ket_thuc_luc=clock_timestamp(),ket_qua=result,updated_by=actor where id=batch_id;
 perform public.cd_audit('Nhập dữ liệu từ tệp','import',batch_id,null,result,actor);return result;
end;$$;
create or replace function public.cd_import_batches() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return coalesce((select jsonb_agg(jsonb_build_object('id',id,'filename',ten_tep,'at',bat_dau_luc,'status',trang_thai,'result',ket_qua,'actor',public.cd_actor_label(created_by)) order by bat_dau_luc desc) from (select * from public.cd_dot_nhap_du_lieu order by bat_dau_luc desc limit 30) d),'[]');end;$$;
-- Deny public execution of internal helpers, including SECURITY DEFINER functions.
do $permissions$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cd\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname=any(array['cd_is_member','cd_current_citizen','cd_member_bundle','cd_citizen_bundle','cd_save_record','cd_record_history','cd_restore_record','cd_save_request','cd_process_request','cd_import_preview','cd_import_commit','cd_import_batches','cd_erd_load','cd_erd_save','cd_section_history','cd_restore_section','cd_account_state']) then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if f.proname='cd_portal_status' then execute format('grant execute on function %s to anon,authenticated',f.signature);end if;
 end loop;
end $permissions$;
commit;
