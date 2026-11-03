import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {setup} from './portal-integration-server.mjs';import {ids,record,asUser} from './portal-db-harness.mjs';
const fixture=await setup(),{db,handler,sign}=fixture;
const member=(sql,args=[])=>asUser(db,ids.member1,null,tx=>tx.query(sql,args)).then(r=>r.rows[0]?.d);
const edge=async(data,token)=>{const r=await handler(new Request('http://qa/functions/v1/citizen-portal',{method:'POST',headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};};
let citizen;
test('Any twelve-digit identifier is accepted with local or international contact numbers, including legacy data',async()=>{
 const rows=[['123456789012','0988123456'],['912345678901','+84988123456'],['012345678901','1988123456'],['000000000001','0000000001']];
 for(const [cccd,phone] of rows){const r=await member('select cd_save_record($1) as d',[JSON.stringify(record({cccd,phone}))]);assert.equal(r.cccd,cccd);assert.equal(r.phone,phone);if(!citizen)citizen=r;}
 await assert.rejects(member('select cd_save_record($1)',[JSON.stringify(record({cccd:citizen.cccd}))]),/DUPLICATE_IDENTIFIER/);
 for(const cccd of ['12345678901','1234567890123','A23456789012'])await assert.rejects(member('select cd_save_record($1)',[JSON.stringify(record({cccd}))]),/INVALID_IDENTIFIER/);
 for(const phone of ['098812345','09881234567890123','+01234567890','bad'])await assert.rejects(member('select cd_save_record($1)',[JSON.stringify(record({cccd:'234567890123',phone}))]),/INVALID_CONTACT_PHONE/);
 const before=(await db.query('select so_dinh_danh,so_dien_thoai_lien_he from cd_cong_dan where id=$1',[citizen.id])).rows[0];await assert.rejects(db.query('update cd_cong_dan set so_dinh_danh=$1 where id=$2',['123',citizen.id]),/cd_fictional_identifier/);await assert.rejects(db.query('update cd_cong_dan set so_dien_thoai_lien_he=$1 where id=$2',['invalid',citizen.id]),/cd_profile_text_bounds/);assert.deepEqual((await db.query('select so_dinh_danh,so_dien_thoai_lien_he from cd_cong_dan where id=$1',[citizen.id])).rows[0],before);
});
test('Provisioning, login, resend and verified profile access work for an identifier without the old prefix',async()=>{
 const admin=await sign(fixture.users.get(ids.member1)),issued=await edge({action:'issue',citizenId:citizen.id,operation:randomUUID(),expectedVersion:citizen.accountVersion,password:'IdentifierTest123'},admin.access_token);assert.equal(issued.status,200);assert.equal(issued.data.record.phone,'0988123456');
 const start=await edge({action:'start',cccd:citizen.cccd,password:'IdentifierTest123'});assert.equal(start.status,200);const token=start.data.preAuth.access_token;
 await db.exec("update cd_thach_thuc_otp set created_at=now()-interval '1 minute'");const resend=await edge({action:'resend',cccd:citizen.cccd},token);assert.equal(resend.status,200);assert.notEqual(resend.data.challengeId,start.data.challengeId);assert.equal((await edge({action:'verify',challengeId:start.data.challengeId,code:start.data.demoCode},token)).data.error,'OTP_EXPIRED');
 const verified=await edge({action:'verify',challengeId:resend.data.challengeId,code:resend.data.demoCode},token);assert.equal(verified.status,200);const response=await fixture.api(new Request('http://qa/rest/v1/rpc/cd_citizen_bundle',{method:'POST',headers:{authorization:'Bearer '+token},body:'{}'}));assert.equal(response.status,200);assert.equal((await response.json()).record.cccd,citizen.cccd);for(const id of [ids.member1,ids.member2,ids.member3])assert.equal(fixture.users.get(id).password,'TestMember123');
});
test('Import preview and commit share the broadened formats and reject duplicate identifiers atomically',async()=>{
 const rows=[{row:2,data:record({cccd:'234567890123',phone:'+12025550123'})}],preview=await member('select cd_import_preview($1,$2) as d',[JSON.stringify(rows),'create']);assert.equal(preview[0].error,null);const result=await member('select cd_import_commit($1,$2,$3,$4,false) as d',[JSON.stringify(rows),'create','import-new-prefix.csv',randomUUID()]);assert.equal(result.created,1);const duplicate=await member('select cd_import_preview($1,$2) as d',[JSON.stringify(rows),'create']);assert.equal(duplicate[0].error,'DUPLICATE_IDENTIFIER');assert.equal((await member('select cd_portal_status() as d')).fictionalOnly,false);
});
test('Contact email accepts ordinary providers, plus aliases and optional empty values without changing Auth or OTP settings',async()=>{
 const authBefore=(await db.query('select id,email,raw_user_meta_data,raw_app_meta_data from auth.users order by id')).rows;
 const accountsBefore=(await db.query('select * from cd_tai_khoan_cong_dan order by id')).rows;
 for(const [i,email] of ['minhan@gmail.com','Minh.An+doan@outlook.com','sinhvien@sv.university.edu.vn','legacy@example.invalid',''].entries()){
  const cccd='34567890123'+i,r=await member('select cd_save_record($1) as d',[JSON.stringify(record({cccd,email:'  '+email+'  '}))]);assert.equal(r.email,email);
  const bundle=await member('select cd_member_bundle() as d');assert.equal(bundle.records.find(c=>c.id===r.id).email,email);
 }
 assert.deepEqual((await db.query('select id,email,raw_user_meta_data,raw_app_meta_data from auth.users order by id')).rows,authBefore);
 assert.deepEqual((await db.query('select * from cd_tai_khoan_cong_dan order by id')).rows,accountsBefore);
 const row=await member('select cd_save_record($1) as d',[JSON.stringify(record({cccd:'456789012345',email:'initial@gmail.com'}))]);
 for(const email of ['missing-at','a@@gmail.com','a b@gmail.com','a@domain','a@-domain.com','a@domain..com','a..b@gmail.com','<a>@gmail.com']){
  await assert.rejects(member('select cd_save_record($1,$2) as d',[JSON.stringify({...row,email}),row.rowVersion]),/INVALID_CONTACT_EMAIL/);
  await assert.rejects(db.query('update cd_cong_dan set email_lien_he=$1 where id=$2',[email,row.id]),/cd_profile_text_bounds/);
 }
 await assert.rejects(member('select cd_save_record($1,$2) as d',[JSON.stringify({...row,email:'a'.repeat(95)+'@gmail.com'}),row.rowVersion]),/FIELD_TOO_LONG/);
 assert.equal((await member('select cd_member_bundle() as d')).records.find(r=>r.id===row.id).email,'initial@gmail.com');
 assert.equal((await member('select cd_portal_status() as d')).contactEmailPolicy,'optional-valid-email');
});

test('Import validates contact email in preview and saves it with the same policy as manual entry',async()=>{
 const rows=[{row:2,data:record({cccd:'567890123456',email:'nhom12+import@gmail.com'})}];
 assert.equal((await member('select cd_import_preview($1,$2) as d',[JSON.stringify(rows),'create']))[0].error,null);
 const result=await member('select cd_import_commit($1,$2,$3,$4,false) as d',[JSON.stringify(rows),'create','contact-email.csv',randomUUID()]);assert.equal(result.created,1);
 assert.equal((await member('select cd_member_bundle() as d')).records.find(r=>r.cccd==='567890123456').email,rows[0].data.email);
 const bad=[{row:2,data:record({cccd:'567890123457',email:'invalid email'})}];assert.equal((await member('select cd_import_preview($1,$2) as d',[JSON.stringify(bad),'create']))[0].error,'INVALID_CONTACT_EMAIL');
 await assert.rejects(member('select cd_import_commit($1,$2,$3,$4,false) as d',[JSON.stringify(bad),'create','invalid-email.csv',randomUUID()]),/IMPORT_HAS_ERRORS/);
});
test.after(()=>db.close());
