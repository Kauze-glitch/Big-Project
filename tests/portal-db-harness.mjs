import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
export const ids={member1:'11111111-1111-4111-8111-111111111111',member2:'22222222-2222-4222-8222-222222222222',member3:'33333333-3333-4333-8333-333333333333',citizen1:'44444444-4444-4444-8444-444444444444',citizen2:'55555555-5555-4555-8555-555555555555',session1:'66666666-6666-4666-8666-666666666666',session2:'77777777-7777-4777-8777-777777777777'};
export async function database(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}');
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub' $$;
`.replace("select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'","select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid"));
await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'); $$;
grant usage on schema auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;
create table public.sections(slug text primary key,title text,content text,owner_id uuid references auth.users(id),updated_at timestamptz default now(),progress_status text default 'drafting');
`);
for(const [label,id] of Object.entries(ids).filter(([label])=>!label.startsWith('session')))await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,label+'@example.invalid',JSON.stringify({display_name:label})]);
for(let i=1;i<=3;i++)await db.query('insert into public.sections(slug,title,content,owner_id) values($1,$2,$3,$4)',['phan'+i,'Phần '+i,'Nội dung '+i,ids['member'+i]]);
await db.exec(`create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
for(const file of fs.readdirSync(new URL('../supabase/',import.meta.url)).filter(f=>/^2026110[12]_\d+_/.test(f)).sort())await db.exec(fs.readFileSync(new URL('../supabase/'+file,import.meta.url),'utf8'));
return db;}
export async function asUser(db,user,session,fn){return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:session})]);await tx.exec('set local role '+(user?'authenticated':'anon'));return fn(tx);});}
export const record=(overrides={})=>({name:'Công dân Minh Họa',cccd:'000000000001',dob:'2002-08-15',gender:'Nam',phone:'0000000001',email:'congdan1@example.invalid',address:'12 đường Minh Họa',provinceCode:'HA_NOI',ward:'Phường Mẫu A',occupation:'Sinh viên',...overrides});
