export const REGIONS = Object.freeze([
  {
    slug: 'north-america',
    label: 'North America',
    keywords: ['north america','united states','u.s.','canada','canadian','greenland']
  },
  {
    slug: 'latin-america-caribbean',
    label: 'Latin America & Caribbean',
    keywords: ['latin america','caribbean','mexico','mexican','brazil','brazilian','argentina','argentine','chile','chilean','colombia','colombian','peru','peruvian','venezuela','ecuador','bolivia','paraguay','uruguay','cuba','cuban','haiti','dominican republic','jamaica','panama','costa rica','guatemala','honduras','el salvador','nicaragua','belize','bahamas','puerto rico','trinidad']
  },
  {
    slug: 'europe-central-asia',
    label: 'Europe & Central Asia',
    keywords: ['europe','european','european union','united kingdom','britain','british','england','english','scotland','scottish','wales','welsh','france','french','germany','german','spain','spanish','italy','italian','switzerland','swiss','austria','belgium','netherlands','dutch','poland','polish','ukraine','ukrainian','russia','russian','romania','greece','greek','sweden','norway','finland','denmark','ireland','portugal','serbia','croatia','czech','slovakia','hungary','belarus','moldova','kazakhstan','kyrgyzstan','tajikistan','turkmenistan','uzbekistan']
  },
  {
    slug: 'middle-east-north-africa',
    label: 'Middle East & North Africa',
    keywords: ['middle east','north africa','mena','egypt','egyptian','gaza','palestine','palestinian','israel','israeli','lebanon','lebanese','syria','syrian','jordan','jordanian','iraq','iraqi','iran','iranian','saudi arabia','saudi','united arab emirates','emirati','uae','qatar','qatari','kuwait','kuwaiti','oman','omani','yemen','yemeni','turkey','turkish','morocco','moroccan','algeria','algerian','tunisia','tunisian','libya','libyan','sudan','sudanese']
  },
  {
    slug: 'sub-saharan-africa',
    label: 'Sub-Saharan Africa',
    keywords: ['sub-saharan africa','south africa','south african','nigeria','nigerian','kenya','kenyan','ethiopia','ethiopian','ghana','ghanaian','uganda','ugandan','tanzania','tanzanian','congo','congolese','rwanda','rwandan','senegal','senegalese','somalia','somali','mozambique','zimbabwe','zambia','botswana','namibia','angola','cameroon','ivory coast','côte d’ivoire','cote d ivoire','mali','niger','burkina faso','madagascar']
  },
  {
    slug: 'south-asia',
    label: 'South Asia',
    keywords: ['south asia','india','indian','pakistan','pakistani','bangladesh','bangladeshi','sri lanka','sri lankan','nepal','nepalese','bhutan','bhutanese','afghanistan','afghan']
  },
  {
    slug: 'east-asia',
    label: 'East Asia',
    keywords: ['east asia','china','chinese','japan','japanese','south korea','north korea','korean','taiwan','taiwanese','mongolia','mongolian','hong kong','macau']
  },
  {
    slug: 'southeast-asia-oceania',
    label: 'Southeast Asia & Oceania',
    keywords: ['southeast asia','south-east asia','asean','australia','australian','new zealand','indonesia','indonesian','philippines','philippine','filipino','vietnam','vietnamese','thailand','thai','malaysia','malaysian','singapore','singaporean','myanmar','burma','cambodia','cambodian','laos','laotian','brunei','timor-leste','papua new guinea','pacific islands','oceania']
  }
]);

const BY_SLUG = new Map(REGIONS.map(region => [region.slug, region]));
const LABEL_TO_SLUG = new Map(REGIONS.map(region => [region.label.toLowerCase(), region.slug]));

function normalized(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function explicitRegionSlugs(article) {
  const raw = Array.isArray(article?.regions) ? article.regions : article?.region ? [article.region] : [];
  return raw.map(value => {
    const key = normalized(value).trim();
    return BY_SLUG.has(key) ? key : LABEL_TO_SLUG.get(key);
  }).filter(Boolean);
}

function containsKeyword(text, keyword) {
  const k = normalized(keyword);
  if (!k) return false;
  const escaped = k.replace(/[.*+?^\$\{\}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i').test(text);
}

export function regionsForArticle(article) {
  const explicit = explicitRegionSlugs(article);
  if (explicit.length) return [...new Set(explicit)];

  // Existing automated World stories predate explicit geographic metadata, so
  // infer them conservatively. Other sections must provide regions/countries
  // explicitly; this prevents titles such as "Pirates of the Caribbean" from
  // being mistaken for geographic reporting.
  const countries = Array.isArray(article?.countries) ? article.countries : [];
  if (countries.length) {
    const countryText = normalized(countries.join(' '));
    return [...new Set(REGIONS
      .filter(region => region.keywords.some(keyword => containsKeyword(countryText, keyword)))
      .map(region => region.slug))];
  }

  if (normalized(article?.section).trim() !== 'world') return [];

  const text = normalized([
    article?.title,
    article?.dek,
    ...(Array.isArray(article?.tags) ? article.tags : [])
  ].filter(Boolean).join(' '));

  const matches = REGIONS
    .filter(region => region.keywords.some(keyword => containsKeyword(text, keyword)))
    .map(region => region.slug);
  return [...new Set(matches)];
}

export function regionBySlug(slug) {
  return BY_SLUG.get(String(slug || '')) || null;
}

export function storiesByRegion(articles) {
  const out = new Map(REGIONS.map(region => [region.slug, []]));
  for (const article of articles || []) {
    for (const slug of regionsForArticle(article)) out.get(slug)?.push(article);
  }
  return out;
}
