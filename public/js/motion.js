/* Scroll effects for the home page: reveal on scroll, number counters,
   header shadow and reading progress. Respects "reduce motion". */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.querySelector('.site-header');
  var bar = document.querySelector('.scroll-progress');

  // Header shadow + reading progress, batched into one frame.
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY || window.pageYOffset;
      if (header) header.classList.toggle('is-scrolled', y > 12);
      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (reduce || !('IntersectionObserver' in window)) return;

  // Number counters count up from 0 when they come into view.
  var formatter = new Intl.NumberFormat('en-IN');
  function countUp(el) {
    var target = Number(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    var start = null;
    var duration = 1400;
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + formatter.format(Math.round(target * eased)) + suffix;
      if (p < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }
  var counters = document.querySelectorAll('[data-count]');
  var counterObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      counterObserver.unobserve(entry.target);
      countUp(entry.target);
    });
  }, { threshold: 0.6 });
  counters.forEach(function (el) { counterObserver.observe(el); });

  // Reveal on scroll. Only elements below the screen at load start hidden,
  // so the first view is always complete.
  var selector = [
    '.section-head', '.cards > .card', '.features > .feature', '.bring', '.steps > li',
    '.two-col > div', '.book-intro', '.book-form', '#faq details', '.contact-grid > a',
    '.map-card', '.stats-grid > .stat-item', '.about-grid > *'
  ].join(',');
  var fold = window.innerHeight;
  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      revealObserver.unobserve(el);
      el.classList.remove('reveal-pending');
      // Hand control back to the normal hover transitions once it has played.
      window.setTimeout(function () { el.classList.remove('reveal'); }, 1300);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  document.querySelectorAll(selector).forEach(function (el) {
    if (el.getBoundingClientRect().top < fold) return;
    var siblings = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
    el.style.setProperty('--i', String(Math.min(siblings, 5)));
    el.classList.add('reveal', 'reveal-pending');
    revealObserver.observe(el);
  });

  // Safety net: never leave content hidden.
  window.setTimeout(function () {
    document.querySelectorAll('.reveal-pending').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.remove('reveal-pending');
    });
  }, 2500);
})();
