(() => {
  'use strict';
  const responsesNode = document.querySelector('[data-cumulative="responses"]');
  const schoolsNode = document.querySelector('[data-cumulative="schools"]');
  if (!responsesNode || !schoolsNode) return;
  let inFlight = false;
  async function refreshCumulativeCounts() {
    if (inFlight || document.visibilityState === 'hidden') return;
    inFlight = true;
    try {
      if (typeof supabaseClient === 'undefined') return;
      const { data, error } = await supabaseClient
        .from('beagu_home_cumulative_stats')
        .select('total_responses,total_schools')
        .eq('id', 1)
        .single();
      if (error || !data) return;
      const responses = Number(data.total_responses);
      const schools = Number(data.total_schools);
      if (!Number.isSafeInteger(responses) || responses < 18797 ||
          !Number.isSafeInteger(schools) || schools < 4177 ||
          schools - 4177 > responses - 18797) return;
      responsesNode.textContent = responses.toLocaleString('ko-KR');
      schoolsNode.textContent = schools.toLocaleString('ko-KR');
    } catch (_) {
      // Keep the last verified total instead of displaying a fabricated zero.
    } finally {
      inFlight = false;
    }
  }
  refreshCumulativeCounts();
  window.addEventListener('pageshow', refreshCumulativeCounts);
  document.addEventListener('visibilitychange', refreshCumulativeCounts);
  window.setInterval(refreshCumulativeCounts, 30000);
})();