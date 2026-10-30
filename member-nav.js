'use strict';
(() => {
  const actions = document.querySelector('.header-actions');
  if (!actions || !window.GocViet) return;
  const link = document.createElement('a');
  link.href = 'database.html'; link.className = 'btn btn-quiet'; link.textContent = 'Sơ đồ database'; link.hidden = true;
  actions.prepend(link);
  const render = () => { link.hidden = !window.GocViet.isMember(); };
  window.addEventListener('authchange',render);
  window.addEventListener('sectionsloaded',render);
  render();
})();
