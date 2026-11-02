begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('cd-documents','cd-documents',false,2097152,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.cd_file_access(p_path text,p_upload boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.cd_tep_dinh_kem f join public.cd_giay_to_ho_tich d on d.id=f.giay_to_ho_tich_id where f.bucket='cd-documents' and f.object_path=p_path and ((p_upload and public.cd_is_member() and f.trang_thai='dang_tai' and f.nguoi_tai_len_user_id=auth.uid()) or (not p_upload and f.trang_thai='san_sang' and (public.cd_is_member() or d.cong_dan_id=public.cd_current_citizen()))));
$$;
drop policy if exists cd_document_upload on storage.objects;
create policy cd_document_upload on storage.objects for insert to authenticated with check(bucket_id='cd-documents' and public.cd_file_access(name,true));
drop policy if exists cd_document_download on storage.objects;
create policy cd_document_download on storage.objects for select to authenticated using(bucket_id='cd-documents' and public.cd_file_access(name,false));
create or replace function public.cd_prepare_attachment(p_document uuid,p_name text,p_mime text,p_size bigint) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;f public.cd_tep_dinh_kem;fid uuid:=gen_random_uuid();begin
 actor:=public.cd_require_member();perform 1 from public.cd_giay_to_ho_tich where id=p_document and trang_thai='hieu_luc' for update;if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 if p_mime is null or p_mime not in ('application/pdf','image/png','image/jpeg','image/webp') or p_size is null or p_size<1 or p_size>2097152 or p_name is null or char_length(p_name) not between 1 and 180 or p_name~'[\x00-\x1F]' then raise exception 'INVALID_ATTACHMENT';end if;
 if (select count(*) from public.cd_tep_dinh_kem where giay_to_ho_tich_id=p_document and trang_thai='san_sang')>=5 then raise exception 'ATTACHMENT_LIMIT';end if;
 insert into public.cd_tep_dinh_kem(id,giay_to_ho_tich_id,vai_tro_tep,bucket,object_path,ten_tep_goc,mime_type,kich_thuoc_bytes,nguoi_tai_len_user_id,trang_thai,created_by,updated_by) values(fid,p_document,'ban_sao','cd-documents',p_document::text||'/'||fid::text,p_name,p_mime,p_size,actor,'dang_tai',actor,actor) returning * into f;
 return jsonb_build_object('id',f.id,'path',f.object_path,'bucket',f.bucket);
end;$$;
create or replace function public.cd_finish_attachment(p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid;f public.cd_tep_dinh_kem;obj jsonb;begin
 actor:=public.cd_require_member();select * into f from public.cd_tep_dinh_kem where id=p_id and nguoi_tai_len_user_id=actor for update;
 if f.id is null then raise exception 'DOCUMENT_NOT_FOUND';end if;if f.trang_thai='san_sang' then return jsonb_build_object('id',f.id);end if;
 perform 1 from public.cd_giay_to_ho_tich where id=f.giay_to_ho_tich_id and trang_thai='hieu_luc' for update;if not found then raise exception 'DOCUMENT_NOT_FOUND';end if;
 if (select count(*) from public.cd_tep_dinh_kem where giay_to_ho_tich_id=f.giay_to_ho_tich_id and trang_thai='san_sang')>=5 then raise exception 'ATTACHMENT_LIMIT';end if;
 select metadata into obj from storage.objects where bucket_id=f.bucket and name=f.object_path;
 if obj is null or (obj->>'size')::bigint is distinct from f.kich_thuoc_bytes or obj->>'mimetype' is distinct from f.mime_type then raise exception 'INVALID_ATTACHMENT';end if;
 update public.cd_tep_dinh_kem set trang_thai='san_sang',updated_by=actor where id=f.id;
 perform public.cd_audit('Thêm tệp giấy tờ','attachment',f.id,null,jsonb_build_object('documentId',f.giay_to_ho_tich_id,'filename',f.ten_tep_goc),actor);return jsonb_build_object('id',f.id);
end;$$;
revoke all on function public.cd_file_access(text,boolean),public.cd_prepare_attachment(uuid,text,text,bigint),public.cd_finish_attachment(uuid) from public,anon;
grant execute on function public.cd_file_access(text,boolean),public.cd_prepare_attachment(uuid,text,text,bigint),public.cd_finish_attachment(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
