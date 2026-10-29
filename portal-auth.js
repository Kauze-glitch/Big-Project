'use strict';
(() => {
  // Reuse the report's Supabase session; a citizen demo session grants no member access.
  const db = window.supabase?.createClient('https://grhdawkxnrkgkahegnnd.supabase.co', 'sb_publishable_on_xEc5Um_pRV-ZZhPIgLw_7vSL6iHK');
  let member = false, status = 'checking', revision = 0, timer;
  function publish(nextMember, nextStatus) {
    const changed = member !== nextMember || status !== nextStatus;
    member = nextMember; status = nextStatus;
    if (changed) window.dispatchEvent(new Event('portalauthchange'));
  }
  async function refresh() {
    const current = ++revision;
    if (!db) { publish(false, 'unavailable'); return false; }
    let timeout;
    const controller = new AbortController();
    try {
      const allowed = await Promise.race([
        (async () => {
          // Validate with Auth, not user metadata or a user ID read from localStorage.
          const {data, error} = await db.auth.getUser();
          if (error || !data?.user) return false;
          const result = await db.from('sections').select('owner_id').in('slug', ['phan1', 'phan2', 'phan3']).eq('owner_id', data.user.id).abortSignal(controller.signal);
          if (result.error) throw result.error;
          return !!result.data?.some(row => row.owner_id === data.user.id);
        })(),
        new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10000); })
      ]);
      if (current === revision) publish(allowed, 'ready');
    } catch (_) {
      if (current === revision) publish(false, 'unavailable');
    } finally { clearTimeout(timeout); }
    return current === revision && member;
  }
  window.PortalAuth = Object.freeze({isMember: () => member, status: () => status, refresh});
  if (db) db.auth.onAuthStateChange((event) => {
    // Keep Auth calls outside its callback lock and reject stale in-flight results.
    ++revision;
    clearTimeout(timer);
    if (event === 'SIGNED_OUT') { publish(false, 'ready'); return; }
    publish(false, 'checking');
    timer = setTimeout(refresh, 0);
  });
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();
