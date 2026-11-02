// Supabase Edge Function. No citizen password, Auth token or OTP is logged or stored in report content.
// verify_jwt=false is required for the public first step; every privileged action validates Auth itself.
const env = name => Deno.env.get(name) || '';
const telegramToken = () => env('TELEGRAM_GATEWAY_TOKEN').trim();
function configuredKey(name,legacy) { try { return JSON.parse(env(name)).default || env(legacy); } catch { return env(legacy); } }
const cors = {'Access-Control-Allow-Origin':'https://kauze-glitch.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const response = (status,body) => new Response(JSON.stringify(body),{status,headers:cors});
class PortalError extends Error { constructor(code,status=400,extra={}) { super(code);this.status=status;this.extra=extra; } }
const uuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hex = bytes => Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
async function digest(secret,text) { const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text))); }
function otpCode() { const bytes=new Uint32Array(1);do {crypto.getRandomValues(bytes);} while(bytes[0]>=4294000000);return String(bytes[0]%1000000).padStart(6,'0'); }
function claims(token,user) { try {const part=token.split('.')[1];const payload=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));if(payload.sub!==user.id||!uuid(payload.session_id))throw 0;return payload;}catch {throw new PortalError('SESSION_EXPIRED',401);} }
async function body(req) {
 if(Number(req.headers.get('content-length'))>14000)throw new PortalError('INVALID_INPUT');
 const reader=req.body?.getReader();if(!reader)throw new PortalError('INVALID_INPUT');let size=0,text='';const decoder=new TextDecoder();
 for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>14000){await reader.cancel();throw new PortalError('INVALID_INPUT');}text+=decoder.decode(item.value,{stream:true});}
 try {const data=JSON.parse(text+decoder.decode());if(!data||Array.isArray(data)||typeof data!=='object')throw 0;return data;}catch{throw new PortalError('INVALID_INPUT');}
}
function safeCode(message,fallback='PORTAL_REQUEST_FAILED') {const names=['PERMISSION_DENIED','CITIZEN_SESSION_REQUIRED','MEMBER_REQUIRED','ACCOUNT_CONFLICT','ACCOUNT_ALREADY_ISSUED','ACCOUNT_NOT_ISSUED','ACCOUNT_PROVISIONING_BUSY','ACCOUNT_OPERATION_EXPIRED','PROJECT_ACCOUNT_PROTECTED','ACCOUNT_IDENTITY_MISMATCH','CITIZEN_NOT_FOUND','ACCOUNT_LOCKED','OTP_COOLDOWN','SESSION_RESTART_REQUIRED','INVALID_CREDENTIALS'];return names.find(n=>String(message).includes(n))||fallback;}
async function handle(req) {
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return response(405,{error:'METHOD_NOT_ALLOWED'});
 const url=env('SUPABASE_URL'),publicKey=configuredKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY'),serviceKey=configuredKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!publicKey||!serviceKey)return response(503,{error:'PORTAL_NOT_CONFIGURED'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 const request=async(path,options={})=>{try{return await fetch(url+path,{...options,signal:controller.signal});}catch{throw new PortalError('SERVICE_UNAVAILABLE',503);}};
 async function rpc(name,args,token=serviceKey) {
  const r=await request('/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:token===serviceKey?serviceKey:publicKey,authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args)});let result;try{result=await r.json();}catch{throw new PortalError('SERVICE_UNAVAILABLE',503);}
  if(!r.ok)throw new PortalError(safeCode(result?.message),r.status===403?403:400);return result;
 }
 async function authUser(token) {
  if(typeof token!=='string'||!token)throw new PortalError('SESSION_EXPIRED',401);
  const r=await request('/auth/v1/user',{headers:{apikey:publicKey,authorization:'Bearer '+token}});if(!r.ok)throw new PortalError('SESSION_EXPIRED',401);const user=await r.json();if(!uuid(user?.id))throw new PortalError('SESSION_EXPIRED',401);return user;
 }
 async function rate(key,limit,seconds) {if(!await rpc('cd_rate_limit',{p_key:key,p_limit:limit,p_window_seconds:seconds}))throw new PortalError('TOO_MANY_REQUESTS',429);}
 async function issueChallenge(account,user,session,preAuth) {
  if(account.status!=='active')throw new PortalError('ACCOUNT_LOCKED',403);
  const telegram=account.otpChannel==='telegram',gatewayToken=telegramToken(),phone=account.otpPhone||'';
  if(telegram&&!gatewayToken)throw new PortalError('TELEGRAM_TOKEN_MISSING',503);
  if(telegram&&(!/^\+[1-9][0-9]{6,14}$/.test(phone)||(phone.startsWith('+84')&&!/^\+84[1-9][0-9]{8,9}$/.test(phone))))throw new PortalError('TELEGRAM_PHONE_INVALID',400);
  if(telegram)await rate('portal:telegram:daily',Math.max(1,Math.min(100,Number(env('TELEGRAM_DAILY_LIMIT'))||20)),86400);
  const challenge=crypto.randomUUID(),code=otpCode(),hashed=await digest(serviceKey,'otp:'+challenge+':'+session+':'+code);
  const data=await rpc('cd_issue_challenge',{p_account:account.accountId,p_auth_user:user.id,p_auth_session:session,p_challenge:challenge,p_otp_hash:hashed});
  if(telegram){
   let delivered=false,providerId=null;
   try{
    const sent=await fetch('https://gatewayapi.telegram.org/sendVerificationMessage',{method:'POST',signal:controller.signal,headers:{authorization:'Bearer '+gatewayToken,'Content-Type':'application/json'},body:JSON.stringify({phone_number:account.otpPhone,code,ttl:120,payload:challenge})});
    const result=await sent.json();if(!sent.ok||!result.ok){const reason=String(result.error||'');throw new PortalError(/ACCESS_TOKEN|TOKEN_INVALID|UNAUTHORIZED/.test(reason)?'TELEGRAM_TOKEN_INVALID':/BALANCE|FUNDS/.test(reason)?'TELEGRAM_INSUFFICIENT_BALANCE':/PHONE|USER|NUMBER/.test(reason)?'TELEGRAM_UNAVAILABLE':'TELEGRAM_SEND_FAILED',503);}
    if(typeof result.result?.request_id!=='string'||!result.result.request_id)throw new PortalError('TELEGRAM_SEND_FAILED',503);providerId=result.result.request_id;delivered=true;
   }catch(error){if(error instanceof PortalError)throw error;throw new PortalError('TELEGRAM_SEND_FAILED',503);}
   finally{await rpc('cd_challenge_delivery_result',{p_challenge:challenge,p_provider_request:providerId,p_success:delivered}).catch(()=>{});}
   // Never expose the real code or silently fall back to demo mode.
   return {...data,otpMode:'telegram',preAuth};
  }
  return { ...data,otpMode:'demo',demoCode:code,preAuth };
 }
 try {
  const data=await body(req),action=data.action;
  if(!['start','resend','verify','issue','reset-password','change-password','telegram-status'].includes(action))throw new PortalError('INVALID_ACTION');
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||req.headers.get('cf-connecting-ip')||'unknown';
  await rate('portal:ip:'+await digest(serviceKey,ip),60,600);
  if(action==='start') {
   if(typeof data.cccd!=='string'||!/^000[0-9]{9}$/.test(data.cccd)||typeof data.password!=='string'||data.password.length<1||data.password.length>100)throw new PortalError('INVALID_CREDENTIALS',401);
   await rate('portal:login:'+await digest(serviceKey,data.cccd),12,600);
   const account=await rpc('cd_auth_lookup',{p_cccd:data.cccd});if(!account?.email||!uuid(account.authUserId))throw new PortalError('INVALID_CREDENTIALS',401);
   const signed=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:data.password})});
   if(!signed.ok)throw new PortalError('INVALID_CREDENTIALS',401);const session=await signed.json();
   if(session.user?.id!==account.authUserId||!session.access_token||!session.refresh_token)throw new PortalError('INVALID_CREDENTIALS',401);
   const c=claims(session.access_token,session.user);
   const preAuth={access_token:session.access_token,refresh_token:session.refresh_token,expires_at:session.expires_at||Math.floor(Date.now()/1000)+(session.expires_in||3600)};
   try{return response(200,await issueChallenge(account,session.user,c.session_id,preAuth));}catch(error){await request('/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:publicKey,authorization:'Bearer '+session.access_token}}).catch(()=>{});throw error;}
  }
  const bearer=req.headers.get('authorization')||'',token=/^Bearer (\S+)$/i.exec(bearer)?.[1],user=await authUser(token),c=claims(token,user);
  if(action==='change-password'){
   await rate('portal:password:'+user.id,8,3600);
   if(typeof data.currentPassword!=='string'||!data.currentPassword||data.currentPassword.length>100||typeof data.password!=='string'||data.password.length<10||data.password.length>72||!/[A-Za-z]/.test(data.password)||!/[0-9]/.test(data.password))throw new PortalError('PASSWORD_POLICY');
   if(data.currentPassword===data.password)throw new PortalError('PASSWORD_UNCHANGED');
   const context=await rpc('cd_citizen_security_context',{},token);
   if(!uuid(context?.accountId)||!context.email)throw new PortalError('CITIZEN_SESSION_REQUIRED',403);
   const proof=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:context.email,password:data.currentPassword})});
   if(!proof.ok)throw new PortalError('PASSWORD_CURRENT_INVALID',401);const proofSession=await proof.json();
   try{
    if(proofSession.user?.id!==user.id)throw new PortalError('PROJECT_ACCOUNT_PROTECTED',403);
    const operation=crypto.randomUUID(),prepared=await rpc('cd_citizen_password_prepare',{p_operation:operation,p_expected_version:context.version},token);let success=false;
    try{const changed=await request('/auth/v1/admin/users/'+user.id,{method:'PUT',headers:{apikey:serviceKey,authorization:'Bearer '+serviceKey,'Content-Type':'application/json'},body:JSON.stringify({password:data.password})});if(!changed.ok)throw new PortalError('PASSWORD_CHANGE_FAILED',503,{requiresRelogin:true});success=true;}
    catch(error){if(error instanceof PortalError)throw error;throw new PortalError('PASSWORD_CHANGE_FAILED',503,{requiresRelogin:true});}
    finally{await rpc('cd_citizen_password_finish',{p_account:prepared.accountId,p_user:user.id,p_operation:operation,p_success:success}).catch(()=>{});}
    await request('/auth/v1/logout?scope=global',{method:'POST',headers:{apikey:publicKey,authorization:'Bearer '+token}}).catch(()=>{});
    return response(200,{ok:true,requiresRelogin:true});
   }finally{if(proofSession.access_token)await request('/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:publicKey,authorization:'Bearer '+proofSession.access_token}}).catch(()=>{});}
  }
  if(action==='resend'||action==='verify') {
   await rate('portal:verify:'+user.id,40,600);
   if(action==='resend') {
    if(typeof data.cccd!=='string'||!/^000[0-9]{9}$/.test(data.cccd))throw new PortalError('INVALID_INPUT');
    const account=await rpc('cd_auth_lookup',{p_cccd:data.cccd});if(!account||account.authUserId!==user.id)throw new PortalError('INVALID_CREDENTIALS',401);
    return response(200,await issueChallenge(account,user,c.session_id,null));
   }
   if(!uuid(data.challengeId)||typeof data.code!=='string'||!/^\d{6}$/.test(data.code))throw new PortalError('INVALID_INPUT');
   const result=await rpc('cd_verify_challenge',{p_challenge:data.challengeId,p_auth_user:user.id,p_auth_session:c.session_id,p_otp_hash:await digest(serviceKey,'otp:'+data.challengeId+':'+c.session_id+':'+data.code),p_token_hash:await digest(serviceKey,'session:'+c.session_id)});
   if(!result?.ok)return response(400,{error:result?.error||'OTP_INVALID',remaining:result?.remaining});return response(200,result);
  }
  if(!await rpc('cd_is_member',{},token))throw new PortalError('MEMBER_REQUIRED',403);
  const permissions=await rpc('cd_member_permissions',{},token);if(!permissions?.capabilities?.includes('accounts.manage'))throw new PortalError('PERMISSION_DENIED',403);
  if(action==='telegram-status')return response(200,{configured:!!telegramToken(),secretName:'TELEGRAM_GATEWAY_TOKEN',projectRef:new URL(url).hostname.split('.')[0],configurationVersion:'20261103-otp2',dailyLimit:Math.max(1,Math.min(100,Number(env('TELEGRAM_DAILY_LIMIT'))||20))});
  await rate('portal:issue:'+user.id,30,600);
  if(!uuid(data.citizenId)||!uuid(data.operation)||!Number.isInteger(data.expectedVersion)||data.expectedVersion<0||typeof data.password!=='string'||data.password.length<10||data.password.length>72||!/[A-Za-z]/.test(data.password)||!/[0-9]/.test(data.password))throw new PortalError('PASSWORD_POLICY');
  const account=await rpc('cd_account_prepare',{p_citizen:data.citizenId,p_actor:user.id,p_expected_version:data.expectedVersion,p_operation:data.operation,p_reset:action==='reset-password'});
  let authId=account.authUserId;
  const adminHeaders={apikey:serviceKey,authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
  if(authId) {
   if(!uuid(authId)||authId===user.id)throw new PortalError('PROJECT_ACCOUNT_PROTECTED',403);
   const r=await request('/auth/v1/admin/users/'+authId,{method:'PUT',headers:adminHeaders,body:JSON.stringify({password:data.password,email_confirm:true})});if(!r.ok)throw new PortalError('ACCOUNT_PROVISION_FAILED',503);
  } else {
   const r=await request('/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email:account.email,password:data.password,email_confirm:true,app_metadata:{citizen_id:data.citizenId},user_metadata:{display_name:'Tài khoản công dân đồ án'}})});
   if(!r.ok)throw new PortalError('ACCOUNT_PROVISION_FAILED',503);const created=await r.json();authId=created.id||created.user?.id;if(!uuid(authId))throw new PortalError('ACCOUNT_PROVISION_FAILED',503);
  }
  const record=await rpc('cd_account_finish',{p_account:account.id,p_actor:user.id,p_operation:data.operation,p_auth_user:authId});
  return response(200,{record});
 } catch(error) {
  if(error instanceof PortalError)return response(error.status,{error:error.message,...error.extra});
  return response(503,{error:'SERVICE_UNAVAILABLE'});
 } finally {clearTimeout(timer);}
}
Deno.serve(handle);
