-- The Gmail App Password relay has been replaced by Google Apps Script MailApp.
-- Remove the obsolete encrypted SMTP credential so it is no longer retained.
drop table if exists public.zyro_email_settings;
