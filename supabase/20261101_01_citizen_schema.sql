-- Nhóm 12: additive migration. Existing report tables/accounts are not replaced.
-- Coursework: only fictional 000... identifiers and example.invalid email addresses.
begin;
create table if not exists public.cd_portal_meta(id integer primary key check(id=1), schema_version integer not null, installed_at timestamptz not null default clock_timestamp());
insert into public.cd_portal_meta(id,schema_version) values(1,1) on conflict(id) do nothing;
create table if not exists public.cd_don_vi_hc (
  id uuid primary key default gen_random_uuid(),
  ma_don_vi text not null unique,
  ten_don_vi text not null,
  cap_hanh_chinh text not null,
  don_vi_cha_id uuid,
  hieu_luc_tu date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  hieu_luc_den date,
  trang_thai text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_cong_dan (
  id uuid primary key default gen_random_uuid(),
  so_dinh_danh varchar(12) unique,
  ho_ten_khai_sinh text not null,
  ten_goi_khac text,
  ngay_sinh date,
  nam_sinh smallint,
  do_chinh_xac_ngay_sinh text not null,
  gioi_tinh text not null,
  noi_sinh text,
  noi_dang_ky_khai_sinh text,
  que_quan text,
  dan_toc text,
  ton_giao text,
  nghe_nghiep text,
  so_dien_thoai_lien_he text,
  email_lien_he text,
  tinh_trang_ca_nhan text not null,
  ngay_ghi_nhan_tinh_trang date,
  trang_thai_ho_so text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_quoc_tich_cong_dan (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  ma_quoc_gia text not null,
  tu_ngay date,
  den_ngay date,
  ghi_chu text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_cu_tru (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  loai_cu_tru text not null,
  don_vi_hc_id uuid not null,
  dia_chi_chi_tiet text not null,
  dia_chi_day_du_tai_thoi_diem text not null,
  tu_ngay date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  den_ngay date,
  trang_thai text not null,
  ho_so_nguon_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_ho_gia_dinh (
  id uuid primary key default gen_random_uuid(),
  ma_ho text not null unique,
  so_ho_so_cu_tru text unique,
  don_vi_hc_id uuid not null,
  dia_chi text not null,
  ngay_lap date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  trang_thai text not null,
  ngay_giai_the date,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_thanh_vien_ho (
  id uuid primary key default gen_random_uuid(),
  ho_id uuid not null,
  cong_dan_id uuid not null,
  quan_he_voi_chu_ho text not null,
  tu_ngay date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  den_ngay date,
  ly_do_thay_doi text,
  ho_so_nguon_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_the_can_cuoc (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  loai_giay_to text not null,
  so_tren_giay_to text not null,
  ngay_cap date not null,
  noi_cap text not null,
  ngay_het_han date,
  trang_thai text not null,
  thay_the_giay_to_id uuid,
  phien_ban_mau text not null,
  thong_tin_tren_the jsonb not null default '{}'::jsonb,
  ly_do_cap text not null,
  ngay_thu_hoi date,
  ly_do_ngung_hieu_luc text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_quan_he_nhan_than (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  nguoi_lien_quan_id uuid,
  loai_quan_he text not null,
  ho_ten_ngoai_he_thong text,
  so_dinh_danh_ngoai_he_thong varchar(12),
  quoc_tich_ngoai_he_thong text,
  tu_ngay date,
  den_ngay date,
  can_cu text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_tinh_trang_hon_nhan (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  tinh_trang text not null,
  vo_chong_id uuid,
  ho_ten_vo_chong_ngoai text,
  so_dinh_danh_vo_chong_ngoai varchar(12),
  tu_ngay date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  den_ngay date,
  giay_to_can_cu_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_giay_to_ho_tich (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  loai_giay_to text not null,
  so_giay_to text not null,
  so_quyen text,
  ngay_cap date not null,
  co_quan_cap text not null,
  trang_thai text not null,
  ghi_chu text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_can_bo (
  id uuid primary key default gen_random_uuid(),
  ma_can_bo text not null unique,
  ho_ten text not null,
  chuc_vu text not null,
  don_vi_hc_id uuid not null,
  thanh_vien_du_an_id uuid unique,
  trang_thai text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_ho_so_yeu_cau (
  id uuid primary key default gen_random_uuid(),
  ma_tra_cuu text not null unique,
  cong_dan_id uuid not null,
  nguoi_nop_user_id uuid not null,
  don_vi_tiep_nhan_id uuid not null,
  can_bo_phu_trach_id uuid,
  loai_yeu_cau text not null,
  tieu_de text not null,
  noi_dung text not null,
  thay_doi_de_nghi jsonb,
  trang_thai text not null,
  ngay_nop timestamptz,
  han_xu_ly timestamptz,
  ngay_ket_thuc timestamptz,
  ket_qua text,
  ly_do_tu_choi text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1,
  idempotency_key uuid not null unique default gen_random_uuid(),
  citizen_base_version integer
);
create table if not exists public.cd_lich_su_xu_ly (
  id uuid primary key default gen_random_uuid(),
  ho_so_id uuid not null,
  nguoi_thuc_hien_user_id uuid not null,
  can_bo_id uuid,
  hanh_dong text not null,
  trang_thai_truoc text,
  trang_thai_sau text not null,
  noi_dung text not null,
  hien_cho_cong_dan boolean not null default false,
  thoi_diem timestamptz not null default clock_timestamp()
);
create table if not exists public.cd_bien_dong (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null,
  ho_so_nguon_id uuid,
  can_bo_id uuid,
  nguoi_ghi_nhan_user_id uuid not null,
  loai_bien_dong text not null,
  ngay_hieu_luc date not null,
  du_lieu_truoc jsonb,
  du_lieu_sau jsonb not null default '{}'::jsonb,
  ly_do text not null,
  thoi_diem_ghi_nhan timestamptz not null default clock_timestamp()
);
create table if not exists public.cd_tep_dinh_kem (
  id uuid primary key default gen_random_uuid(),
  ho_so_id uuid,
  giay_to_ho_tich_id uuid,
  giay_to_dinh_danh_id uuid,
  vai_tro_tep text not null,
  bucket text not null,
  object_path text not null,
  ten_tep_goc text not null,
  mime_type text not null,
  kich_thuoc_bytes bigint not null,
  nguoi_tai_len_user_id uuid not null,
  trang_thai text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_thanh_vien_du_an (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  ten_hien_thi text not null,
  vai_tro_nhom text,
  nhiem_vu text,
  quyen_he_thong text not null,
  trang_thai text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_tai_khoan_cong_dan (
  id uuid primary key default gen_random_uuid(),
  cong_dan_id uuid not null unique,
  auth_user_id uuid unique,
  so_dien_thoai_otp text not null,
  kenh_otp text not null,
  trang_thai text not null,
  nguoi_cap_id uuid not null,
  ngay_cap timestamptz not null default clock_timestamp(),
  nguoi_khoa_id uuid,
  thoi_diem_khoa timestamptz,
  ly_do_khoa text,
  phien_ban_bao_mat integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1,
  provisioning_key uuid,
  provisioning_started_at timestamptz
);
create table if not exists public.cd_thach_thuc_otp (
  id uuid primary key default gen_random_uuid(),
  tai_khoan_id uuid not null,
  phien_dang_nhap_id uuid not null,
  muc_dich text not null,
  kenh text not null,
  provider_request_id text,
  ma_bam_otp text,
  het_han_luc timestamptz not null default clock_timestamp(),
  duoc_gui_lai_luc timestamptz not null default clock_timestamp(),
  so_lan_sai integer not null default 1,
  gioi_han_thu integer not null default 1,
  trang_thai text not null,
  da_su_dung_luc timestamptz,
  phien_ban_bao_mat integer not null default 1,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_phien_xac_thuc_cong_dan (
  id uuid primary key default gen_random_uuid(),
  tai_khoan_id uuid not null,
  thach_thuc_otp_id uuid not null unique,
  auth_session_id uuid not null,
  token_hash text not null unique,
  phien_ban_bao_mat integer not null default 1,
  cap_luc timestamptz not null default clock_timestamp(),
  het_han_luc timestamptz not null default clock_timestamp(),
  hoat_dong_cuoi_luc timestamptz not null default clock_timestamp(),
  thu_hoi_luc timestamptz,
  ly_do_thu_hoi text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
create table if not exists public.cd_nhat_ky_thao_tac (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_label text not null,
  hanh_dong text not null,
  doi_tuong_loai text not null,
  doi_tuong_id uuid,
  truoc_thay_doi jsonb,
  sau_thay_doi jsonb,
  request_id uuid not null,
  thoi_diem timestamptz not null default clock_timestamp()
);
create table if not exists public.cd_dot_nhap_du_lieu (
  id uuid primary key default gen_random_uuid(),
  nguoi_nhap_id uuid not null,
  loai_du_lieu text not null,
  ten_tep text not null,
  tep_nguon_path text,
  phien_ban_mau text not null,
  che_do text not null,
  trang_thai text not null,
  idempotency_key uuid not null unique,
  bat_dau_luc timestamptz not null default clock_timestamp(),
  ket_thuc_luc timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1,
  ket_qua jsonb,
  input_fingerprint text
);
create table if not exists public.cd_dong_nhap (
  id uuid primary key default gen_random_uuid(),
  dot_nhap_id uuid not null,
  so_dong integer not null default 1,
  du_lieu_goc jsonb not null default '{}'::jsonb,
  du_lieu_chuan_hoa jsonb,
  loi_kiem_tra jsonb,
  trang_thai text not null,
  cong_dan_id uuid,
  ho_id uuid,
  cu_tru_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  row_version integer not null default 1
);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_don_vi_hc_don_vi_cha_id_fk' and conrelid='public.cd_don_vi_hc'::regclass) then alter table public.cd_don_vi_hc add constraint cd_don_vi_hc_don_vi_cha_id_fk foreign key (don_vi_cha_id) references public.cd_don_vi_hc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_don_vi_hc_don_vi_cha_id_idx on public.cd_don_vi_hc(don_vi_cha_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_quoc_tich_cong_dan_cong_dan_id_fk' and conrelid='public.cd_quoc_tich_cong_dan'::regclass) then alter table public.cd_quoc_tich_cong_dan add constraint cd_quoc_tich_cong_dan_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_quoc_tich_cong_dan_cong_dan_id_idx on public.cd_quoc_tich_cong_dan(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_cu_tru_cong_dan_id_fk' and conrelid='public.cd_cu_tru'::regclass) then alter table public.cd_cu_tru add constraint cd_cu_tru_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_cu_tru_cong_dan_id_idx on public.cd_cu_tru(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_cu_tru_don_vi_hc_id_fk' and conrelid='public.cd_cu_tru'::regclass) then alter table public.cd_cu_tru add constraint cd_cu_tru_don_vi_hc_id_fk foreign key (don_vi_hc_id) references public.cd_don_vi_hc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_cu_tru_don_vi_hc_id_idx on public.cd_cu_tru(don_vi_hc_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_cu_tru_ho_so_nguon_id_fk' and conrelid='public.cd_cu_tru'::regclass) then alter table public.cd_cu_tru add constraint cd_cu_tru_ho_so_nguon_id_fk foreign key (ho_so_nguon_id) references public.cd_ho_so_yeu_cau(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_cu_tru_ho_so_nguon_id_idx on public.cd_cu_tru(ho_so_nguon_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_ho_gia_dinh_don_vi_hc_id_fk' and conrelid='public.cd_ho_gia_dinh'::regclass) then alter table public.cd_ho_gia_dinh add constraint cd_ho_gia_dinh_don_vi_hc_id_fk foreign key (don_vi_hc_id) references public.cd_don_vi_hc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_ho_gia_dinh_don_vi_hc_id_idx on public.cd_ho_gia_dinh(don_vi_hc_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_thanh_vien_ho_ho_id_fk' and conrelid='public.cd_thanh_vien_ho'::regclass) then alter table public.cd_thanh_vien_ho add constraint cd_thanh_vien_ho_ho_id_fk foreign key (ho_id) references public.cd_ho_gia_dinh(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_thanh_vien_ho_ho_id_idx on public.cd_thanh_vien_ho(ho_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_thanh_vien_ho_cong_dan_id_fk' and conrelid='public.cd_thanh_vien_ho'::regclass) then alter table public.cd_thanh_vien_ho add constraint cd_thanh_vien_ho_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_thanh_vien_ho_cong_dan_id_idx on public.cd_thanh_vien_ho(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_thanh_vien_ho_ho_so_nguon_id_fk' and conrelid='public.cd_thanh_vien_ho'::regclass) then alter table public.cd_thanh_vien_ho add constraint cd_thanh_vien_ho_ho_so_nguon_id_fk foreign key (ho_so_nguon_id) references public.cd_ho_so_yeu_cau(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_thanh_vien_ho_ho_so_nguon_id_idx on public.cd_thanh_vien_ho(ho_so_nguon_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_the_can_cuoc_cong_dan_id_fk' and conrelid='public.cd_the_can_cuoc'::regclass) then alter table public.cd_the_can_cuoc add constraint cd_the_can_cuoc_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_the_can_cuoc_cong_dan_id_idx on public.cd_the_can_cuoc(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_the_can_cuoc_thay_the_giay_to_id_fk' and conrelid='public.cd_the_can_cuoc'::regclass) then alter table public.cd_the_can_cuoc add constraint cd_the_can_cuoc_thay_the_giay_to_id_fk foreign key (thay_the_giay_to_id) references public.cd_the_can_cuoc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_the_can_cuoc_thay_the_giay_to_id_idx on public.cd_the_can_cuoc(thay_the_giay_to_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_quan_he_nhan_than_cong_dan_id_fk' and conrelid='public.cd_quan_he_nhan_than'::regclass) then alter table public.cd_quan_he_nhan_than add constraint cd_quan_he_nhan_than_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_quan_he_nhan_than_cong_dan_id_idx on public.cd_quan_he_nhan_than(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_quan_he_nhan_than_nguoi_lien_quan_id_fk' and conrelid='public.cd_quan_he_nhan_than'::regclass) then alter table public.cd_quan_he_nhan_than add constraint cd_quan_he_nhan_than_nguoi_lien_quan_id_fk foreign key (nguoi_lien_quan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_quan_he_nhan_than_nguoi_lien_quan_id_idx on public.cd_quan_he_nhan_than(nguoi_lien_quan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tinh_trang_hon_nhan_cong_dan_id_fk' and conrelid='public.cd_tinh_trang_hon_nhan'::regclass) then alter table public.cd_tinh_trang_hon_nhan add constraint cd_tinh_trang_hon_nhan_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tinh_trang_hon_nhan_cong_dan_id_idx on public.cd_tinh_trang_hon_nhan(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tinh_trang_hon_nhan_vo_chong_id_fk' and conrelid='public.cd_tinh_trang_hon_nhan'::regclass) then alter table public.cd_tinh_trang_hon_nhan add constraint cd_tinh_trang_hon_nhan_vo_chong_id_fk foreign key (vo_chong_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tinh_trang_hon_nhan_vo_chong_id_idx on public.cd_tinh_trang_hon_nhan(vo_chong_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tinh_trang_hon_nhan_giay_to_can_cu_id_fk' and conrelid='public.cd_tinh_trang_hon_nhan'::regclass) then alter table public.cd_tinh_trang_hon_nhan add constraint cd_tinh_trang_hon_nhan_giay_to_can_cu_id_fk foreign key (giay_to_can_cu_id) references public.cd_giay_to_ho_tich(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tinh_trang_hon_nhan_giay_to_can_cu_id_idx on public.cd_tinh_trang_hon_nhan(giay_to_can_cu_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_giay_to_ho_tich_cong_dan_id_fk' and conrelid='public.cd_giay_to_ho_tich'::regclass) then alter table public.cd_giay_to_ho_tich add constraint cd_giay_to_ho_tich_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_giay_to_ho_tich_cong_dan_id_idx on public.cd_giay_to_ho_tich(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_can_bo_don_vi_hc_id_fk' and conrelid='public.cd_can_bo'::regclass) then alter table public.cd_can_bo add constraint cd_can_bo_don_vi_hc_id_fk foreign key (don_vi_hc_id) references public.cd_don_vi_hc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_can_bo_don_vi_hc_id_idx on public.cd_can_bo(don_vi_hc_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_can_bo_thanh_vien_du_an_id_fk' and conrelid='public.cd_can_bo'::regclass) then alter table public.cd_can_bo add constraint cd_can_bo_thanh_vien_du_an_id_fk foreign key (thanh_vien_du_an_id) references public.cd_thanh_vien_du_an(id) on delete restrict; end if; end $constraint$;
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_ho_so_yeu_cau_cong_dan_id_fk' and conrelid='public.cd_ho_so_yeu_cau'::regclass) then alter table public.cd_ho_so_yeu_cau add constraint cd_ho_so_yeu_cau_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_ho_so_yeu_cau_cong_dan_id_idx on public.cd_ho_so_yeu_cau(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_ho_so_yeu_cau_nguoi_nop_user_id_fk' and conrelid='public.cd_ho_so_yeu_cau'::regclass) then alter table public.cd_ho_so_yeu_cau add constraint cd_ho_so_yeu_cau_nguoi_nop_user_id_fk foreign key (nguoi_nop_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_ho_so_yeu_cau_nguoi_nop_user_id_idx on public.cd_ho_so_yeu_cau(nguoi_nop_user_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_ho_so_yeu_cau_don_vi_tiep_nhan_id_fk' and conrelid='public.cd_ho_so_yeu_cau'::regclass) then alter table public.cd_ho_so_yeu_cau add constraint cd_ho_so_yeu_cau_don_vi_tiep_nhan_id_fk foreign key (don_vi_tiep_nhan_id) references public.cd_don_vi_hc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_ho_so_yeu_cau_don_vi_tiep_nhan_id_idx on public.cd_ho_so_yeu_cau(don_vi_tiep_nhan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_ho_so_yeu_cau_can_bo_phu_trach_id_fk' and conrelid='public.cd_ho_so_yeu_cau'::regclass) then alter table public.cd_ho_so_yeu_cau add constraint cd_ho_so_yeu_cau_can_bo_phu_trach_id_fk foreign key (can_bo_phu_trach_id) references public.cd_can_bo(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_ho_so_yeu_cau_can_bo_phu_trach_id_idx on public.cd_ho_so_yeu_cau(can_bo_phu_trach_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_lich_su_xu_ly_ho_so_id_fk' and conrelid='public.cd_lich_su_xu_ly'::regclass) then alter table public.cd_lich_su_xu_ly add constraint cd_lich_su_xu_ly_ho_so_id_fk foreign key (ho_so_id) references public.cd_ho_so_yeu_cau(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_lich_su_xu_ly_ho_so_id_idx on public.cd_lich_su_xu_ly(ho_so_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_lich_su_xu_ly_nguoi_thuc_hien_user_id_fk' and conrelid='public.cd_lich_su_xu_ly'::regclass) then alter table public.cd_lich_su_xu_ly add constraint cd_lich_su_xu_ly_nguoi_thuc_hien_user_id_fk foreign key (nguoi_thuc_hien_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_lich_su_xu_ly_nguoi_thuc_hien_user_id_idx on public.cd_lich_su_xu_ly(nguoi_thuc_hien_user_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_lich_su_xu_ly_can_bo_id_fk' and conrelid='public.cd_lich_su_xu_ly'::regclass) then alter table public.cd_lich_su_xu_ly add constraint cd_lich_su_xu_ly_can_bo_id_fk foreign key (can_bo_id) references public.cd_can_bo(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_lich_su_xu_ly_can_bo_id_idx on public.cd_lich_su_xu_ly(can_bo_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_bien_dong_cong_dan_id_fk' and conrelid='public.cd_bien_dong'::regclass) then alter table public.cd_bien_dong add constraint cd_bien_dong_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_bien_dong_cong_dan_id_idx on public.cd_bien_dong(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_bien_dong_ho_so_nguon_id_fk' and conrelid='public.cd_bien_dong'::regclass) then alter table public.cd_bien_dong add constraint cd_bien_dong_ho_so_nguon_id_fk foreign key (ho_so_nguon_id) references public.cd_ho_so_yeu_cau(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_bien_dong_ho_so_nguon_id_idx on public.cd_bien_dong(ho_so_nguon_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_bien_dong_can_bo_id_fk' and conrelid='public.cd_bien_dong'::regclass) then alter table public.cd_bien_dong add constraint cd_bien_dong_can_bo_id_fk foreign key (can_bo_id) references public.cd_can_bo(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_bien_dong_can_bo_id_idx on public.cd_bien_dong(can_bo_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_bien_dong_nguoi_ghi_nhan_user_id_fk' and conrelid='public.cd_bien_dong'::regclass) then alter table public.cd_bien_dong add constraint cd_bien_dong_nguoi_ghi_nhan_user_id_fk foreign key (nguoi_ghi_nhan_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_bien_dong_nguoi_ghi_nhan_user_id_idx on public.cd_bien_dong(nguoi_ghi_nhan_user_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tep_dinh_kem_ho_so_id_fk' and conrelid='public.cd_tep_dinh_kem'::regclass) then alter table public.cd_tep_dinh_kem add constraint cd_tep_dinh_kem_ho_so_id_fk foreign key (ho_so_id) references public.cd_ho_so_yeu_cau(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tep_dinh_kem_ho_so_id_idx on public.cd_tep_dinh_kem(ho_so_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tep_dinh_kem_giay_to_ho_tich_id_fk' and conrelid='public.cd_tep_dinh_kem'::regclass) then alter table public.cd_tep_dinh_kem add constraint cd_tep_dinh_kem_giay_to_ho_tich_id_fk foreign key (giay_to_ho_tich_id) references public.cd_giay_to_ho_tich(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tep_dinh_kem_giay_to_ho_tich_id_idx on public.cd_tep_dinh_kem(giay_to_ho_tich_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tep_dinh_kem_giay_to_dinh_danh_id_fk' and conrelid='public.cd_tep_dinh_kem'::regclass) then alter table public.cd_tep_dinh_kem add constraint cd_tep_dinh_kem_giay_to_dinh_danh_id_fk foreign key (giay_to_dinh_danh_id) references public.cd_the_can_cuoc(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tep_dinh_kem_giay_to_dinh_danh_id_idx on public.cd_tep_dinh_kem(giay_to_dinh_danh_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tep_dinh_kem_nguoi_tai_len_user_id_fk' and conrelid='public.cd_tep_dinh_kem'::regclass) then alter table public.cd_tep_dinh_kem add constraint cd_tep_dinh_kem_nguoi_tai_len_user_id_fk foreign key (nguoi_tai_len_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tep_dinh_kem_nguoi_tai_len_user_id_idx on public.cd_tep_dinh_kem(nguoi_tai_len_user_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_thanh_vien_du_an_auth_user_id_fk' and conrelid='public.cd_thanh_vien_du_an'::regclass) then alter table public.cd_thanh_vien_du_an add constraint cd_thanh_vien_du_an_auth_user_id_fk foreign key (auth_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tai_khoan_cong_dan_cong_dan_id_fk' and conrelid='public.cd_tai_khoan_cong_dan'::regclass) then alter table public.cd_tai_khoan_cong_dan add constraint cd_tai_khoan_cong_dan_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tai_khoan_cong_dan_auth_user_id_fk' and conrelid='public.cd_tai_khoan_cong_dan'::regclass) then alter table public.cd_tai_khoan_cong_dan add constraint cd_tai_khoan_cong_dan_auth_user_id_fk foreign key (auth_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tai_khoan_cong_dan_nguoi_cap_id_fk' and conrelid='public.cd_tai_khoan_cong_dan'::regclass) then alter table public.cd_tai_khoan_cong_dan add constraint cd_tai_khoan_cong_dan_nguoi_cap_id_fk foreign key (nguoi_cap_id) references public.cd_thanh_vien_du_an(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tai_khoan_cong_dan_nguoi_cap_id_idx on public.cd_tai_khoan_cong_dan(nguoi_cap_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_tai_khoan_cong_dan_nguoi_khoa_id_fk' and conrelid='public.cd_tai_khoan_cong_dan'::regclass) then alter table public.cd_tai_khoan_cong_dan add constraint cd_tai_khoan_cong_dan_nguoi_khoa_id_fk foreign key (nguoi_khoa_id) references public.cd_thanh_vien_du_an(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_tai_khoan_cong_dan_nguoi_khoa_id_idx on public.cd_tai_khoan_cong_dan(nguoi_khoa_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_thach_thuc_otp_tai_khoan_id_fk' and conrelid='public.cd_thach_thuc_otp'::regclass) then alter table public.cd_thach_thuc_otp add constraint cd_thach_thuc_otp_tai_khoan_id_fk foreign key (tai_khoan_id) references public.cd_tai_khoan_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_thach_thuc_otp_tai_khoan_id_idx on public.cd_thach_thuc_otp(tai_khoan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_phien_xac_thuc_cong_dan_tai_khoan_id_fk' and conrelid='public.cd_phien_xac_thuc_cong_dan'::regclass) then alter table public.cd_phien_xac_thuc_cong_dan add constraint cd_phien_xac_thuc_cong_dan_tai_khoan_id_fk foreign key (tai_khoan_id) references public.cd_tai_khoan_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_phien_xac_thuc_cong_dan_tai_khoan_id_idx on public.cd_phien_xac_thuc_cong_dan(tai_khoan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_phien_xac_thuc_cong_dan_thach_thuc_otp_id_fk' and conrelid='public.cd_phien_xac_thuc_cong_dan'::regclass) then alter table public.cd_phien_xac_thuc_cong_dan add constraint cd_phien_xac_thuc_cong_dan_thach_thuc_otp_id_fk foreign key (thach_thuc_otp_id) references public.cd_thach_thuc_otp(id) on delete restrict; end if; end $constraint$;
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_nhat_ky_thao_tac_actor_user_id_fk' and conrelid='public.cd_nhat_ky_thao_tac'::regclass) then alter table public.cd_nhat_ky_thao_tac add constraint cd_nhat_ky_thao_tac_actor_user_id_fk foreign key (actor_user_id) references auth.users(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_nhat_ky_thao_tac_actor_user_id_idx on public.cd_nhat_ky_thao_tac(actor_user_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_dot_nhap_du_lieu_nguoi_nhap_id_fk' and conrelid='public.cd_dot_nhap_du_lieu'::regclass) then alter table public.cd_dot_nhap_du_lieu add constraint cd_dot_nhap_du_lieu_nguoi_nhap_id_fk foreign key (nguoi_nhap_id) references public.cd_thanh_vien_du_an(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_dot_nhap_du_lieu_nguoi_nhap_id_idx on public.cd_dot_nhap_du_lieu(nguoi_nhap_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_dong_nhap_dot_nhap_id_fk' and conrelid='public.cd_dong_nhap'::regclass) then alter table public.cd_dong_nhap add constraint cd_dong_nhap_dot_nhap_id_fk foreign key (dot_nhap_id) references public.cd_dot_nhap_du_lieu(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_dong_nhap_dot_nhap_id_idx on public.cd_dong_nhap(dot_nhap_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_dong_nhap_cong_dan_id_fk' and conrelid='public.cd_dong_nhap'::regclass) then alter table public.cd_dong_nhap add constraint cd_dong_nhap_cong_dan_id_fk foreign key (cong_dan_id) references public.cd_cong_dan(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_dong_nhap_cong_dan_id_idx on public.cd_dong_nhap(cong_dan_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_dong_nhap_ho_id_fk' and conrelid='public.cd_dong_nhap'::regclass) then alter table public.cd_dong_nhap add constraint cd_dong_nhap_ho_id_fk foreign key (ho_id) references public.cd_ho_gia_dinh(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_dong_nhap_ho_id_idx on public.cd_dong_nhap(ho_id);
do $constraint$ begin if not exists(select 1 from pg_constraint where conname='cd_dong_nhap_cu_tru_id_fk' and conrelid='public.cd_dong_nhap'::regclass) then alter table public.cd_dong_nhap add constraint cd_dong_nhap_cu_tru_id_fk foreign key (cu_tru_id) references public.cd_cu_tru(id) on delete restrict; end if; end $constraint$;
create index if not exists cd_dong_nhap_cu_tru_id_idx on public.cd_dong_nhap(cu_tru_id);

-- A pending citizen account has no Auth user until server-side provisioning succeeds.
alter table public.cd_tai_khoan_cong_dan alter column auth_user_id drop not null;
-- Supporting operational tables. The first 22 match database-schema.json; these hold view layouts and report revisions.
create table if not exists public.cd_erd_layouts (
  layout_key text primary key,
  owner_user_id uuid references auth.users(id),
  is_shared boolean not null default false,
  layouts jsonb not null default '{}',
  row_version integer not null default 1,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references auth.users(id),
  check ((is_shared and layout_key='shared' and owner_user_id is null) or (not is_shared and layout_key='personal:'||owner_user_id::text))
);
create table if not exists public.cd_section_revisions (
  id uuid primary key default gen_random_uuid(), section_slug text not null,
  actor_user_id uuid references auth.users(id), actor_label text not null,
  action text not null, before_row jsonb, after_row jsonb not null,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists cd_section_revisions_slug_idx on public.cd_section_revisions(section_slug,occurred_at desc);
create index if not exists cd_audit_entity_idx on public.cd_nhat_ky_thao_tac(doi_tuong_loai,doi_tuong_id,thoi_diem desc);
create index if not exists cd_requests_status_idx on public.cd_ho_so_yeu_cau(trang_thai,created_at desc);
create index if not exists cd_sessions_account_idx on public.cd_phien_xac_thuc_cong_dan(tai_khoan_id,het_han_luc);
create table if not exists public.cd_rate_limits (
  key text primary key, window_start timestamptz not null default clock_timestamp(), attempts integer not null default 0
);
-- Current rows are unique; closed historical rows are retained.
create unique index if not exists cd_residence_active_idx on public.cd_cu_tru(cong_dan_id,loai_cu_tru) where den_ngay is null and trang_thai='hieu_luc';
create unique index if not exists cd_household_active_citizen_idx on public.cd_thanh_vien_ho(cong_dan_id) where den_ngay is null;
create unique index if not exists cd_household_one_head_idx on public.cd_thanh_vien_ho(ho_id) where den_ngay is null and quan_he_voi_chu_ho='chu_ho';
create unique index if not exists cd_card_active_idx on public.cd_the_can_cuoc(cong_dan_id) where trang_thai='con_hieu_luc';
create unique index if not exists cd_marital_active_idx on public.cd_tinh_trang_hon_nhan(cong_dan_id) where den_ngay is null;
create unique index if not exists cd_nationality_active_idx on public.cd_quoc_tich_cong_dan(cong_dan_id,ma_quoc_gia) where den_ngay is null;
create unique index if not exists cd_relation_active_idx on public.cd_quan_he_nhan_than(cong_dan_id,loai_quan_he) where den_ngay is null;

create or replace function public.cd_is_member_user(p_user uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
  select p_user is not null and exists(
    select 1 from public.sections s join public.cd_thanh_vien_du_an m on m.auth_user_id=s.owner_id
    where s.slug in ('phan1','phan2','phan3') and s.owner_id=p_user and m.trang_thai='hoat_dong'
  );
$$;
create or replace function public.cd_is_member() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$ select public.cd_is_member_user(auth.uid()); $$;
create or replace function public.cd_require_member() returns uuid
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if not public.cd_is_member() then raise exception 'MEMBER_REQUIRED' using errcode='42501'; end if;
 return auth.uid();
end; $$;
create or replace function public.cd_member_id(p_user uuid default auth.uid()) returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
 select id from public.cd_thanh_vien_du_an where auth_user_id=p_user and trang_thai='hoat_dong';
$$;
create or replace function public.cd_actor_label(p_user uuid default auth.uid()) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select ten_hien_thi from public.cd_thanh_vien_du_an where auth_user_id=p_user),
 (select c.ho_ten_khai_sinh from public.cd_tai_khoan_cong_dan a join public.cd_cong_dan c on c.id=a.cong_dan_id where a.auth_user_id=p_user),'Hệ thống');
$$;
create or replace function public.cd_current_citizen() returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
 select a.cong_dan_id from public.cd_tai_khoan_cong_dan a
 join public.cd_phien_xac_thuc_cong_dan s on s.tai_khoan_id=a.id
 where a.auth_user_id=auth.uid() and a.trang_thai='active'
 and s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
 and exists(select 1 from auth.sessions x where x.id=s.auth_session_id and x.user_id=auth.uid())
 and s.phien_ban_bao_mat=a.phien_ban_bao_mat and s.thu_hoi_luc is null and s.het_han_luc>now()
 limit 1;
$$;
create or replace function public.cd_today() returns date language sql stable set search_path=pg_catalog as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date; $$;
create or replace function public.cd_bump_version() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin new.updated_at=clock_timestamp();new.row_version=old.row_version+1;new.updated_by=coalesce(auth.uid(),new.updated_by,old.updated_by);return new;end;$$;

-- Initialize only the three existing report owners; citizen users never enter this roster.
insert into public.cd_thanh_vien_du_an(auth_user_id,ten_hien_thi,vai_tro_nhom,quyen_he_thong,trang_thai)
 select distinct s.owner_id,coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->'project_profile'->>'name',''),'Thành viên dự án'),'Thành viên','bien_tap','hoat_dong'
 from public.sections s join auth.users u on u.id=s.owner_id where s.slug in ('phan1','phan2','phan3')
 on conflict(auth_user_id) do nothing;
insert into public.cd_don_vi_hc(ma_don_vi,ten_don_vi,cap_hanh_chinh,hieu_luc_tu,trang_thai)
 values ('MAU-A','Phường Mẫu A','phuong',public.cd_today(),'hoat_dong'),('MAU-B','Phường Mẫu B','phuong',public.cd_today(),'hoat_dong'),('MAU-C','Phường Mẫu C','phuong',public.cd_today(),'hoat_dong') on conflict(ma_don_vi) do nothing;
insert into public.cd_can_bo(ma_can_bo,ho_ten,chuc_vu,don_vi_hc_id,thanh_vien_du_an_id,trang_thai)
 select 'CB-'||m.id::text,m.ten_hien_thi,'Thành viên đồ án',(select id from public.cd_don_vi_hc where ma_don_vi='MAU-A'),m.id,'dang_cong_tac'
 from public.cd_thanh_vien_du_an m on conflict(thanh_vien_du_an_id) do nothing;

-- Fictional-only constraints are repeated at the API boundary.
do $constraints$ begin
 if not exists(select 1 from pg_constraint where conname='cd_fictional_identifier') then
  alter table public.cd_cong_dan add constraint cd_fictional_identifier check(so_dinh_danh is null or so_dinh_danh ~ '^000[0-9]{9}$');
  alter table public.cd_cong_dan add constraint cd_profile_text_bounds check(char_length(ho_ten_khai_sinh) between 2 and 80 and (email_lien_he is null or (char_length(email_lien_he)<=100 and email_lien_he ~ '^[^[:space:]@]+@example[.]invalid$')) and (so_dien_thoai_lien_he is null or so_dien_thoai_lien_he ~ '^000[0-9]{7}$'));
  alter table public.cd_ho_so_yeu_cau add constraint cd_request_state check(trang_thai in ('nhap','da_gui','da_tiep_nhan','dang_xu_ly','can_bo_sung','hoan_thanh','tu_choi','da_huy'));
  alter table public.cd_ho_so_yeu_cau add constraint cd_request_bounds check(char_length(tieu_de) between 3 and 160 and char_length(noi_dung) between 5 and 5000);
  alter table public.cd_tai_khoan_cong_dan add constraint cd_account_state check(trang_thai in ('not-issued','active','locked'));
  alter table public.cd_tai_khoan_cong_dan add constraint cd_account_phone check(so_dien_thoai_otp ~ '^000[0-9]{7}$');
  alter table public.cd_thach_thuc_otp add constraint cd_otp_attempts check(so_lan_sai>=0 and gioi_han_thu between 1 and 5);
  alter table public.cd_dong_nhap add constraint cd_import_line_unique unique(dot_nhap_id,so_dong);
 end if;
end $constraints$;

-- Apply RLS and version triggers to only this feature's tables.
do $setup$ declare t record; begin
 for t in select c.table_name from information_schema.tables c where c.table_schema='public' and c.table_name like 'cd\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',t.table_name);
  execute format('revoke all on public.%I from public,anon,authenticated',t.table_name);
  execute format('grant all on public.%I to service_role',t.table_name);
  if t.table_name not in ('cd_thach_thuc_otp','cd_phien_xac_thuc_cong_dan','cd_rate_limits','cd_portal_meta') then
   execute format('grant select on public.%I to authenticated',t.table_name);
   execute format('drop policy if exists cd_member_read on public.%I',t.table_name);
   execute format('create policy cd_member_read on public.%I for select to authenticated using(public.cd_is_member())',t.table_name);
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='updated_by') and t.table_name<>'cd_erd_layouts' then
   execute format('drop trigger if exists cd_version on public.%I',t.table_name);
   execute format('create trigger cd_version before update on public.%I for each row execute function public.cd_bump_version()',t.table_name);
  end if;
 end loop;
end $setup$;
-- Personal layouts are private even between members; only the shared layout can be read by the team.
drop policy if exists cd_member_read on public.cd_erd_layouts;
drop policy if exists cd_layout_read on public.cd_erd_layouts;
create policy cd_layout_read on public.cd_erd_layouts for select to authenticated using(public.cd_is_member() and (is_shared or owner_user_id=auth.uid()));
-- Citizens receive only their own rows after a server-verified second step.
drop policy if exists cd_own_citizen_read on public.cd_cong_dan;
create policy cd_own_citizen_read on public.cd_cong_dan for select to authenticated using(id=public.cd_current_citizen());
drop policy if exists cd_own_request_read on public.cd_ho_so_yeu_cau;
create policy cd_own_request_read on public.cd_ho_so_yeu_cau for select to authenticated using(cong_dan_id=public.cd_current_citizen());
-- Writes are performed by checked RPCs, never by client-side table privileges.
-- Deny public execution of internal helpers, including SECURITY DEFINER functions.
do $permissions$ declare f record;begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cd\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
  if f.proname=any(array['cd_is_member','cd_current_citizen','cd_member_bundle','cd_citizen_bundle','cd_save_record','cd_record_history','cd_restore_record','cd_save_request','cd_process_request','cd_import_commit','cd_import_batches','cd_erd_load','cd_erd_save','cd_section_history','cd_restore_section','cd_account_state']) then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
  if f.proname='cd_portal_status' then execute format('grant execute on function %s to anon,authenticated',f.signature);end if;
 end loop;
end $permissions$;
commit;
