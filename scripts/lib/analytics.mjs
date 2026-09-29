// Reader analytics (Google Analytics 4), injected into the built HTML only when NUVELLUM_GA4_ID is configured.
//
// - Consent first: nothing from Google loads, and no cookie is set, until the reader chooses "Allow" in a small
//   notice. The choice is remembered in this browser only; "No thanks" is remembered too. The privacy page's
//   "Analytics settings" button reopens the notice. NUVELLUM_ANALYTICS_CONSENT=implied skips the notice (only for
//   jurisdictions where the owner has decided consent is not required).
// - One page_view per page, sent by this script (gtag's automatic page_view is off), with a page_type
//   (home, article, section, latest, world_explorer, world, country, author, page, not_found).
// - Events: scroll_depth, article_click, save_story, outbound_click (domain only), and sign_up when a Brief
//   sign-up actually succeeds (the form dispatches `nuvellum:brief-signup`). No email address, name, search
//   text or query string is ever sent; only utm_* campaign parameters are kept in page_location.
// - Never on /admin or /brief/* (see instrument-analytics.mjs), and a page can never initialise it twice.
const GA4_RE = /^G-[A-Z0-9]+$/i;
export const CONSENT_KEY = 'nuvellum-analytics-consent';
/** Built files (relative to dist/) that never receive analytics. */
export const EXCLUDED = [/^admin[\\/]/, /^brief[\\/]/];

export function validGa4Id(value) {
  const id = String(value || '').trim();
  return GA4_RE.test(id) ? id.toUpperCase() : '';
}

/** page_type for a site path (mirrors the snippet's in-browser classifier; exported for tests). */
export function pageType(path, title = '') {
  const p = String(path || '/').replace(/\/index\.html$/, '/') || '/';
  if (/not found/i.test(title)) return 'not_found';
  if (p === '/') return 'home';
  if (p.startsWith('/article/')) return 'article';
  if (p.startsWith('/section/')) return 'section';
  if (p === '/latest' || p.startsWith('/latest/')) return 'latest';
  if (p === '/world-explorer' || p.startsWith('/world-explorer/')) return 'world_explorer';
  if (p.startsWith('/world/')) return 'world';
  if (p.startsWith('/country/')) return 'country';
  if (p.startsWith('/author/')) return 'author';
  return 'page';
}

const CONSENT_CSS = `#nv-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;display:grid;grid-template-columns:1fr auto;gap:10px 16px;align-items:center;padding:14px 16px;background:#161213;color:#efe6da;border-top:2px solid #8a1b36;box-shadow:0 10px 30px rgba(0,0,0,.28);font:14px/1.45 Georgia,'Times New Roman',serif}#nv-consent p{margin:0}#nv-consent a{color:#fff;text-decoration:underline;text-underline-offset:2px}#nv-consent .nv-c-actions{display:flex;gap:8px}#nv-consent button{font:inherit;font-size:13px;min-height:36px;padding:0 14px;border:1px solid rgba(239,230,218,.55);background:transparent;color:#efe6da;cursor:pointer}#nv-consent button.nv-c-yes{background:#efe6da;color:#161213;border-color:#efe6da}#nv-consent button:focus-visible{outline:2px solid #fff;outline-offset:2px}@media(max-width:520px){#nv-consent{grid-template-columns:1fr;left:10px;right:10px;bottom:10px}#nv-consent .nv-c-actions{justify-content:flex-end}}@media print{#nv-consent{display:none}}`;

// The in-browser page classifier is generated from pageType() so the two can never drift apart.
const PAGE_TYPE_JS = `(${pageType.toString()})(location.pathname, document.title)`;

export function analyticsSnippet(measurementId, { consent = 'required' } = {}) {
  const id = validGa4Id(measurementId);
  if (!id) return '';
  const implied = consent === 'implied';

  return `<!-- Nuvellum analytics: enabled only when NUVELLUM_GA4_ID is configured -->
<script id="nuvellum-analytics">
(() => {
  if (window.__nuvellumAnalytics) return;
  window.__nuvellumAnalytics = true;
  const MEASUREMENT_ID = ${JSON.stringify(id)};
  const KEY = ${JSON.stringify(CONSENT_KEY)};
  const IMPLIED = ${implied ? 'true' : 'false'};
  const store = { get() { try { return localStorage.getItem(KEY); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, v); } catch {} } };
  const pageType = ${PAGE_TYPE_JS};
  // Only campaign tags survive into page_location; any other query string is dropped.
  const utm = new URLSearchParams([...new URLSearchParams(location.search)].filter(([k]) => /^utm_(source|medium|campaign|term|content|id)$/.test(k))).toString();

  let started = false;
  function start() {
    if (started) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    window.gtag = window.gtag || gtag;
    gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(s);

    const send = (name, params = {}) => { try { gtag('event', name, { page_type: pageType, ...params }); } catch {} };
    send('page_view', { page_location: location.origin + location.pathname + (utm ? '?' + utm : ''), page_path: location.pathname, page_title: document.title });

    const seen = new Set();
    const onScroll = () => {
      const doc = document.documentElement;
      const pct = Math.min(100, Math.round((scrollY / Math.max(1, doc.scrollHeight - innerHeight)) * 100));
      for (const mark of [25, 50, 75, 90]) if (pct >= mark && !seen.has(mark)) { seen.add(mark); send('scroll_depth', { percent_scrolled: mark, page_path: location.pathname }); }
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    addEventListener('click', (event) => {
      const el = event.target instanceof Element ? event.target.closest('a,button') : null;
      if (!el) return;
      const save = el.closest('[data-save]');
      if (save) { send('save_story', { story_title: String(save.getAttribute('data-save') || '').slice(0, 120), page_path: location.pathname }); return; }
      if (el.tagName !== 'A') return;
      const href = el.getAttribute('href');
      if (!href) return;
      try {
        const url = new URL(href, location.href);
        if (url.origin === location.origin && url.pathname.startsWith('/article/')) send('article_click', { destination_path: url.pathname, page_path: location.pathname });
        else if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) send('outbound_click', { link_domain: url.hostname, page_path: location.pathname });
      } catch {}
    }, { passive: true });

    // Dispatched by the Brief form only after the server confirms the sign-up.
    addEventListener('nuvellum:brief-signup', (e) => send('sign_up', { method: 'nuvellum_brief', signup_source: String(e.detail?.source || '').slice(0, 40), page_path: location.pathname }));
  }

  function notice() {
    if (document.getElementById('nv-consent')) return;
    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(CONSENT_CSS)};
    const box = document.createElement('div');
    box.id = 'nv-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Analytics choice');
    box.innerHTML = '<p>Nuvellum would like to count visits with Google Analytics to learn what readers find useful. No advertising, no personal profile. <a href="/privacy#reader-analytics">Privacy</a></p><div class="nv-c-actions"><button type="button" class="nv-c-no">No thanks</button><button type="button" class="nv-c-yes">Allow</button></div>';
    const close = (v) => { store.set(v); box.remove(); style.remove(); if (v === 'granted') start(); };
    box.querySelector('.nv-c-yes').addEventListener('click', () => close('granted'));
    box.querySelector('.nv-c-no').addEventListener('click', () => close('denied'));
    document.head.appendChild(style);
    document.body.appendChild(box);
  }

  const choice = store.get();
  if (IMPLIED || choice === 'granted') start();
  else if (choice !== 'denied') {
    if (document.body) notice(); else addEventListener('DOMContentLoaded', notice, { once: true });
  }
  // "Analytics settings" on the privacy page: forget the choice and ask again.
  addEventListener('click', (e) => {
    const b = e.target instanceof Element ? e.target.closest('[data-analytics-settings]') : null;
    if (!b) return;
    try { localStorage.removeItem(KEY); } catch {}
    if (started) { location.reload(); return; }
    notice();
  });
  const reveal = () => { for (const b of document.querySelectorAll('[data-analytics-settings]')) b.hidden = IMPLIED; };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', reveal, { once: true }); else reveal();
})();
</script>`;
}

export function injectAnalytics(html, measurementId, options) {
  const snippet = analyticsSnippet(measurementId, options);
  if (!snippet) return String(html);
  const source = String(html);
  if (source.includes('id="nuvellum-analytics"')) return source;
  if (!source.includes('</head>')) throw new Error('Cannot inject analytics: </head> is missing');
  return source.replace('</head>', `${snippet}\n</head>`);
}
