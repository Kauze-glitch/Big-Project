'use strict';
(() => {
  // Reuse the report's Supabase session; a citizen demo session grants no member access.
  const db = window.supabase?.createClient('https://grhdawkxnrkgkahegnnd.supabase.co', 'sb_publishable_on_xEc5Um_pRV-ZZhPIgLw_7vSL6iHK');
  let member = false, status = 'checking', revision = 0, timer, verifiedUser = null;
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
      const result = await Promise.race([
        (async () => {
          // Validate with Auth, not user metadata or a user ID read from localStorage.
          const {data, error} = await db.auth.getUser();
          if (error || !data?.user) return {allowed:false,userId:null};
          const result = await db.from('sections').select('owner_id').in('slug', ['phan1', 'phan2', 'phan3']).eq('owner_id', data.user.id).abortSignal(controller.signal);
          if (result.error) throw result.error;
          return {allowed:!!result.data?.some(row => row.owner_id === data.user.id),userId:data.user.id};
        })(),
        new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 10000); })
      ]);
      if (current === revision) { verifiedUser = result.allowed ? result.userId : null; publish(result.allowed, 'ready'); }
    } catch (_) {
      if (current === revision) { verifiedUser = null; publish(false, 'unavailable'); }
    } finally { clearTimeout(timeout); }
    return current === revision && member;
  }
  window.PortalAuth = Object.freeze({isMember: () => member, status: () => status, refresh, client: () => db, userId: () => verifiedUser});
  if (db) db.auth.onAuthStateChange((event, session) => {
    // Keep Auth calls outside its callback lock and reject stale in-flight results.
    ++revision;
    clearTimeout(timer);
    if (event === 'SIGNED_OUT') { verifiedUser = null; publish(false, 'ready'); return; }
    // Refreshing the same verified account must not close an unsaved form.
    // Every event still validates Auth and membership; an account change revokes immediately.
    if (!member || session?.user?.id !== verifiedUser) { verifiedUser = null; publish(false, 'checking'); }
    timer = setTimeout(refresh, 0);
  });
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
})();
