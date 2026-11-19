-- Public bucket for the recorded female voice of the fixed "Nghe hướng dẫn" texts.
-- Only the gemini-assistant Edge Function (service role) writes here; anyone may read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assistant-voice', 'assistant-voice', true, 5242880, array['audio/wav', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do nothing;
