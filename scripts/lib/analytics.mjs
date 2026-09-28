const GA4_RE = /^G-[A-Z0-9]+$/i;

export function validGa4Id(value) {
  const id = String(value || '').trim();
  return GA4_RE.test(id) ? id.toUpperCase() : '';
}

export function analyticsSnippet(measurementId) {
  const id = validGa4Id(measurementId);
  if (!id) return '';

  const safeId = JSON.stringify(id);
  return `<!-- Nuvellum analytics: enabled only when NUVELLUM_GA4_ID is configured -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script id="nuvellum-analytics">
(() => {
  const MEASUREMENT_ID = ${safeId};
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true
  });

  const send = (name, params = {}) => {
    try { gtag('event', name, params); } catch {}
  };

  send('page_view', {
    page_location: location.origin + location.pathname,
    page_path: location.pathname,
    page_title: document.title
  });

  const seenDepths = new Set();
  const depthMarks = [25, 50, 75, 90];
  const onScroll = () => {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - innerHeight);
    const pct = Math.min(100, Math.round((scrollY / max) * 100));
    for (const mark of depthMarks) {
      if (pct >= mark && !seenDepths.has(mark)) {
        seenDepths.add(mark);
        send('scroll_depth', { percent_scrolled: mark, page_path: location.pathname });
      }
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('a,button') : null;
    if (!el) return;

    const save = el.closest('[data-save]');
    if (save) {
      send('save_story', {
        story_title: String(save.getAttribute('data-save') || '').slice(0, 120),
        page_path: location.pathname
      });
      return;
    }

    if (el.closest('#newsletter')) {
      send('newsletter_interaction', { page_path: location.pathname });
    }

    if (el.tagName !== 'A') return;
    const href = el.getAttribute('href');
    if (!href) return;

    try {
      const url = new URL(href, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/article/')) {
        send('article_click', { destination_path: url.pathname, page_path: location.pathname });
      } else if (url.origin !== location.origin && /^https?:$/.test(url.protocol)) {
        send('outbound_click', { link_domain: url.hostname, page_path: location.pathname });
      }
    } catch {}
  }, { passive: true });
})();
</script>`;
}

export function injectAnalytics(html, measurementId) {
  const snippet = analyticsSnippet(measurementId);
  if (!snippet) return String(html);
  const source = String(html);
  if (source.includes('id="nuvellum-analytics"')) return source;
  if (!source.includes('</head>')) throw new Error('Cannot inject analytics: </head> is missing');
  return source.replace('</head>', `${snippet}\n</head>`);
}
