/* GSAP 3.15.0 + ScrollTrigger; native scrolling, overview scenes only. */
(function () {
  'use strict';
  const main = document.querySelector('main');
  if (!main) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  const toggle = document.getElementById('scrollMotionToggle');
  let enabled = true, frame = 0, scenes = [], disposed = false;
  try { enabled = localStorage.getItem('jianzhang-scroll-motion') !== 'off'; } catch (_) {}
  if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  function clear() {
    scenes.forEach(({ timeline, layer }) => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
      layer.style.removeProperty('opacity');
    });
    scenes = [];
  }
  function prepare() {
    const overview = main.querySelector('[data-screen="overview"]');
    if (!overview) return null;
    const hero = overview.querySelector('.cards .card:first-child');
    if (hero && !hero.querySelector('.summary-motion-layer')) {
      const layer = document.createElement('div');
      layer.className = 'summary-motion-layer';
      while (hero.firstChild) layer.append(hero.firstChild);
      hero.append(layer);
    }
    const category = overview.querySelector('.category-panel');
    if (category && !category.querySelector('.category-intro')) {
      const intro = document.createElement('div');
      intro.className = 'category-intro';
      const heading = category.querySelector('h2'), ring = category.querySelector('.ring-layout');
      if (heading) intro.append(heading);
      if (ring) intro.append(ring);
      category.prepend(intro);
    }
    return overview;
  }
  function reconcile() {
    frame = 0;
    const overview = prepare();
    const active = overview?.classList.contains('active');
    const canAnimate = !disposed && enabled && !reduced.matches && gsap && ScrollTrigger && active && !document.body.classList.contains('booting');
    document.documentElement.dataset.scrollMotion = canAnimate ? 'gsap-v4' : 'off';
    document.documentElement.dataset.uiVersion = 'refined-v4';
    const hint = document.getElementById('scrollMotionHint');
    if (hint) hint.textContent = reduced.matches ? '已遵循手机的减少动态效果设置。' : !enabled ? '已关闭，内容直接显示。' : !gsap || !ScrollTrigger ? '动画未加载，内容直接显示。' : '概览重点区域随滚动渐入渐出，账单与日历保持清晰。';
    if (!canAnimate) { clear(); return; }
    if (!scenes.length) {
      try {
        const hero = overview.querySelector('.cards .card:first-child');
        const heroLayer = hero?.querySelector('.summary-motion-layer');
        if (heroLayer) {
          // Above-the-fold amount is fully visible; fade only as it leaves the reading area.
          const timeline = gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top+=100', end: 'bottom top+=100', scrub: true, invalidateOnRefresh: true } });
          timeline.fromTo(heroLayer, { opacity: 1 }, { opacity: 0, ease: 'none', immediateRender: false });
          scenes.push({ timeline, layer: heroLayer });
        }
        const intro = overview.querySelector('.category-intro');
        if (intro) {
          const timeline = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: intro, start: 'top 92%', end: 'bottom top+=100', scrub: true, invalidateOnRefresh: true } });
          timeline.fromTo(intro, { opacity: 0 }, { opacity: 1, duration: 0.18, immediateRender: false })
            .to(intro, { opacity: 1, duration: 0.64 })
            .to(intro, { opacity: 0, duration: 0.18 });
          scenes.push({ timeline, layer: intro });
        }
      } catch (_) { clear(); document.documentElement.dataset.scrollMotion = 'off'; return; }
    }
    // Data/filter redraws change heights. Never refresh on each scroll event.
    ScrollTrigger.refresh();
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(reconcile); }
  if (toggle) {
    toggle.checked = enabled;
    toggle.onchange = () => {
      enabled = toggle.checked;
      try { localStorage.setItem('jianzhang-scroll-motion', enabled ? 'on' : 'off'); } catch (_) {}
      schedule();
    };
  }
  reduced.addEventListener?.('change', schedule);
  document.addEventListener('ledger:render', schedule);
  document.addEventListener('ledger:screen', schedule);
  main.addEventListener('toggle', schedule, true);
  window.addEventListener('pageshow', () => { disposed = false; schedule(); });
  window.addEventListener('pagehide', () => { disposed = true; cancelAnimationFrame(frame); frame = 0; clear(); });
  document.fonts?.ready.then(schedule);
  schedule();
})();
