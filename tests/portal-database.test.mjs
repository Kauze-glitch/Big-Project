import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import fs from 'node:fs';
import {database,ids,asUser,record} from './portal-db-harness.mjs';
let db,number=100;before(async()=>{db=await database();await db.exec("alter table public.sections enable row level security;grant select,update on public.sections to authenticated;create policy read_sections on public.sections for select to authenticated using(true);create policy own_sections on public.sections for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());");});after(async()=>db?.close());
const value=async(tx,sql,args=[])=>{const result=await tx.query(sql,args);return result.rows[0]?.doc;};
const member=(sql,args=[],user=ids.member1)=>asUser(db,user,null,t=>value(t,sql,args));
const service=(sql,args=[])=>db.transaction(async t=>{await t.exec('set local role service_role');return value(t,sql,args);});
const save=async(overrides={})=>{const n=number++;return member('select cd_save_record($1::jsonb) doc',[JSON.stringify(record({cccd:'000'+String(n).padStart(9,'0'),phone:'000'+String(n).padStart(7,'0'),...overrides}))]);};
async function enroll(c,verify=true){const user=randomUUID(),session=randomUUID(),operation=randomUUID(),challenge=randomUUID();const a=await service('select cd_account_prepare($1,$2,0,$3,false) doc',[c.id,ids.member1,operation]);await db.query('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)',[user,a.email,JSON.stringify({citizen_id:c.id})]);const updated=await service('select cd_account_finish($1,$2,$3,$4) doc',[a.id,ids.member1,operation,user]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await service('select cd_issue_challenge($1,$2,$3,$4,$5) doc',[a.id,user,session,challenge,'a'.repeat(64)]);if(verify)await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[challenge,user,session,'a'.repeat(64),randomBytes(32).toString('hex')]);return {user,session,challenge,account:a.id,record:updated};}
const citizen=(u,sql,args=[])=>asUser(db,u.user,u.session,t=>value(t,sql,args));

test('Anonymous and unrelated Auth users cannot list or modify citizens or invoke internal helpers',async()=>{
 await assert.rejects(asUser(db,null,null,t=>value(t,'select cd_member_bundle() doc')),/permission denied/);
 await assert.rejects(member('select cd_member_bundle() doc',[],ids.citizen1),/MEMBER_REQUIRED/);
 await assert.rejects(member("select cd_record_doc($1) doc",[randomUUID()],ids.citizen1),/permission denied/);
 await assert.rejects(member("insert into cd_thanh_vien_du_an(auth_user_id,ten_hien_thi,quyen_he_thong,trang_thai) values($1,'fake','admin','hoat_dong') returning id doc",[ids.citizen1],ids.citizen1),/permission denied/);
});
test('Members share persisted records and conflicting updates do not overwrite another member',async()=>{
 const c=await save();const next=await member('select cd_save_record($1,$2,$3) doc',[JSON.stringify({...c,occupation:'Kỹ thuật viên'}),c.rowVersion,'Cập nhật nghề nghiệp'],ids.member2);
 await assert.rejects(member('select cd_save_record($1,$2) doc',[JSON.stringify({...c,name:'Tên cũ ghi đè'}),c.rowVersion]),/RECORD_CONFLICT/);
 const bundle=await member('select cd_member_bundle() doc',[],ids.member3);assert.equal(bundle.records.find(r=>r.id===c.id).occupation,next.occupation);
});
test('Invalid identity, duplicate identity and invalid dates leave the original data unchanged',async()=>{
 const c=await save();await assert.rejects(save({cccd:c.cccd}),/DUPLICATE_IDENTIFIER/);await assert.rejects(save({cccd:'123456789012'}),/FICTIONAL_IDENTIFIER/);await assert.rejects(save({dob:'2026-02-31'}),/INVALID_BIRTH_DATE/);await assert.rejects(save({email:'a@real.com'}),/FICTIONAL_EMAIL/);
});
test('Changing household head retains both role intervals and conflicts with stale edits to the previous head',async()=>{
 let a=await save();a=await member('select cd_save_record($1,$2) doc',[JSON.stringify({...a,householdCode:'HO-TEST-HEAD',householdRelation:'chu_ho',householdHeadId:a.id}),a.rowVersion]);const b=await save({householdCode:'HO-TEST-HEAD',householdRelation:'con',householdHeadId:a.id});
 await member('select cd_save_record($1,$2,$3) doc',[JSON.stringify({...b,householdRelation:'chu_ho',householdHeadId:b.id,householdHeadCccd:b.cccd,householdHeadVersion:b.rowVersion}),b.rowVersion,'Phân công chủ hộ mới']);
 const doc=await member('select cd_member_bundle() doc'),oldHead=doc.records.find(c=>c.id===a.id);assert.equal(oldHead.householdRelation,'khac');assert(oldHead.rowVersion>a.rowVersion);
 const intervals=await db.query('select quan_he_voi_chu_ho,den_ngay from cd_thanh_vien_ho where cong_dan_id=$1',[a.id]);assert.equal(intervals.rows.length,2);assert(intervals.rows.some(r=>r.quan_he_voi_chu_ho==='chu_ho'&&r.den_ngay));
 await assert.rejects(member('select cd_save_record($1,$2) doc',[JSON.stringify({...a,occupation:'Bản cũ'}),a.rowVersion]),/(RECORD|HOUSEHOLD_HEAD)_CONFLICT/);
});
test('A household head must already exist; names and an unsaved self ID cannot create a head implicitly',async()=>{
 await assert.rejects(save({householdCode:'HO-NO-HEAD',householdHead:'Người chưa tồn tại'}),/HOUSEHOLD_HEAD_NOT_FOUND/);
 const id=randomUUID();await assert.rejects(save({id,householdCode:'HO-UNSAVED',householdHeadId:id,householdRelation:'chu_ho'}),/HOUSEHOLD_HEAD_NOT_FOUND/);
 const head=await save(),child=await save({householdCode:'HO-LINK-EXISTS',householdHeadId:head.id,householdRelation:'con'});
 assert.equal(child.householdHeadId,head.id);assert.equal(child.householdHead,head.name);assert.equal(child.householdHeadCccd,head.cccd);
 const loaded=(await member('select cd_member_bundle() doc')).records.find(r=>r.id===head.id);assert.equal(loaded.householdRelation,'chu_ho');assert.equal(loaded.householdCode,child.householdCode);
 const renamed=await member('select cd_save_record($1,$2) doc',[JSON.stringify({...loaded,name:'Chủ hộ đổi tên'}),loaded.rowVersion]);assert.equal(renamed.name,'Chủ hộ đổi tên');
 assert.equal((await member('select cd_member_bundle() doc')).records.find(r=>r.id===child.id).householdHead,'Chủ hộ đổi tên');
 await assert.rejects(save({householdCode:'HO-OTHER',householdHeadId:head.id}),/HOUSEHOLD_HEAD_OTHER_HOUSE/);
});
test('Province selection is mandatory and each residence uses a separate catalog FK; obsolete data is never guessed',async()=>{
 const catalog=await db.query('select code,name from cd_tinh_thanh_cu');assert.equal(catalog.rows.length,63);assert(catalog.rows.some(p=>p.name==='Hà Giang'));assert(catalog.rows.some(p=>p.name==='Bình Dương'));assert(catalog.rows.some(p=>p.name==='Thừa Thiên Huế'));
 await assert.rejects(save({provinceCode:''}),/PROVINCE_REQUIRED/);await assert.rejects(save({provinceCode:'MARS'}),/PROVINCE_REQUIRED/);
 await assert.rejects(save({temporaryAddress:'Một nơi tạm trú'}),/PROVINCE_REQUIRED/);
 const c=await save({provinceCode:'BAC_GIANG',temporaryAddress:'Địa chỉ tạm trú',temporaryProvinceCode:'BINH_DUONG',currentAddress:'Nơi ở hiện tại',currentProvinceCode:'HA_GIANG'});
 assert.equal(c.provinceName,'Bắc Giang');assert.equal(c.temporaryProvinceName,'Bình Dương');assert.equal(c.currentProvinceName,'Hà Giang');
 const rows=(await db.query('select loai_cu_tru,tinh_thanh_code from cd_cu_tru where cong_dan_id=$1 and den_ngay is null',[c.id])).rows;assert.equal(rows.length,3);assert.equal(rows.find(r=>r.loai_cu_tru==='tam_tru').tinh_thanh_code,'BINH_DUONG');
 await assert.rejects(db.query("update cd_cu_tru set tinh_thanh_code='UNKNOWN' where cong_dan_id=$1",[c.id]),/foreign key/);
});
test('Import validates old-province catalog and only joins households with an already registered head',async()=>{
 const orphan=record({cccd:'000000008801',phone:'0000008801',householdCode:'HO-NOT-CREATED',householdHeadCccd:'000000008800'});
 const preview=await member('select cd_import_preview($1) doc',[JSON.stringify([{row:2,data:orphan}])]);assert.equal(preview[0].error,'HOUSEHOLD_IMPORT_MANAGE_FIRST');
 const noProvince=await member('select cd_import_preview($1) doc',[JSON.stringify([{row:2,data:record({provinceCode:'NOT_A_PROVINCE'})}])]);assert.match(noProvince[0].error,/PROVINCE_REQUIRED/);
 const head=await save();const headWithHouse=await member('select cd_save_record($1,$2) doc',[JSON.stringify({...head,householdCode:'HO-IMPORT-READY',householdHeadId:head.id,householdRelation:'chu_ho'}),head.rowVersion]);
 const data=record({cccd:'000000008802',phone:'0000008802',householdCode:'HO-IMPORT-READY',householdHeadCccd:head.cccd,householdRelation:'con'}),checked=(await member('select cd_import_preview($1) doc',[JSON.stringify([{row:2,data}])]))[0];assert.equal(checked.error,null);
 const imported=await member('select cd_import_commit($1,$2,$3,$4) doc',[JSON.stringify([{row:2,data:checked.data}]),'create','household.csv',randomUUID()]);assert.equal(imported.created,1);
 assert.equal((await member('select cd_member_bundle() doc')).records.find(r=>r.cccd===data.cccd).householdHeadId,headWithHouse.id);
});
test('Residence and card changes retain historical rows; restoring a record creates an audit revision',async()=>{
 let c=await save({cardIssuedOn:'2025-09-01',cardExpiresOn:'2035-09-01',cardIssuer:'Cơ quan minh họa',cardStatus:'active'});const original=c;const history=await member('select cd_record_history($1) doc',[c.id]);
 c=await member('select cd_save_record($1,$2,$3) doc',[JSON.stringify({...c,address:'48 đường Minh Họa',cardIssuedOn:'2026-01-01',cardExpiresOn:'2036-01-01',cardIssuer:'Nơi cấp mới',cardStatus:'active'}),c.rowVersion,'Cấp đổi thẻ']);
 assert.equal((await db.query('select count(*) n from cd_cu_tru where cong_dan_id=$1',[c.id])).rows[0].n,2);assert.equal((await db.query('select count(*) n from cd_the_can_cuoc where cong_dan_id=$1',[c.id])).rows[0].n,2);
 c=await member('select cd_restore_record($1,$2,$3,$4) doc',[c.id,history[0].id,c.rowVersion,'Khôi phục hồ sơ đã kiểm tra']);assert.equal(c.address,original.address);assert(c.rowVersion>original.rowVersion);assert.equal((await member('select cd_record_history($1) doc',[c.id]))[0].hanh_dong,'Khôi phục hồ sơ');
});
test('Password-authenticated sessions have no data access until OTP succeeds; users only read their own profile',async()=>{
 const c=await save(),other=await save();const u=await enroll(c,false);await assert.rejects(citizen(u,'select cd_citizen_bundle() doc'),/CITIZEN_SESSION_REQUIRED/);
 assert.equal(await citizen(u,'select count(*)::int doc from cd_cong_dan'),0);
 const wrong=await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[u.challenge,u.user,u.session,'b'.repeat(64),randomBytes(32).toString('hex')]);assert.equal(wrong.remaining,4);
 const success=await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[u.challenge,u.user,u.session,'a'.repeat(64),randomBytes(32).toString('hex')]);assert.equal(success.ok,true);
 assert.equal((await citizen(u,'select cd_citizen_bundle() doc')).record.id,c.id);assert.equal(await citizen(u,'select count(*)::int doc from cd_cong_dan where id=$1',[other.id]),0);
 assert.equal((await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[u.challenge,u.user,u.session,'a'.repeat(64),randomBytes(32).toString('hex')])).ok,false);
});
test('Five wrong OTP attempts exhaust the challenge and the cooldown is enforced server-side',async()=>{
 const u=await enroll(await save(),false);for(let i=0;i<5;i++)assert.equal((await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[u.challenge,u.user,u.session,'b'.repeat(64),randomBytes(32).toString('hex')])).ok,false);
 assert.equal((await service('select cd_verify_challenge($1,$2,$3,$4,$5) doc',[u.challenge,u.user,u.session,'a'.repeat(64),randomBytes(32).toString('hex')])).error,'OTP_EXPIRED');
 await assert.rejects(service('select cd_issue_challenge($1,$2,$3,$4,$5) doc',[u.account,u.user,u.session,randomUUID(),'a'.repeat(64)]),/OTP_COOLDOWN/);
});
test('Locking an account revokes the existing citizen session and unlocking does not resurrect it',async()=>{
 const u=await enroll(await save());let c=await member('select cd_account_state($1,$2,$3,$4) doc',[u.record.id,u.record.accountVersion,'locked','Khóa tài khoản theo yêu cầu']);await assert.rejects(citizen(u,'select cd_citizen_bundle() doc'),/CITIZEN_SESSION_REQUIRED/);
 await member('select cd_account_state($1,$2,$3,$4) doc',[c.id,c.accountVersion,'active','Mở khóa sau khi kiểm tra']);await assert.rejects(citizen(u,'select cd_citizen_bundle() doc'),/CITIZEN_SESSION_REQUIRED/);
});
test('Citizen requests follow supplement, resubmit, review and approval; another citizen cannot cancel them',async()=>{
 const u=await enroll(await save()),other=await enroll(await save());let r=await citizen(u,'select cd_save_request($1,null,true,$2) doc',[JSON.stringify({citizenId:u.record.id,title:'Điều chỉnh nghề nghiệp',type:'cap_nhat_thong_tin',description:'Đề nghị cập nhật nghề nghiệp trong hồ sơ.',changes:{occupation:'Kỹ thuật viên'}}),randomUUID()]);
 await assert.rejects(citizen(other,'select cd_process_request($1,$2,$3,$4) doc',[r.id,r.rowVersion,'da_huy','Hủy yêu cầu không thuộc tôi']),/REQUEST_NOT_ALLOWED/);
 await assert.rejects(member('select cd_process_request($1,$2,$3,$4) doc',[r.id,r.rowVersion,'hoan_thanh','Bỏ qua bước tiếp nhận']),/INVALID_REQUEST_TRANSITION/);
 for(const state of ['da_tiep_nhan','dang_xu_ly','can_bo_sung'])r=await member('select cd_process_request($1,$2,$3,$4) doc',[r.id,r.rowVersion,state,'Đã kiểm tra nội dung hồ sơ']);
 r=await citizen(u,'select cd_save_request($1,$2,true,null) doc',[JSON.stringify({id:r.id,citizenId:u.record.id,title:r.title,type:r.type,description:r.description+' Đã bổ sung thông tin.',changes:r.changes}),r.rowVersion]);
 for(const state of ['da_tiep_nhan','dang_xu_ly'])r=await member('select cd_process_request($1,$2,$3,$4) doc',[r.id,r.rowVersion,state,'Đã kiểm tra nội dung bổ sung']);
 const current=(await citizen(u,'select cd_citizen_bundle() doc')).record;r=await member('select cd_process_request($1,$2,$3,$4,null,true,$5) doc',[r.id,r.rowVersion,'hoan_thanh','Đã duyệt và cập nhật thông tin',current.rowVersion]);
 assert.equal(r.status,'hoan_thanh');assert(r.history.length>=8);assert.equal((await citizen(u,'select cd_citizen_bundle() doc')).record.occupation,'Kỹ thuật viên');
 await assert.rejects(member('select cd_process_request($1,$2,$3,$4) doc',[r.id,r.rowVersion,'dang_xu_ly','Không được quay lại']),/REQUEST_TERMINAL/);
});
test('Import is atomic by default; partial import is explicit and retries are idempotent',async()=>{
 const n=number++,rows=[{row:2,data:record({cccd:'000'+String(n).padStart(9,'0')})},{row:3,data:record({cccd:'bad'})}],key=randomUUID();
 await assert.rejects(member('select cd_import_commit($1,$2,$3,$4,false) doc',[JSON.stringify(rows),'create','mau.csv',key]),/IMPORT_HAS_ERRORS/);
 assert.equal((await db.query('select count(*)::int n from cd_cong_dan where so_dinh_danh=$1',[rows[0].data.cccd])).rows[0].n,0);
 const result=await member('select cd_import_commit($1,$2,$3,$4,true) doc',[JSON.stringify(rows),'create','mau.csv',key]);assert.equal(result.created,1);assert.equal(result.failed,1);
 const retry=await member('select cd_import_commit($1,$2,$3,$4,true) doc',[JSON.stringify(rows),'create','mau.csv',key]);assert.deepEqual(retry,result);
});
test('Import preview detects duplicates and update mode checks the preview version again',async()=>{
 const c=await save(),rows=[{row:2,data:{cccd:c.cccd,occupation:'Giáo viên'}}];let preview=await member('select cd_import_preview($1,$2) doc',[JSON.stringify(rows),'create']);assert.equal(preview[0].error,'DUPLICATE_IDENTIFIER');preview=await member('select cd_import_preview($1,$2) doc',[JSON.stringify(rows),'merge']);assert.equal(preview[0].error,null);assert.equal(preview[0].expectedVersion,c.rowVersion);
 await member('select cd_save_record($1,$2) doc',[JSON.stringify({...c,occupation:'Thông tin mới'}),c.rowVersion]);
 await assert.rejects(member('select cd_import_commit($1,$2,$3,$4,false) doc',[JSON.stringify([{...rows[0],expectedVersion:preview[0].expectedVersion}]),'merge','mau.csv',randomUUID()]),/IMPORT_HAS_ERRORS/);
 const duplicate=await member('select cd_import_preview($1,$2) doc',[JSON.stringify([{row:2,data:record()},{row:3,data:record()}]),'create']);assert(duplicate.every(r=>r.error==='DUPLICATE_IN_FILE'));
});
test('Personal ERD layouts are isolated, shared layouts are visible, and stale saves are rejected',async()=>{
 const data={core:{CONG_DAN:{x:120,y:330}}};const personal=await member('select cd_erd_save($1,$2,0) doc',['personal',JSON.stringify(data)]);assert.equal(personal.version,1);
 assert.deepEqual((await member('select cd_erd_load($1) doc',['personal'],ids.member2)).layouts,{});
 assert.equal(await member('select count(*)::int doc from cd_erd_layouts where not is_shared',[],ids.member2),0);
 const shared=await member('select cd_erd_save($1,$2,0) doc',['shared',JSON.stringify(data)]);assert.deepEqual((await member('select cd_erd_load($1) doc',['shared'],ids.member2)).layouts,data);
 await member('select cd_erd_save($1,$2,$3) doc',['shared',JSON.stringify({}),shared.version],ids.member2);await assert.rejects(member('select cd_erd_save($1,$2,$3) doc',['shared',JSON.stringify(data),shared.version]),/LAYOUT_CONFLICT/);
 await assert.rejects(member('select cd_erd_save($1,$2,0) doc',['personal',JSON.stringify({core:{CONG_DAN:{x:-50,y:33}}})],ids.member3),/INVALID_LAYOUT/);
});
test('Section history captures updates; only its owner restores and old timestamps cannot overwrite a fresh edit',async()=>{
 const histories=await member('select cd_section_history($1) doc',['phan1']);const initial=histories.at(-1);const timestamp=(await db.query('select updated_at from sections where slug=$1',['phan1'])).rows[0].updated_at;
 await member('update sections set title=$1,updated_at=clock_timestamp() where slug=$2 returning to_jsonb(sections.*) doc',['Tiêu đề mới','phan1']);
 const fresh=(await db.query('select updated_at from sections where slug=$1',['phan1'])).rows[0].updated_at;
 await assert.rejects(member('select cd_restore_section($1,$2,$3,$4) doc',['phan1',initial.id,fresh,'Khôi phục từ bản đã lưu'],ids.member2),/SECTION_OWNER_REQUIRED/);
 await assert.rejects(member('select cd_restore_section($1,$2,$3,$4) doc',['phan1',initial.id,timestamp,'Khôi phục từ bản đã lưu']),/SECTION_CONFLICT/);
 const restored=await member('select cd_restore_section($1,$2,$3,$4) doc',['phan1',initial.id,fresh,'Khôi phục từ bản đã lưu']);assert.equal(restored.title,initial.title);assert.equal((await member('select cd_section_history($1) doc',['phan1']))[0].action,'Khôi phục phiên bản');
});
test('Service-only provisioning cannot target a project account',async()=>{
 const c=await save(),operation=randomUUID(),a=await service('select cd_account_prepare($1,$2,0,$3,false) doc',[c.id,ids.member1,operation]);await assert.rejects(service('select cd_account_finish($1,$2,$3,$4) doc',[a.id,ids.member1,operation,ids.member1]),/PROJECT_ACCOUNT_PROTECTED/);
});
test('Additive migrations can be rerun without deleting citizen data',async()=>{
 const before=(await db.query('select count(*)::int n from cd_cong_dan')).rows[0].n;for(const file of fs.readdirSync('supabase').filter(f=>/^20261101_\d+_/.test(f)).sort())await db.exec(fs.readFileSync('supabase/'+file,'utf8'));assert.equal((await db.query('select count(*)::int n from cd_cong_dan')).rows[0].n,before);
});
