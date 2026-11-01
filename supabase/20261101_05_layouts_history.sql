begin;
create or replace function public.cd_erd_load(p_target text default 'personal') returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare actor uuid;layout public.cd_erd_layouts;v_key text;begin
 actor:=public.cd_require_member();if p_target not in ('personal','shared') then raise exception 'INVALID_LAYOUT_TARGET';end if;v_key:=case when p_target='shared' then 'shared' else 'personal:'||actor::text end;
 select * into layout from public.cd_erd_layouts where layout_key=v_key;
 return jsonb_build_object('target',p_target,'layouts',coalesce(layout.layouts,'{}'),'version',coalesce(layout.row_version,0),'updatedAt',layout.updated_at,'updatedBy',case when layout.updated_by is not null then public.cd_actor_label(layout.updated_by) end);
end;$$;
create or replace function public.cd_erd_save(p_target text,p_layouts jsonb,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;layout public.cd_erd_layouts;v_key text;scope record;node record;valid_names text[]:=array['DON_VI_HC','CONG_DAN','QUOC_TICH_CONG_DAN','CU_TRU','HO_GIA_DINH','THANH_VIEN_HO','THE_CAN_CUOC','QUAN_HE_NHAN_THAN','TINH_TRANG_HON_NHAN','GIAY_TO_HO_TICH','CAN_BO','HO_SO_YEU_CAU','LICH_SU_XU_LY','BIEN_DONG','TEP_DINH_KEM','THANH_VIEN_DU_AN','TAI_KHOAN_CONG_DAN','THACH_THUC_OTP','PHIEN_XAC_THUC_CONG_DAN','NHAT_KY_THAO_TAC','DOT_NHAP_DU_LIEU','DONG_NHAP'];begin
 actor:=public.cd_require_member();if p_target not in ('personal','shared') or jsonb_typeof(p_layouts)<>'object' or pg_column_size(p_layouts)>250000 then raise exception 'INVALID_LAYOUT';end if;
 for scope in select key,value from jsonb_each(p_layouts) loop
  if scope.key !~ '^(core|all|neighbors:[A-Z_]+|[0-4])(:common)?$' or jsonb_typeof(scope.value)<>'object' then raise exception 'INVALID_LAYOUT';end if;
  for node in select key,value from jsonb_each(scope.value) loop
   if not node.key=any(valid_names) or jsonb_typeof(node.value)<>'object' or jsonb_typeof(node.value->'x') is distinct from 'number' or jsonb_typeof(node.value->'y') is distinct from 'number' or (node.value->>'x')::numeric not between 20 and 100000 or (node.value->>'y')::numeric not between 20 and 100000 then raise exception 'INVALID_LAYOUT';end if;
  end loop;
 end loop;
 v_key:=case when p_target='shared' then 'shared' else 'personal:'||actor::text end;
 select * into layout from public.cd_erd_layouts where layout_key=v_key for update;
 if layout.layout_key is null then
  if p_expected_version is distinct from 0 then raise exception 'LAYOUT_CONFLICT';end if;
  insert into public.cd_erd_layouts(layout_key,owner_user_id,is_shared,layouts,row_version,updated_by)
   values(v_key,case when p_target='personal' then actor end,p_target='shared',p_layouts,1,actor) on conflict(layout_key) do nothing;
  if not found then raise exception 'LAYOUT_CONFLICT';end if;
 else
  if layout.row_version is distinct from p_expected_version then raise exception 'LAYOUT_CONFLICT';end if;
  update public.cd_erd_layouts set layouts=p_layouts,row_version=row_version+1,updated_at=clock_timestamp(),updated_by=actor where layout_key=v_key;
 end if;
 if p_target='shared' then perform public.cd_audit('Lưu bố cục sơ đồ chung','layout',null,null,jsonb_build_object('target','shared'),actor);end if;
 return public.cd_erd_load(p_target);
end;$$;

alter table public.cd_section_revisions add column if not exists reason text not null default '';
create or replace function public.cd_capture_section() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.cd_section_revisions(section_slug,actor_user_id,actor_label,action,before_row,after_row,reason)
 values(new.slug,auth.uid(),public.cd_actor_label(auth.uid()),case when coalesce(current_setting('cd.restore_reason',true),'')<>'' then 'Khôi phục phiên bản' else 'Cập nhật nội dung' end,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),coalesce(current_setting('cd.restore_reason',true),''));return new;
end;$$;
drop trigger if exists cd_section_history_trigger on public.sections;
create trigger cd_section_history_trigger after insert or update on public.sections for each row execute function public.cd_capture_section();
insert into public.cd_section_revisions(section_slug,actor_user_id,actor_label,action,after_row)
 select s.slug,s.owner_id,public.cd_actor_label(s.owner_id),'Phiên bản ban đầu',to_jsonb(s) from public.sections s where not exists(select 1 from public.cd_section_revisions r where r.section_slug=s.slug);
create or replace function public.cd_section_history(p_slug text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',after_row->>'title','actor',actor_label,'at',occurred_at,'action',action,'reason',reason,'progress',after_row->>'progress_status','contentLength',char_length(after_row->>'content')) order by occurred_at desc,id) from (select * from public.cd_section_revisions where section_slug=p_slug order by occurred_at desc limit 100) r),'[]');end;$$;
create or replace function public.cd_section_revision(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin perform public.cd_require_member();return (select jsonb_build_object('id',id,'slug',section_slug,'title',after_row->>'title','content',after_row->>'content','progress',after_row->>'progress_status','actor',actor_label,'at',occurred_at) from public.cd_section_revisions where id=p_id);end;$$;
create or replace function public.cd_restore_section(p_slug text,p_revision uuid,p_expected_updated_at timestamptz,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;snapshot jsonb;existing public.sections;restored public.sections;restored_content text;old_doc jsonb;current_doc jsonb;begin
 actor:=public.cd_require_member();if char_length(btrim(p_reason))<5 or char_length(p_reason)>1000 then raise exception 'RESTORE_REASON_REQUIRED';end if;
 select * into existing from public.sections where slug=p_slug for update;
 if existing.slug is null or existing.owner_id<>actor then raise exception 'SECTION_OWNER_REQUIRED' using errcode='42501';end if;
 if existing.updated_at is distinct from p_expected_updated_at then raise exception 'SECTION_CONFLICT';end if;
 select after_row into snapshot from public.cd_section_revisions where id=p_revision and section_slug=p_slug;
 if snapshot is null then raise exception 'REVISION_NOT_FOUND';end if;
 restored_content:=snapshot->>'content';
 begin
  old_doc:=restored_content::jsonb;current_doc:=existing.content::jsonb;
  if old_doc->>'format'='gocviet-v2' and current_doc->>'format'='gocviet-v2' then restored_content:=jsonb_set(old_doc,'{author}',coalesce(current_doc->'author','null'::jsonb),true)::text;end if;
 exception when invalid_text_representation then null;end;
 perform set_config('cd.restore_reason',p_reason,true);
 update public.sections set title=snapshot->>'title',content=restored_content,progress_status=case when snapshot->>'progress_status' in ('drafting','review','complete') then snapshot->>'progress_status' else 'drafting' end,updated_at=clock_timestamp() where slug=p_slug returning * into restored;
 perform set_config('cd.restore_reason','',true);return to_jsonb(restored);
end;$$;
-- Deny public execution of internal helpers, including SECURITY DEFINER functions.
do $permissions$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cd\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname=any(array['cd_is_member','cd_current_citizen','cd_member_bundle','cd_citizen_bundle','cd_save_record','cd_record_history','cd_restore_record','cd_save_request','cd_process_request','cd_import_preview','cd_import_commit','cd_import_batches','cd_erd_load','cd_erd_save','cd_section_history','cd_section_revision','cd_restore_section','cd_account_state']) then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if f.proname='cd_portal_status' then execute format('grant execute on function %s to anon,authenticated',f.signature);end if;
 end loop;
end $permissions$;
commit;
