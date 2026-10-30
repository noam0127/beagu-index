/* One canonical respondent URL. Never use the administrator URL here. */
window.BeaguConfig = Object.freeze({surveyUrl:'https://docs.google.com/forms/d/e/1FAIpQLSf3fY3b4amMyIpBLpU4tK69Bf3ZNVQ2r7eH2vBUUn0gxz7lYQ/viewform'});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-survey-link]').forEach(a => {
    a.href = BeaguConfig.surveyUrl;
    a.target = '_blank'; a.rel = 'noopener noreferrer';
  });
});
