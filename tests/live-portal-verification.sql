-- Optional operator verification against the deployed database. Always rolls back.
-- Does not create Auth users, change project passwords, send messages or preserve test records.
begin;
do $test$
declare owners uuid[];roles jsonb;member_row jsonb;citizen jsonb;request jsonb;identifier text;code text;denied boolean:=false;original_report text;
begin
 select array_agg(auth_user_id order by id) into owners from public.cd_thanh_vien_du_an where public.cd_is_member_user(auth_user_id);
 if array_length(owners,1)<>3 then raise exception 'Expected three existing project members';end if;
 select md5(string_agg(to_jsonb(s)::text,'' order by slug)) into original_report from public.sections s;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owners[1])::text,true);
 -- This verification is intended for the initial rollout, when all existing members retain admin access.
 if not public.cd_has_capability(owners[1],'roles.manage') then raise exception 'Initial rollout role assumption no longer holds';end if;
 roles:=public.cd_member_permissions();
 select value into member_row from jsonb_array_elements(roles->'members') where (value->>'id')::uuid=(select id from public.cd_thanh_vien_du_an where auth_user_id=owners[2]);
 perform public.cd_set_member_role((member_row->>'id')::uuid,'intake',(member_row->>'version')::integer,'Kiểm thử tiếp nhận có rollback');
 roles:=public.cd_member_permissions();select value into member_row from jsonb_array_elements(roles->'members') where (value->>'id')::uuid=(select id from public.cd_thanh_vien_du_an where auth_user_id=owners[3]);
 perform public.cd_set_member_role((member_row->>'id')::uuid,'processor',(member_row->>'version')::integer,'Kiểm thử xử lý có rollback');
 loop identifier:='000'||lpad(floor(random()*1000000000)::bigint::text,9,'0');exit when not exists(select 1 from public.cd_cong_dan where so_dinh_danh=identifier);end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owners[2])::text,true);
 citizen:=public.cd_save_record(jsonb_build_object('name','Công dân kiểm thử triển khai','cccd',identifier,'dob','2002-08-15','gender','Nam','phone','0000000001','email','qa@example.invalid','address','Địa chỉ kiểm thử triển khai','provinceCode','HA_NOI','ward',(select ten_don_vi from public.cd_don_vi_hc where ma_don_vi='MAU-A')));
 code:='QA-'||substr(gen_random_uuid()::text,1,8);
 citizen:=public.cd_household_operation((citizen->>'id')::uuid,(citizen->>'rowVersion')::integer,code,(citizen->>'id')::uuid,'chu_ho','Lập hộ kiểm thử có rollback');
 citizen:=public.cd_residence_operation((citizen->>'id')::uuid,(citizen->>'rowVersion')::integer,'tam_tru','Địa chỉ tạm trú kiểm thử','BINH_DUONG',public.cd_today(),public.cd_today()+30,'Đăng ký tạm trú kiểm thử');
 request:=public.cd_save_request(jsonb_build_object('citizenId',citizen->>'id','title','Điều chỉnh nghề nghiệp kiểm thử','description','Xác minh luồng tiếp nhận, xử lý và phê duyệt','type','cap_nhat_thong_tin','changes',jsonb_build_object('occupation','Nghề nghiệp kiểm thử')),null,true,gen_random_uuid());
 request:=public.cd_process_request((request->>'id')::uuid,(request->>'rowVersion')::integer,'da_tiep_nhan','Đã tiếp nhận hồ sơ kiểm thử');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owners[3])::text,true);
 request:=public.cd_process_request((request->>'id')::uuid,(request->>'rowVersion')::integer,'dang_xu_ly','Đã kiểm tra thông tin đề nghị');
 begin perform public.cd_process_request((request->>'id')::uuid,(request->>'rowVersion')::integer,'hoan_thanh','Thử vượt quyền phê duyệt');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Processor bypassed approval permission';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owners[1])::text,true);
 request:=public.cd_process_request((request->>'id')::uuid,(request->>'rowVersion')::integer,'hoan_thanh','Đã duyệt điều chỉnh kiểm thử',null,true,(citizen->>'rowVersion')::integer,true);
 if request->>'status'<>'hoan_thanh' or public.cd_record_doc((citizen->>'id')::uuid)->>'occupation'<>'Nghề nghiệp kiểm thử' then raise exception 'Approval or record update failed';end if;
 if jsonb_array_length(public.cd_administrative_lookup('HA_NOI')->'provinces')<>1 then raise exception 'Administrative lookup failed';end if;
 if not (public.cd_backup_manifest() ? 'files') then raise exception 'Backup manifest failed';end if;
 if original_report is distinct from (select md5(string_agg(to_jsonb(s)::text,'' order by slug)) from public.sections s) then raise exception 'Report content changed unexpectedly';end if;
end;$test$;
rollback;
select jsonb_build_object('verification','database workflow assertions passed; transaction rolled back','members',(select count(*) from public.cd_thanh_vien_du_an m where public.cd_is_member_user(m.auth_user_id)),'schemaVersion',(select schema_version from public.cd_portal_meta where id=1)) as result;
