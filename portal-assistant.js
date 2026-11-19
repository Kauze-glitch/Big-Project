'use strict';
// Voice help for the citizen portal: scripted read-aloud guidance for everyone,
// plus a Gemini question box (speech in, speech out) for signed-in users.
(() => {
  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };

  const host = el('div', 'va-dock');
  host.innerHTML = `
    <section class="va-panel" id="va-panel" aria-labelledby="va-title" hidden>
      <header class="va-head"><strong id="va-title">Trợ lý Cổng công dân</strong><button type="button" class="va-close" aria-label="Đóng trợ lý">×</button></header>
      <div class="va-log" role="log" aria-live="polite" aria-label="Hội thoại với trợ lý"></div>
      <p class="va-status" role="status"></p>
      <form class="va-form">
        <button type="button" class="va-mic" aria-pressed="false"><span aria-hidden="true">🎙</span> Bấm để nói</button>
        <label class="va-label" for="va-question">Hoặc gõ câu hỏi</label>
        <div class="va-row"><textarea id="va-question" rows="2" maxlength="1000" placeholder="Ví dụ: Làm sao để sửa địa chỉ?"></textarea><button type="submit" class="va-send">Gửi</button></div>
        <label class="va-auto"><input type="checkbox" checked> Tự đọc to câu trả lời</label>
      </form>
      <small class="va-note">Không nói mật khẩu, mã OTP hay số căn cước. Câu hỏi được gửi tới Google Gemini; trợ lý có thể nhầm.</small>
    </section>
    <div class="va-buttons">
      <button type="button" class="va-listen" aria-pressed="false"><span aria-hidden="true">🔊</span> <span class="va-listen-text">Nghe hướng dẫn</span></button>
      <button type="button" class="va-ask" aria-controls="va-panel" aria-expanded="false" hidden><span aria-hidden="true">💬</span> Hỏi trợ lý</button>
    </div>`;
  document.body.append(host);
  const $ = s => host.querySelector(s);
  const panel = $('.va-panel'), log = $('.va-log'), status = $('.va-status'), form = $('.va-form'), input = $('#va-question');
  const listenBtn = $('.va-listen'), askBtn = $('.va-ask'), micBtn = $('.va-mic'), sendBtn = $('.va-send'), autoRead = $('.va-auto input');

  // ---------- Speech output ----------
  let speakingFrom = null, warnedVoice = false;
  const vietnameseVoice = () => synth?.getVoices().find(v => /^vi\b|^vi[-_]/i.test(v.lang)) || null;
  function stopSpeaking() {
    synth?.cancel();
    if (speakingFrom) speakingFrom.setAttribute('aria-pressed', 'false');
    speakingFrom = null;
    listenBtn.querySelector('.va-listen-text').textContent = 'Nghe hướng dẫn';
  }
  function speak(text, from) {
    if (!synth) { notice('Trình duyệt này chưa hỗ trợ đọc to. Hãy dùng Chrome, Edge hoặc Safari.'); return; }
    stopSpeaking();
    const voice = vietnameseVoice();
    if (!voice && !warnedVoice) { warnedVoice = true; notice('Máy chưa có giọng đọc tiếng Việt nên có thể đọc không rõ. Hãy cài giọng tiếng Việt trong phần cài đặt giọng nói của máy.'); }
    // Short utterances avoid browsers cutting off long speech.
    const parts = String(text).replace(/\s+/g, ' ').match(/[^.!?:;\n]+[.!?:;]?/g) || [];
    speakingFrom = from || null;
    if (from) from.setAttribute('aria-pressed', 'true');
    if (from === listenBtn) listenBtn.querySelector('.va-listen-text').textContent = 'Dừng đọc';
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.lang = 'vi-VN'; u.rate = 0.9; if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = () => { if (speakingFrom === from) stopSpeaking(); };
      synth.speak(u);
    });
  }
  if (synth) synth.onvoiceschanged = () => {};

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
  function guideText() {
    const r = route(), parts = [];
    const title = heading();
    if (r === '/login' || r === '' || r === '/') {
      if (document.getElementById('otp-form')) parts.push('Bạn đang ở bước nhập mã xác thực. Mở ứng dụng Telegram trên điện thoại để xem mã gồm 6 chữ số. Nhập 6 chữ số đó vào ô Mã xác thực rồi bấm nút Xác thực và truy cập. Nếu mã hết hạn, chờ hết thời gian rồi bấm Cấp mã mới.');
      else if (document.getElementById('member-login')) parts.push('Đây là phần đăng nhập dành cho thành viên dự án. Nếu bạn là công dân, hãy bấm thẻ Công dân ở phía trên.');
      else if (document.getElementById('citizen-login')) parts.push('Chào bạn. Đây là trang đăng nhập Cổng công dân. Bước 1: nhập số căn cước công dân gồm 12 chữ số vào ô đầu tiên. Bước 2: nhập mật khẩu mà cán bộ đã cấp cho bạn. Bước 3: bấm nút Tiếp tục. Sau đó bạn sẽ nhận mã xác thực qua Telegram. Nếu quên mật khẩu, hãy liên hệ thành viên phụ trách.');
      else parts.push(title ? 'Bạn đang ở trang ' + title + '.' : 'Bạn đang ở Cổng công dân.');
    } else if (r.startsWith('/profile')) {
      const page = r.split('/')[2] || 'personal';
      parts.push((title ? 'Bạn đang ở trang ' + title + '. ' : '') + (profileGuides[page] || profileGuides.personal));
      parts.push('Danh sách các trang nằm ở cột bên trái, hoặc nút menu ở đầu trang trên điện thoại. Khi dùng xong, hãy bấm Đăng xuất.');
    } else {
      parts.push((title ? 'Bạn đang ở trang ' + title + '. ' : '') + 'Đây là khu vực quản lý dành cho thành viên dự án.');
    }
    const alerts = [...document.querySelectorAll('#portal-app [role=alert], dialog[open] [role=alert]')].map(a => a.textContent.trim()).filter(Boolean);
    if (alerts.length) parts.push('Có thông báo: ' + alerts.join('. '));
    if (canAsk()) parts.push('Nếu cần hỏi thêm, hãy bấm nút Hỏi trợ lý ở góc dưới màn hình rồi nói câu hỏi của bạn.');
    return parts.join(' ');
  }
  listenBtn.onclick = () => { if (speakingFrom === listenBtn) stopSpeaking(); else speak(guideText(), listenBtn); };

  // ---------- Gemini question box ----------
  const member = () => window.PortalAuth?.isMember() === true;
  const citizen = () => window.CitizenRepository?.hasCitizenSession?.() === true;
  const canAsk = () => member() || citizen();
  let history = [], controller = null, identity = null;
  function notice(text) { status.textContent = text; }
  function bubble(role, text) {
    const item = el('div', 'va-msg va-' + role);
    item.append(el('strong', 'va-who', role === 'user' ? 'Bạn' : 'Trợ lý'), el('p', '', text));
    if (role === 'model') {
      const again = el('button', 'va-again', '🔊 Đọc lại'); again.type = 'button';
      again.onclick = () => speak(text, again);
      item.append(again);
    }
    log.append(item); log.scrollTop = log.scrollHeight;
  }
  function greet() {
    log.replaceChildren();
    bubble('model', 'Xin chào. Bạn hãy bấm nút Bấm để nói và hỏi tôi cách dùng Cổng công dân. Ví dụ: làm sao để sửa địa chỉ, hay mã xác thực ở đâu.');
  }
  function sync() {
    const next = member() ? 'member:' + (window.PortalAPI?.memberId?.() || '') : citizen() ? 'citizen' : null;
    if (next !== identity) { identity = next; history = []; controller?.abort(); controller = null; greet(); }
    askBtn.hidden = !next;
    if (!next && !panel.hidden) close();
  }
  function open() { panel.hidden = false; askBtn.setAttribute('aria-expanded', 'true'); host.classList.add('va-open'); micBtn.focus(); }
  function close() { stopListening(); panel.hidden = true; askBtn.setAttribute('aria-expanded', 'false'); host.classList.remove('va-open'); }
  askBtn.onclick = () => panel.hidden ? open() : close();
  $('.va-close').onclick = () => { close(); askBtn.focus(); };
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); askBtn.focus(); } });

  async function token() {
    if (member()) { const { data } = await window.PortalAuth.client().auth.getSession(); return data?.session?.access_token; }
    return window.CitizenRepository.citizenAccessToken();
  }
  function busy(on) { sendBtn.disabled = on; micBtn.disabled = on; input.disabled = on; }
  async function ask(question) {
    question = question.trim();
    if (!question || controller || !canAsk()) return;
    stopSpeaking(); bubble('user', question); input.value = ''; busy(true); notice('Trợ lý đang trả lời…');
    const mine = controller = new AbortController(), timer = setTimeout(() => mine.abort(), 45000);
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
      bubble('model', data.answer); notice('');
      if (autoRead.checked) speak(data.answer);
    } catch (error) {
      if (controller !== mine) return;
      const text = mine.signal.aborted ? 'Trợ lý trả lời quá lâu. Hãy thử lại.' : (error.message || 'Chưa kết nối được trợ lý.');
      notice(text); if (autoRead.checked) speak(text);
    } finally {
      clearTimeout(timer); if (controller === mine) { controller = null; busy(false); }
    }
  }
  form.onsubmit = e => { e.preventDefault(); ask(input.value); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });

  // ---------- Speech input ----------
  let recognizer = null;
  function stopListening() { recognizer?.abort(); recognizer = null; micBtn.setAttribute('aria-pressed', 'false'); micBtn.innerHTML = '<span aria-hidden="true">🎙</span> Bấm để nói'; }
  if (!Recognition) {
    micBtn.hidden = true;
    $('.va-label').textContent = 'Gõ câu hỏi (trình duyệt này chưa nghe được giọng nói, hãy dùng Chrome hoặc Edge)';
  } else micBtn.onclick = () => {
    if (recognizer) { stopListening(); return; }
    stopSpeaking();
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
        : e.error === 'no-speech' ? 'Chưa nghe thấy gì. Hãy bấm và nói lại.' : 'Chưa nghe rõ. Hãy thử lại.');
    };
    r.onend = () => { if (recognizer !== r) return; stopListening(); if (finalText.trim()) ask(finalText); };
    micBtn.setAttribute('aria-pressed', 'true'); micBtn.innerHTML = '<span aria-hidden="true">■</span> Đang nghe… bấm để dừng'; notice('Mời bạn nói.');
    try { r.start(); } catch { stopListening(); }
  };

  window.addEventListener('hashchange', () => { stopSpeaking(); sync(); });
  window.addEventListener('portalauthchange', sync);
  window.addEventListener('pagehide', stopSpeaking);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  sync();
})();
