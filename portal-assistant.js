'use strict';
// Voice help for the citizen portal: scripted read-aloud guidance for everyone,
// plus a push-to-talk conversation with Gemini for signed-in users:
// press the mic, speak, the assistant answers aloud, then listens again.
(() => {
  const synth = window.speechSynthesis;
  // Brave exposes the API but blocks the speech service behind it, so treat it as unsupported.
  const isBrave = !!window.navigator?.brave || (window.navigator?.userAgentData?.brands || []).some(b => /brave/i.test(b.brand));
  const VERSION = '2026-11-20.5';
  const Recognition = isBrave ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

  // ---------- Saved per-device preferences ----------
  const PREF_KEY = 'nhom12-voice';
  // Default: the device voice, so answers are read aloud at once with no button and no
  // Gemini quota. The female AI voice stays available (read on demand) in the settings.
  const PREFS_VERSION = 2;
  const prefs = { rate: 0.9, voice: '', autoRead: true, continuous: true, aiVoice: false, aiVoiceName: 'Leda', v: PREFS_VERSION };
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    // Choices saved before version 2 had the AI voice on by default; start them on the device voice.
    if (saved.v !== PREFS_VERSION) { delete saved.aiVoice; saved.autoRead = true; saved.v = PREFS_VERSION; }
    Object.assign(prefs, saved);
  } catch { /* storage unavailable */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable */ } };

  const host = el('div', 'va-dock');
  host.innerHTML = `
    <section class="va-panel" id="va-panel" aria-labelledby="va-title" hidden>
      <header class="va-head"><strong id="va-title">Trợ lý Cổng công dân</strong><button type="button" class="va-close" aria-label="Đóng trợ lý">×</button></header>
      <div class="va-log" role="log" aria-live="polite" aria-label="Hội thoại với trợ lý"></div>
      <div class="va-state" data-state="idle"><span class="va-state-icon" aria-hidden="true"></span><span class="va-state-text"></span></div>
      <p class="va-status" role="status"></p>
      <form class="va-form">
        <button type="button" class="va-mic" aria-pressed="false"></button>
        <label class="va-label" for="va-question">Hoặc gõ câu hỏi</label>
        <div class="va-row"><textarea id="va-question" rows="2" maxlength="1000" placeholder="Ví dụ: Làm sao để sửa địa chỉ?"></textarea><button type="submit" class="va-send">Gửi</button></div>
        <details class="va-settings"><summary>Cài đặt giọng nói</summary>
          <label class="va-auto"><input type="checkbox" name="autoRead"> Tự đọc to câu trả lời (khi dùng giọng của máy)</label>
          <label class="va-auto"><input type="checkbox" name="continuous"> Trò chuyện liên tục (trả lời xong tự nghe tiếp)</label>
          <label class="va-field">Tốc độ đọc <select name="rate"><option value="0.75">Chậm</option><option value="0.9">Vừa</option><option value="1.1">Nhanh</option></select></label>
          <label class="va-field">Giọng đọc <select name="voice"></select></label>
          <button type="button" class="va-try">🔊 Nghe thử</button>
          <small class="va-version">Phiên bản trợ lý: ${VERSION}${isBrave ? ' · Brave' : ''}</small>
        </details>
      </form>
      <small class="va-note">Không nói mật khẩu, mã OTP hay số căn cước. Câu hỏi được gửi tới Google Gemini; trợ lý có thể nhầm.</small>
    </section>
    <div class="va-buttons">
      <button type="button" class="va-listen" aria-pressed="false"><span aria-hidden="true">🔊</span> <span class="va-listen-text">Nghe hướng dẫn</span></button>
      <button type="button" class="va-ask" aria-controls="va-panel" aria-expanded="false" hidden><span aria-hidden="true">🎙</span> Nói với trợ lý</button>
    </div>`;
  document.body.append(host);
  const $ = s => host.querySelector(s);
  const panel = $('.va-panel'), log = $('.va-log'), status = $('.va-status'), form = $('.va-form'), input = $('#va-question');
  const listenBtn = $('.va-listen'), askBtn = $('.va-ask'), micBtn = $('.va-mic'), sendBtn = $('.va-send');
  const stateBox = $('.va-state'), settings = $('.va-settings');
  const autoRead = settings.querySelector('[name=autoRead]'), continuous = settings.querySelector('[name=continuous]');
  const rateSelect = settings.querySelector('[name=rate]'), voiceSelect = settings.querySelector('[name=voice]');

  // ---------- Conversation state ----------
  // idle → listening → thinking → speaking → (listening again if continuous)
  let state = 'idle';
  const stateText = {
    idle: Recognition ? 'Bấm nút micro rồi nói câu hỏi của bạn.' : 'Gõ câu hỏi rồi bấm Gửi.',
    listening: 'Đang nghe… Mời bạn nói.',
    thinking: 'Trợ lý đang suy nghĩ…',
    speaking: 'Trợ lý đang trả lời… Bấm micro để ngắt lời và hỏi tiếp.',
  };
  const micText = {
    idle: '<span aria-hidden="true">🎙</span> Bấm để nói',
    listening: '<span aria-hidden="true">■</span> Đang nghe… bấm để dừng',
    thinking: '<span aria-hidden="true">…</span> Đang trả lời',
    speaking: '<span aria-hidden="true">🎙</span> Ngắt lời và nói',
  };
  function setState(next) {
    state = next;
    stateBox.dataset.state = next;
    $('.va-state-text').textContent = stateText[next];
    micBtn.innerHTML = micText[next];
    micBtn.setAttribute('aria-pressed', String(next === 'listening'));
    micBtn.disabled = next === 'thinking';
    sendBtn.disabled = input.disabled = next === 'thinking';
    host.classList.toggle('va-live', next === 'listening');
  }

  // ---------- Voices ----------
  const isVietnamese = v => /^vi([-_]|$)/i.test(v.lang);
  // Prefer neural/natural voices (Edge "Online (Natural)", Google, Apple enhanced).
  // Female voices first (HoaiMy on Edge, Google Tiếng Việt, Linh on Apple), male voices last.
  const voiceScore = v => (/natural|online|neural/i.test(v.name) ? 6 : 0) + (/google/i.test(v.name) ? 4 : 0)
    + (/enhanced|premium|nâng cao/i.test(v.name) ? 3 : 0) + (v.localService === false ? 1 : 0)
    + (/hoaimy|hoài my|linh|female|\bnữ\b|\bmy\b|thu|lan|mai/i.test(v.name) ? 8 : 0)
    - (/namminh|nam minh|\ban\b|male|\bnam\b|minh/i.test(v.name) && !/female/i.test(v.name) ? 8 : 0);
  const vietnameseVoices = () => (synth?.getVoices() || []).filter(isVietnamese).sort((a, b) => voiceScore(b) - voiceScore(a));
  function chosenVoice() {
    const voices = vietnameseVoices();
    return voices.find(v => v.name === prefs.voice) || voices[0] || null;
  }
  // Female Gemini voices (server allowlist TTS_VOICES); the first is the default.
  const AI_VOICES = [['Leda', 'Giọng nữ AI: trẻ trung, rõ (bấm nút để nghe)'], ['Aoede', 'Giọng nữ AI: nhẹ nhàng'], ['Sulafat', 'Giọng nữ AI: ấm áp'], ['Kore', 'Giọng nữ AI: trầm']];
  // The natural AI voice comes first; device voices are labelled so a male one is obvious.
  const voiceGender = v => /hoaimy|hoài my|linh|female|\bnữ\b|\bmy\b/i.test(v.name) ? ' (nữ)' : /namminh|nam minh|\ban\b|male|\bnam\b/i.test(v.name) ? ' (nam)' : '';
  const voiceLabel = v => 'Giọng của máy: ' + v.name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Vietnamese.*$/i, '').replace(/\s*Online \(Natural\)/i, '') + voiceGender(v);
  function fillVoices() {
    const voices = vietnameseVoices();
    voiceSelect.replaceChildren(...AI_VOICES.map(([name, label]) => new Option(label, 'ai:' + name)),
      new Option(voices.length ? 'Giọng của máy: tự chọn (tự đọc ngay)' : 'Giọng của máy (máy chưa có giọng tiếng Việt)', ''),
      ...voices.map(v => new Option(voiceLabel(v), v.name)));
    voiceSelect.value = prefs.aiVoice !== false ? 'ai:' + (AI_VOICES.some(([n]) => n === prefs.aiVoiceName) ? prefs.aiVoiceName : AI_VOICES[0][0])
      : voices.some(v => v.name === prefs.voice) ? prefs.voice : '';
  }
  // Same shape as the old checkbox: true while the AI voice is selected.
  const aiVoice = { get checked() { return voiceSelect.value.startsWith('ai:'); } };
  const aiVoiceName = () => aiVoice.checked ? voiceSelect.value.slice(3) : undefined;
  autoRead.checked = prefs.autoRead !== false;
  continuous.checked = prefs.continuous !== false;
  rateSelect.value = ['0.75', '0.9', '1.1'].includes(String(prefs.rate)) ? String(prefs.rate) : '0.9';
  autoRead.onchange = () => { prefs.autoRead = autoRead.checked; savePrefs(); };
  continuous.onchange = () => { prefs.continuous = continuous.checked; savePrefs(); };
  rateSelect.onchange = () => { prefs.rate = Number(rateSelect.value); savePrefs(); };
  voiceSelect.onchange = () => { if (aiVoice.checked) { prefs.aiVoice = true; prefs.aiVoiceName = aiVoiceName(); } else { prefs.aiVoice = false; prefs.voice = voiceSelect.value; } savePrefs(); };
  fillVoices();
  if (synth) synth.addEventListener?.('voiceschanged', fillVoices);
  // "Nghe thử" plays exactly the voice that is selected.
  const tryBtn = $('.va-try');
  tryBtn.onclick = async () => {
    const sample = 'Bạn đang ở Cổng công dân.';
    if (!aiVoice.checked) { speak(sample, tryBtn); return; }
    unlockVoice();
    const clip = await guideClip('portal_home');
    speak(sample, tryBtn, undefined, clip);
  };

  // ---------- Speech output ----------
  let speakingFrom = null, warnedVoice = false, speechToken = 0;
  // Spoken form only; the text on screen is unchanged.
  const forSpeech = text => String(text)
    .replace(/\bCCCD\b/g, 'căn cước công dân').replace(/\bOTP\b/g, 'mã xác thực').replace(/\bAI\b/g, 'trợ lý')
    .replace(/[\u{1F300}-\u{1FAFF}☀-➿→←✓■…]/gu, ' ').replace(/\s*\/\s*/g, ' hoặc ').replace(/\s+/g, ' ').trim();
  let player = null, voiceEl = null, voiceUnlocked = false;
  // One reusable <audio> element. Playing it once inside a click "unlocks" it, so the
  // AI voice can still play seconds later when the answer arrives (Brave/Safari block
  // audio that starts without a recent click otherwise).
  const SILENT_WAV = (() => {
    const bytes = new Uint8Array(44 + 800), view = new DataView(bytes.buffer);
    const tag = (o, s) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
    tag(0, 'RIFF'); view.setUint32(4, 36 + 800, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    tag(36, 'data'); view.setUint32(40, 800, true);
    return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...bytes));
  })();
  const voiceElement = () => voiceEl || (typeof window.Audio === 'function' ? (voiceEl = new Audio()) : null);
  function unlockVoice() {
    const a = voiceElement();
    if (!a || voiceUnlocked || !aiVoice.checked || player) return;
    try { a.src = SILENT_WAV; const p = a.play(); if (p?.then) p.then(() => { voiceUnlocked = true; }, () => {}); } catch { /* fall back later */ }
  }
  function haltSpeech() {
    speechToken++;
    synth?.cancel();
    if (player) { player.onended = player.onerror = null; try { player.pause(); } catch { /* not playing */ } player = null; }
    if (speakingFrom) speakingFrom.setAttribute('aria-pressed', 'false');
    speakingFrom = null;
    listenBtn.querySelector('.va-listen-text').textContent = 'Nghe hướng dẫn';
  }
  function stopSpeaking() { haltSpeech(); if (state === 'speaking') setState('idle'); }
  // Natural voice made on the server; falls back to the device voice if it cannot play.
  const audioRate = () => ({ 0.75: 0.85, 0.9: 1, 1.1: 1.15 })[Number(prefs.rate)] || 1;
  function speak(text, from, onDone, audio) {
    if ((audio?.data || audio?.url) && aiVoice.checked && voiceElement()) {
      haltSpeech();
      if (!onDone && state === 'speaking') setState('idle');
      const token = speechToken, a = player = voiceElement();
      const done = () => { if (token !== speechToken || player !== a) return; player = null; if (from) from.setAttribute('aria-pressed', 'false'); if (from === listenBtn) listenBtn.querySelector('.va-listen-text').textContent = 'Nghe hướng dẫn'; speakingFrom = null; onDone?.(); };
      const fallback = reason => {
        if (token !== speechToken) return;
        player = null;
        notice(reason === 'NotAllowedError'
          ? 'Trình duyệt đang chặn phát giọng AI nên tạm dùng giọng của máy. Với Brave: bấm biểu tượng sư tử hoặc ổ khóa cạnh địa chỉ web, cho phép "Tự động phát" (Autoplay) rồi tải lại trang.'
          : 'Chưa phát được giọng AI nên tạm dùng giọng của máy.');
        speak(text, from, onDone);
      };
      speakingFrom = from || null; if (from) from.setAttribute('aria-pressed', 'true');
      if (from === listenBtn) listenBtn.querySelector('.va-listen-text').textContent = 'Dừng đọc';
      a.onended = done; a.onerror = () => fallback('error');
      a.src = audio.url || 'data:' + audio.mime + ';base64,' + audio.data;
      a.playbackRate = audioRate();
      Promise.resolve().then(() => a.play()).then(() => { voiceUnlocked = true; }, e => fallback(e?.name));
      return;
    }
    if (!synth) { notice('Trình duyệt này chưa hỗ trợ đọc to. Hãy dùng Chrome, Edge hoặc Safari.'); onDone?.(); return; }
    haltSpeech();
    // Any other reading interrupts an answer that was being read out.
    if (!onDone && state === 'speaking') setState('idle');
    const voice = chosenVoice(), token = ++speechToken;
    if (!voice && !warnedVoice) { warnedVoice = true; notice('Máy chưa có giọng đọc tiếng Việt nên có thể đọc không rõ. Hãy dùng trình duyệt Edge hoặc cài giọng tiếng Việt trong cài đặt máy.'); }
    // Short utterances avoid browsers cutting off long speech.
    const parts = forSpeech(text).match(/[^.!?:;\n]+[.!?:;]?/g) || [];
    if (!parts.length) { onDone?.(); return; }
    speakingFrom = from || null;
    if (from) from.setAttribute('aria-pressed', 'true');
    if (from === listenBtn) listenBtn.querySelector('.va-listen-text').textContent = 'Dừng đọc';
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.lang = voice?.lang || 'vi-VN'; u.rate = Number(prefs.rate) || 0.9; if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = () => {
        if (token !== speechToken) return;
        if (speakingFrom === from) { if (from) from.setAttribute('aria-pressed', 'false'); speakingFrom = null; listenBtn.querySelector('.va-listen-text').textContent = 'Nghe hướng dẫn'; }
        onDone?.();
      };
      synth.speak(u);
    });
  }

  // ---------- Scripted guidance for the current screen ----------
  const route = () => (location.hash || '#/login').slice(1);
  function heading() {
    const h = document.querySelector('#portal-main h1, #portal-app h1, #portal-app h2');
    return h ? h.textContent.trim() : '';
  }
  const profileGuides = {
    personal: 'Trang này cho bạn xem thông tin cá nhân như họ tên, ngày sinh và quê quán. Nếu thấy thông tin sai, hãy vào mục Hồ sơ yêu cầu để gửi yêu cầu sửa.',
    card: 'Trang này cho bạn xem thông tin thẻ căn cước. Bạn chỉ xem, không tự sửa được.',
    residence: 'Trang này cho bạn xem nơi thường trú và tạm trú. Muốn thay đổi, hãy gửi yêu cầu ở mục Hồ sơ yêu cầu.',
    documents: 'Trang này liệt kê giấy tờ của bạn. Bấm vào từng giấy tờ để xem chi tiết.',
    requests: 'Trang này để gửi và theo dõi yêu cầu. Bước 1: bấm nút gửi yêu cầu. Bước 2: chọn loại yêu cầu và ghi nội dung cần sửa. Bước 3: bấm Gửi. Trạng thái sẽ chuyển từ Đã gửi, sang Đã tiếp nhận, Đang xử lý rồi Hoàn thành. Nếu thấy Cần bổ sung, hãy mở yêu cầu, bổ sung rồi gửi lại.',
    security: 'Trang này để đổi mật khẩu. Nhập mật khẩu hiện tại, rồi nhập mật khẩu mới hai lần và bấm lưu. Nếu quên mật khẩu hoặc mất số nhận mã, hãy liên hệ thành viên phụ trách.',
  };
  // Fixed guide texts. The server keeps an identical copy (GUIDE_CLIPS) and turns
  // each one into a natural female recording once, cached in Supabase Storage.
  const ASK_HINT = 'Nếu cần hỏi thêm, hãy bấm nút Nói với trợ lý ở góc dưới màn hình rồi nói câu hỏi của bạn.';
  const PROFILE_NAV = 'Danh sách các trang nằm ở cột bên trái, hoặc nút menu ở đầu trang trên điện thoại. Khi dùng xong, hãy bấm Đăng xuất.';
  const profileTitles = { personal: 'Thông tin cá nhân', card: 'Căn cước', residence: 'Thông tin cư trú', documents: 'Giấy tờ của tôi', requests: 'Hồ sơ yêu cầu', security: 'Bảo mật tài khoản' };
  const GUIDE_CLIPS = {
    login_citizen: 'Chào bạn. Đây là trang đăng nhập Cổng công dân. Bước 1: nhập số căn cước công dân gồm 12 chữ số vào ô đầu tiên. Bước 2: nhập mật khẩu mà cán bộ đã cấp cho bạn. Bước 3: bấm nút Tiếp tục. Sau đó bạn sẽ nhận mã xác thực qua Telegram. Nếu quên mật khẩu, hãy liên hệ thành viên phụ trách.',
    login_otp: 'Bạn đang ở bước nhập mã xác thực. Mở ứng dụng Telegram trên điện thoại để xem mã gồm 6 chữ số. Nhập 6 chữ số đó vào ô Mã xác thực rồi bấm nút Xác thực và truy cập. Nếu mã hết hạn, chờ hết thời gian rồi bấm Cấp mã mới.',
    login_member: 'Đây là phần đăng nhập dành cho thành viên dự án. Nếu bạn là công dân, hãy bấm thẻ Công dân ở phía trên.',
    portal_home: 'Bạn đang ở Cổng công dân.',
    member_area: 'Đây là khu vực quản lý dành cho thành viên dự án. ' + ASK_HINT,
  };
  for (const [page, text] of Object.entries(profileGuides)) GUIDE_CLIPS['profile_' + page] = 'Bạn đang ở trang ' + profileTitles[page] + '. ' + text + ' ' + PROFILE_NAV + ' ' + ASK_HINT;
  function guideScript() {
    const r = route();
    let key;
    if (r === '/login' || r === '' || r === '/') {
      key = document.getElementById('otp-form') ? 'login_otp' : document.getElementById('member-login') ? 'login_member'
        : document.getElementById('citizen-login') ? 'login_citizen' : 'portal_home';
    } else if (r.startsWith('/profile')) {
      const page = r.split('/')[2] || 'personal';
      key = 'profile_' + (Object.hasOwn(profileGuides, page) ? page : 'personal');
    } else key = 'member_area';
    const alerts = [...document.querySelectorAll('#portal-app [role=alert], dialog[open] [role=alert]')].map(a => a.textContent.trim()).filter(Boolean);
    return { key, text: GUIDE_CLIPS[key], alert: alerts.length ? 'Có thông báo: ' + alerts.join('. ') : '' };
  }
  // Recorded female voice for a guide text; null means "use the device voice".
  const clipCache = new Map();
  async function guideClip(key) {
    const voice = aiVoiceName(), cacheKey = key + '|' + voice;
    if (clipCache.has(cacheKey)) return clipCache.get(cacheKey);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(window.PortalAPI.url + '/functions/v1/gemini-assistant', {
        method: 'POST', signal: controller.signal,
        headers: { apikey: window.PortalAPI.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'guide_audio', key, voice }),
      });
      const data = await response.json();
      const publicPrefix = window.PortalAPI.url + '/storage/v1/object/public/';
      const clip = response.ok && typeof data.url === 'string' && data.url.startsWith(publicPrefix) ? { url: data.url }
        : response.ok && typeof data.audio?.data === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(String(data.audio.mime)) ? data.audio : null;
      if (clip?.url) clipCache.set(cacheKey, clip);
      return clip;
    } catch { return null; } finally { clearTimeout(timer); }
  }
  let guideToken = 0;
  async function playGuide() {
    const token = ++guideToken, g = guideScript();
    stopListening();
    const label = listenBtn.querySelector('.va-listen-text');
    let clip = null;
    if (aiVoice.checked && window.PortalAPI && typeof window.Audio === 'function') {
      label.textContent = 'Đang chuẩn bị…'; listenBtn.setAttribute('aria-pressed', 'true'); speakingFrom = listenBtn;
      clip = await guideClip(g.key);
      if (token !== guideToken) return;
    }
    if (!clip) { speak(g.alert ? g.text + ' ' + g.alert : g.text, listenBtn); return; }
    // Error messages change with each situation, so only they use the device voice.
    speak(g.text, listenBtn, g.alert ? () => { if (token === guideToken) speak(g.alert, listenBtn); } : undefined, clip);
  }
  listenBtn.onclick = () => { if (speakingFrom === listenBtn) { guideToken++; stopSpeaking(); } else { unlockVoice(); playGuide(); } };

  // ---------- Gemini conversation ----------
  const member = () => window.PortalAuth?.isMember() === true;
  const citizen = () => window.CitizenRepository?.hasCitizenSession?.() === true;
  const canAsk = () => member() || citizen();

  // ---------- Taking the user to the place they asked about ----------
  // Fixed list: the server (or the keyword fallback) only names a key, never a URL.
  const PLACES = {
    profile_personal: { role: 'citizen', route: '#/profile/personal', label: 'Thông tin cá nhân', focus: '#portal-main h1', guide: profileGuides.personal },
    profile_card: { role: 'citizen', route: '#/profile/card', label: 'Căn cước / CCCD', focus: '#identity-reveal', guide: profileGuides.card },
    profile_residence: { role: 'citizen', route: '#/profile/residence', label: 'Thông tin cư trú', focus: '#portal-main h1', guide: profileGuides.residence },
    profile_documents: { role: 'citizen', route: '#/profile/documents', label: 'Giấy tờ của tôi', focus: '#portal-main h1', guide: profileGuides.documents },
    profile_requests: { role: 'citizen', route: '#/profile/requests', label: 'Hồ sơ yêu cầu', focus: '#new-citizen-request', guide: profileGuides.requests },
    profile_security: { role: 'citizen', route: '#/profile/security', label: 'Bảo mật tài khoản', focus: '#citizen-password-form', guide: profileGuides.security },
    logout: { role: 'citizen', route: null, label: 'nút Đăng xuất', focus: '#citizen-logout', guide: 'Nút Đăng xuất nằm ở đầu trang, mình đã làm sáng nút đó. Bấm vào để thoát khỏi tài khoản.' },
    admin: { role: 'member', route: '#/admin', label: 'Hồ sơ công dân' },
    households: { role: 'member', route: '#/households', label: 'Hộ gia đình' },
    residences: { role: 'member', route: '#/residences', label: 'Cư trú và biến động' },
    documents: { role: 'member', route: '#/documents', label: 'Giấy tờ hành chính' },
    statistics: { role: 'member', route: '#/statistics', label: 'Thống kê dân cư' },
    requests: { role: 'member', route: '#/requests', label: 'Xử lý yêu cầu' },
    imports: { role: 'member', route: '#/imports', label: 'Nhập / xuất dữ liệu' },
    lookup: { role: 'member', route: '#/lookup', label: 'Tra cứu hành chính' },
    settings: { role: 'member', route: '#/settings', label: 'Phân quyền và bảo mật' },
  };
  const placeAllowed = key => Object.hasOwn(PLACES, key) && (PLACES[key].role === 'citizen' ? citizen() : member());
  const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  // Used only when the AI cannot answer, so people still get to the right page.
  const KEYWORDS = [
    ['logout', ['dang xuat', 'thoat tai khoan']],
    ['profile_security', ['mat khau', 'bao mat', 'otp', 'ma xac thuc', 'telegram', 'so nhan ma']],
    ['profile_requests', ['sua', 'thay doi', 'dieu chinh', 'yeu cau', 'sai thong tin', 'cap nhat', 'bo sung', 'khieu nai']],
    ['profile_residence', ['dia chi', 'cu tru', 'thuong tru', 'tam tru', 'noi o']],
    ['profile_card', ['can cuoc', 'cccd', 'so dinh danh', 'chung minh']],
    ['profile_documents', ['giay to', 'khai sinh', 'ket hon', 'ho tich']],
    ['profile_personal', ['thong tin ca nhan', 'ho ten', 'ngay sinh', 'que quan', 'ca nhan']],
    ['households', ['ho gia dinh', 'chu ho', 'ma ho']],
    ['residences', ['cu tru', 'thuong tru', 'tam tru', 'bien dong']],
    ['documents', ['giay to', 'khai sinh', 'ket hon', 'ho tich']],
    ['statistics', ['thong ke']],
    ['requests', ['yeu cau']],
    ['imports', ['nhap du lieu', 'nhap file', 'xuat du lieu', 'xuat file', 'excel', 'csv']],
    ['lookup', ['tra cuu', 'danh muc', 'don vi hanh chinh']],
    ['settings', ['phan quyen', 'vai tro', 'otp', 'telegram', 'sao luu', 'bao mat']],
    ['admin', ['ho so', 'cong dan', 'tai khoan']],
  ];
  function matchPlace(question) {
    const text = ' ' + fold(question).replace(/[^a-z0-9]+/g, ' ') + ' ';
    const hit = KEYWORDS.find(([key, words]) => placeAllowed(key) && words.some(w => text.includes(' ' + w + ' ')));
    return hit ? hit[0] : null;
  }
  function waitFor(selector, timeout = 4000) {
    return new Promise(resolve => {
      const started = Date.now();
      (function check() {
        const found = document.querySelector(selector);
        if (found || Date.now() - started > timeout) resolve(found); else setTimeout(check, 100);
      })();
    });
  }
  let spotlightTimer = null;
  async function goTo(key) {
    if (!placeAllowed(key)) return null;
    const place = PLACES[key];
    const route = place.route || (location.hash.startsWith('#/profile') ? location.hash : '#/profile/personal');
    if (location.hash !== route) location.hash = route;
    const target = await waitFor(place.focus || '#portal-main h1');
    if (target) {
      document.querySelectorAll('.va-spotlight').forEach(x => x.classList.remove('va-spotlight'));
      const calm = document.documentElement.dataset.motion === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView?.({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
      target.classList.add('va-spotlight');
      clearTimeout(spotlightTimer); spotlightTimer = setTimeout(() => target.classList.remove('va-spotlight'), 8000);
    }
    return place;
  }
  // On phones the panel covers the page; step aside so the user sees where they are.
  const narrow = () => window.matchMedia?.('(max-width: 640px)').matches === true;
  let history = [], controller = null, identity = null;
  function notice(text) { status.textContent = text; }
  // The natural voice for an answer is made only when someone presses "Nghe", once per text.
  const answerVoices = new Map();
  async function answerVoice(text) {
    if (answerVoices.has(text)) return answerVoices.get(text);
    try {
      const access = await token();
      if (!access) return null;
      const response = await fetch(window.PortalAPI.url + '/functions/v1/gemini-assistant', {
        method: 'POST',
        headers: { apikey: window.PortalAPI.key, authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'speak', text, voice: aiVoiceName() }),
      });
      let data = {}; try { data = await response.json(); } catch { /* handled below */ }
      const audio = response.ok && typeof data.audio?.data === 'string' && /^audio\/[a-z0-9.+-]+$/i.test(String(data.audio.mime)) ? data.audio : null;
      if (audio) { answerVoices.set(text, audio); return audio; }
      notice(data.reason === 'http_429'
        ? 'Hôm nay đã hết lượt tạo giọng AI miễn phí của Gemini (lượt mới có vào khoảng 14–15 giờ chiều), nên tạm đọc bằng giọng của máy.'
        : (data.error || 'Chưa tạo được giọng AI') + ' Tạm đọc bằng giọng của máy.');
    } catch { notice('Chưa kết nối được để tạo giọng AI. Tạm đọc bằng giọng của máy.'); }
    return null;
  }
  function bubble(role, text) {
    const item = el('div', 'va-msg va-' + role);
    item.append(el('strong', 'va-who', role === 'user' ? 'Bạn' : 'Trợ lý'), el('p', '', text));
    if (role === 'model') {
      const listen = el('button', 'va-again', '🔊 Nghe câu trả lời'); listen.type = 'button';
      listen.onclick = async () => {
        unlockVoice(); stopListening();
        if (!aiVoice.checked) { speak(text, listen); return; }
        listen.disabled = true; listen.textContent = 'Đang tạo giọng…';
        const audio = await answerVoice(text);
        listen.disabled = false; listen.textContent = '🔊 Nghe câu trả lời';
        // After hearing the newest answer, keep the conversation going if the user wants that.
        const latest = item === log.querySelector('.va-model:last-of-type');
        setState('speaking');
        speak(text, listen, () => { setState('idle'); if (latest && continuous.checked && Recognition && !panel.hidden && canAsk()) startListening(); }, audio);
      };
      item.append(listen);
    }
    log.append(item); log.scrollTop = log.scrollHeight;
  }
  function greet() {
    log.replaceChildren();
    bubble('model', 'Xin chào. Bạn bấm nút micro rồi nói câu hỏi về cách dùng Cổng công dân. Ví dụ: làm sao để sửa địa chỉ, hay mã xác thực ở đâu. Tôi trả lời xong sẽ nghe tiếp để bạn hỏi thêm.');
  }
  function sync() {
    const next = member() ? 'member:' + (window.PortalAPI?.memberId?.() || '') : citizen() ? 'citizen' : null;
    if (next !== identity) { identity = next; history = []; controller?.abort(); controller = null; stopListening(); setState('idle'); greet(); }
    askBtn.hidden = !next;
    if (!next && !panel.hidden) close();
  }
  function open() { panel.hidden = false; askBtn.setAttribute('aria-expanded', 'true'); host.classList.add('va-open'); }
  function close() { stopListening(); if (state === 'speaking') stopSpeaking(); panel.hidden = true; askBtn.setAttribute('aria-expanded', 'false'); host.classList.remove('va-open'); }
  // One press: open the panel and start listening straight away.
  askBtn.onclick = () => {
    unlockVoice();
    if (panel.hidden) { open(); if (Recognition) startListening(); else input.focus(); return; }
    if (state === 'listening') stopListening(); else if (state !== 'thinking') startListening();
  };
  $('.va-close').onclick = () => { close(); askBtn.focus(); };
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); askBtn.focus(); } });

  async function token() {
    if (member()) { const { data } = await window.PortalAuth.client().auth.getSession(); return data?.session?.access_token; }
    return window.CitizenRepository.citizenAccessToken();
  }
  function afterAnswer(text) {
    // With the AI voice the answer is read only when "Nghe" is pressed, to save Gemini quota.
    if (aiVoice.checked) { setState('idle'); notice('Bấm "🔊 Nghe câu trả lời" để nghe bằng giọng nữ.'); return; }
    // Device voice: read it now, then keep the conversation going if the user wants that.
    const resume = () => { setState('idle'); if (continuous.checked && Recognition && !panel.hidden && canAsk()) startListening(); };
    if (autoRead.checked) { setState('speaking'); speak(text, null, resume); } else setState('idle');
  }
  function deliver(answer, place) {
    if (place) {
      const note = el('p', 'va-nav', '📍 Đã đưa bạn tới: ' + place.label); log.append(note); log.scrollTop = log.scrollHeight;
    }
    bubble('model', answer);
    if (place && narrow() && !panel.hidden) close();
    afterAnswer(answer);
  }
  async function ask(question) {
    question = question.trim();
    if (!question || controller || !canAsk()) return;
    stopSpeaking(); stopListening(); bubble('user', question); input.value = ''; setState('thinking'); notice('');
    const mine = controller = new AbortController(), timer = setTimeout(() => mine.abort(), 65000);
    try {
      const access = await token();
      if (!access) throw new Error('Phiên đăng nhập đã hết. Hãy đăng nhập lại.');
      const response = await fetch(window.PortalAPI.url + '/functions/v1/gemini-assistant', {
        method: 'POST', signal: mine.signal,
        headers: { apikey: window.PortalAPI.key, authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'guide', question, page: heading() || route(), history }),
      });
      let data = {}; try { data = await response.json(); } catch { /* handled below */ }
      if (controller !== mine) return;
      if (!response.ok || typeof data.answer !== 'string') throw new Error(data.error || 'Trợ lý chưa trả lời được. Hãy thử lại.');
      history = [...history, { role: 'user', text: question }, { role: 'model', text: data.answer.slice(0, 3000) }].slice(-6);
      controller = null; clearTimeout(timer);
      const place = typeof data.target === 'string' && data.target !== 'none' ? await goTo(data.target) : null;
      deliver(data.answer, place);
    } catch (error) {
      if (controller !== mine) return;
      controller = null;
      const text = mine.signal.aborted ? 'Trợ lý trả lời quá lâu. Hãy thử lại.' : (error.message || 'Chưa kết nối được trợ lý.');
      // The AI is unavailable: still take the user to the page the question is about.
      const key = matchPlace(question);
      if (key) {
        const place = await goTo(key);
        if (place) { notice(''); deliver('Trợ lý AI chưa trả lời được, nhưng mình đã đưa bạn tới ' + place.label + '. ' + (place.guide || ''), place); return; }
      }
      notice(text); setState('idle');
      if (autoRead.checked) speak(text);
    } finally {
      clearTimeout(timer);
    }
  }
  form.onsubmit = e => { e.preventDefault(); unlockVoice(); ask(input.value); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); unlockVoice(); ask(input.value); } });

  // ---------- Speech input ----------
  let recognizer = null;
  function stopListening() {
    const r = recognizer; recognizer = null;
    if (r) { r.onend = null; try { r.abort(); } catch { /* already stopped */ } }
    if (state === 'listening') setState('idle');
  }
  function startListening() {
    if (!Recognition || state === 'thinking' || !canAsk()) return;
    stopSpeaking(); stopListening();
    const r = recognizer = new Recognition();
    r.lang = 'vi-VN'; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = '';
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    r.onerror = e => {
      notice(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Chưa được phép dùng micro. Hãy cho phép micro trong trình duyệt rồi thử lại.'
        : e.error === 'no-speech' ? 'Chưa nghe thấy gì. Bấm micro để nói lại.' : e.error === 'aborted' ? ''
        : e.error === 'network' ? 'Trình duyệt không kết nối được dịch vụ nhận giọng nói. Hãy gõ câu hỏi, hoặc dùng Chrome hay Edge để nói.'
        : 'Chưa nghe rõ. Bấm micro để nói lại.');
    };
    r.onend = () => {
      if (recognizer !== r) return;
      recognizer = null; setState('idle');
      // Nothing heard: stop here instead of looping.
      if (finalText.trim()) ask(finalText); else if (!status.textContent) notice('Chưa nghe thấy gì. Bấm micro để nói lại.');
    };
    setState('listening'); notice('');
    try { r.start(); } catch { recognizer = null; setState('idle'); }
  }
  if (!Recognition) {
    micBtn.hidden = true;
    $('.va-label').textContent = isBrave ? 'Brave không hỗ trợ nói vào micro. Hãy gõ câu hỏi, hoặc mở web bằng Chrome hay Edge để nói.' : 'Gõ câu hỏi (trình duyệt này chưa nghe được giọng nói, hãy dùng Chrome hoặc Edge)';
    askBtn.innerHTML = '<span aria-hidden="true">💬</span> Hỏi trợ lý';
    continuous.closest('label').hidden = true;
  }
  micBtn.onclick = () => { unlockVoice(); if (state === 'listening') stopListening(); else startListening(); };

  window.addEventListener('hashchange', () => { if (speakingFrom === listenBtn) stopSpeaking(); sync(); });
  window.addEventListener('portalauthchange', sync);
  window.addEventListener('pagehide', () => { stopListening(); stopSpeaking(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopListening(); else sync(); });
  setState('idle');
  sync();
})();
