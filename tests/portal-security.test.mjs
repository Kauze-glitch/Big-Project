import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {setup} from './portal-integration-server.mjs';import {ids,asUser,record} from './portal-db-harness.mjs';
const gatewayCalls=[];let gatewayError=null;
const fixture=await setup({env:{TELEGRAM_GATEWAY_TOKEN:'fixture-only-token'},gateway:async req=>{assert.equal(req.headers.get('authorization'),'Bearer fixture-only-token');const body=await req.json();gatewayCalls.push(body);return new Response(JSON.stringify(gatewayError?{ok:false,error:gatewayError}:{ok:true,result:{request_id:'qa-'+gatewayCalls.length}}),{status:200});}}),{db,sign,handler}=fixture;
const edge=async(data,token)=>{const r=await handler(new Request('http://qa/functions/v1/citizen-portal',{method:'POST',headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}));return {status:r.status,data:await r.json()};};
const member=(sql,args=[])=>asUser(db,ids.member1,null,tx=>tx.query(sql,args)).then(r=>r.rows[0]?.d);let citizen;
test('Telegram OTP configuration is member-only, validates phone and revokes previous verification',async()=>{
 citizen=await member('select cd_save_record($1) as d',[JSON.stringify(record())]);const admin=await sign(fixture.users.get(ids.member1));citizen=(await edge({action:'issue',citizenId:citizen.id,operation:randomUUID(),expectedVersion:citizen.accountVersion,password:'BeforeChange123'},admin.access_token)).data.record;
 const config=await edge({action:'telegram-status'},admin.access_token);assert.equal(config.data.configured,true);assert.equal(config.data.dailyLimit,20);assert.doesNotMatch(JSON.stringify(config),/fixture-only-token/);
 await assert.rejects(member('select cd_account_otp_settings($1,$2,$3,$4)',[citizen.id,'telegram','bad',citizen.accountVersion]),/INVALID_OTP_CHANNEL/);
 citizen=await member('select cd_account_otp_settings($1,$2,$3,$4) as d',[citizen.id,'telegram','+84900000001',citizen.accountVersion]);assert.equal(citizen.otpChannel,'telegram');assert.equal(citizen.otpPhoneMasked,'+84 •••• 001');assert.doesNotMatch(JSON.stringify(citizen),/\+84900000001/);
});
let start,token;
test('Real-channel flow sends the generated code to Gateway but never returns it to the browser',async()=>{
 start=await edge({action:'start',cccd:citizen.cccd,password:'BeforeChange123'});token=start.data.preAuth.access_token;assert.equal(start.status,200);assert.equal(start.data.otpMode,'telegram');assert.equal(start.data.demoCode,undefined);assert.equal(gatewayCalls.length,1);assert.equal(gatewayCalls[0].phone_number,'+84900000001');assert.equal(gatewayCalls[0].ttl,120);assert.match(gatewayCalls[0].code,/^\d{6}$/);assert.doesNotMatch(JSON.stringify(start),new RegExp(gatewayCalls[0].code));
 const challenge=(await db.query('select kenh,provider_request_id,ma_bam_otp from cd_thach_thuc_otp where id=$1',[start.data.challengeId])).rows[0];assert.equal(challenge.kenh,'telegram');assert.equal(challenge.provider_request_id,'qa-1');assert.notEqual(challenge.ma_bam_otp,gatewayCalls[0].code);
 const denied=await edge({action:'change-password',currentPassword:'BeforeChange123',password:'AfterChange123'},token);assert.equal(denied.data.error,'CITIZEN_SESSION_REQUIRED');
 assert.equal((await edge({action:'verify',challengeId:start.data.challengeId,code:gatewayCalls[0].code},token)).status,200);
});
test('Changing password requires the current password and OTP; success revokes every old portal session',async()=>{
 assert.equal((await edge({action:'change-password',currentPassword:'wrong',password:'AfterChange123'},token)).data.error,'PASSWORD_CURRENT_INVALID');
 assert.equal((await edge({action:'change-password',currentPassword:'BeforeChange123',password:'BeforeChange123'},token)).data.error,'PASSWORD_UNCHANGED');
 const result=await edge({action:'change-password',currentPassword:'BeforeChange123',password:'AfterChange123'},token);assert.equal(result.status,200);assert.equal(result.data.requiresRelogin,true);
 const user=[...fixture.users.values()].find(u=>u.app_metadata?.citizen_id===citizen.id);assert.equal(user.password,'AfterChange123');assert.equal(fixture.users.get(ids.member1).password,'TestMember123');
 const claim=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));await assert.rejects(asUser(db,user.id,claim.session_id,tx=>tx.query('select cd_citizen_bundle()')),/CITIZEN_SESSION_REQUIRED/);
 assert.equal((await edge({action:'start',cccd:citizen.cccd,password:'BeforeChange123'})).data.error,'INVALID_CREDENTIALS');
});
test('Gateway errors do not expose a demo code and invalidate the failed challenge',async()=>{
 await db.exec("update cd_thach_thuc_otp set created_at=now()-interval '1 minute'");gatewayError='BALANCE_NOT_ENOUGH';const result=await edge({action:'start',cccd:citizen.cccd,password:'AfterChange123'});assert.equal(result.data.error,'TELEGRAM_INSUFFICIENT_BALANCE');assert.equal(result.data.demoCode,undefined);assert.equal(result.data.preAuth,undefined);assert.equal((await db.query("select trang_thai from cd_thach_thuc_otp order by created_at desc limit 1")).rows[0].trang_thai,'gui_that_bai');
});
test('Project member tokens cannot use the citizen password-change endpoint',async()=>{const admin=await sign(fixture.users.get(ids.member1));assert.equal((await edge({action:'change-password',currentPassword:'TestMember123',password:'IllegalChange123'},admin.access_token)).data.error,'CITIZEN_SESSION_REQUIRED');assert.equal(fixture.users.get(ids.member1).password,'TestMember123');});
test.after(()=>db.close());
