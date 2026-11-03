import test from 'node:test';import assert from 'node:assert/strict';import {database,ids,record,asUser} from './portal-db-harness.mjs';
let db;test.before(async()=>db=await database());test.after(async()=>db?.close());
const call=(who,sql,args=[])=>asUser(db,who,null,tx=>tx.query(sql,args)).then(r=>r.rows[0]?.d);
const permissions=who=>call(who,'select cd_member_permissions() as d');
async function assign(who,role){const p=await permissions(ids.member1),target=p.members.find(m=>m.id===who||m.name==='member'+who);if(!target)throw Error('No target');return call(ids.member1,'select cd_set_member_role($1,$2,$3,$4) as d',[target.id,role,target.version,'Phân công nghiệp vụ kiểm thử']);}
test('Existing members retain access; guests and unrelated users cannot inspect or assign capabilities',async()=>{
 for(const id of [ids.member1,ids.member2,ids.member3]){const p=await permissions(id);assert.equal(p.role,'admin');assert(p.capabilities.includes('roles.manage'));}
 await assert.rejects(permissions(null),/permission denied|MEMBER_REQUIRED/);await assert.rejects(permissions(ids.citizen1),/MEMBER_REQUIRED/);
});
let citizen,request;
test('Intake creates records and receives requests; processor works them; only approver can decide or apply changes',async()=>{
 await assign('2','intake');await assign('3','processor');
 const intake=await permissions(ids.member2);assert(!intake.capabilities.includes('requests.decide'));assert(!intake.capabilities.includes('roles.manage'));
 await assert.rejects(call(ids.member2,'select cd_set_member_role($1,$2,$3,$4)',[(await permissions(ids.member1)).members[0].id,'admin',1,'Tự nâng quyền thử']),/PERMISSION_DENIED/);
 citizen=await call(ids.member2,'select cd_save_record($1) as d',[JSON.stringify(record())]);
 request=await call(ids.member2,'select cd_save_request($1,null,true,gen_random_uuid()) as d',[JSON.stringify({citizenId:citizen.id,title:'Điều chỉnh nghề nghiệp',description:'Đề nghị cập nhật nghề nghiệp mới',type:'cap_nhat_thong_tin',changes:{occupation:'Kỹ thuật viên'}})]);
 const advance=(who,next)=>call(who,'select cd_process_request($1,$2,$3,$4) as d',[request.id,request.rowVersion,next,'Đã kiểm tra giấy tờ theo yêu cầu']);
 await assert.rejects(advance(ids.member3,'da_tiep_nhan'),/PERMISSION_DENIED/);request=await advance(ids.member2,'da_tiep_nhan');
 await assert.rejects(advance(ids.member2,'dang_xu_ly'),/PERMISSION_DENIED/);request=await advance(ids.member3,'dang_xu_ly');
 await assert.rejects(advance(ids.member3,'hoan_thanh'),/PERMISSION_DENIED/);await assign('2','approver');
 request=await call(ids.member2,'select cd_process_request($1,$2,$3,$4,null,true,$5,true) as d',[request.id,request.rowVersion,'hoan_thanh','Đã phê duyệt điều chỉnh theo đề nghị',citizen.rowVersion]);assert.equal(request.status,'hoan_thanh');
 const bundle=await call(ids.member2,'select cd_member_bundle() as d');assert.equal(bundle.records.find(r=>r.id===citizen.id).occupation,'Kỹ thuật viên');
 await assert.rejects(call(ids.member2,'select cd_save_record($1) as d',[JSON.stringify(record({cccd:'000000000002'}))]),/PERMISSION_DENIED/);
 await assert.rejects(call(ids.member2,'select cd_import_preview($1,$2)',[JSON.stringify([record()]),'create']),/PERMISSION_DENIED/);
 await assert.rejects(call(ids.member2,'select cd_account_state($1,1,$2,$3)',[citizen.id,'locked','Thử khóa tài khoản']),/PERMISSION_DENIED/);
});
test('Role changes reject stale versions and cannot remove the final administrator',async()=>{
 const p=await permissions(ids.member1),self=p.members.find(m=>m.self);
 await assert.rejects(call(ids.member1,'select cd_set_member_role($1,$2,$3,$4)',[self.id,'intake',self.version-1,'Phân công người tiếp nhận']),/ROLE_CONFLICT/);
 await assert.rejects(call(ids.member1,'select cd_set_member_role($1,$2,$3,$4)',[self.id,'intake',self.version,'Phân công người tiếp nhận']),/LAST_ADMIN_REQUIRED/);
 assert.equal((await permissions(ids.member1)).role,'admin');
});
test('Administrative lookup is explicitly simulated, uses the 63-province snapshot and rejects public callers',async()=>{
 const result=await call(ids.member3,'select cd_administrative_lookup($1) as d',['HA_NOI']);assert.equal(result.simulation,true);assert.equal(result.snapshot,'2024-12-31');assert.equal(result.provinces.length,1);assert.equal(result.provinces[0].name,'Hà Nội');assert.equal((await call(ids.member3,'select cd_administrative_lookup() as d')).provinces.length,63);await assert.rejects(call(null,'select cd_administrative_lookup() as d'),/permission denied|MEMBER_REQUIRED/);
});
