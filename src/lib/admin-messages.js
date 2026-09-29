// Editorial wording for validation messages shown in /admin. The rules themselves live in
// scripts/lib/article-rules.mjs and scripts/lib/admin/*.mjs and are not changed here: this only
// translates what they report into plain instructions, and says which field and group each one is
// about, so the editor can point at it. Unknown messages fall back to the original text, cleaned up.

// field: element id to focus ('risk' = the Low/Sensitive switch, 'regions' = the region list).
// group: collapsible metadata group that holds the field (null = always visible).
const GROUP = { 'tag-in': 'g-class', 'country-in': 'g-class', regions: 'g-class', 'f-sources': 'g-sources', 'f-sourcenote': 'g-sources',
  'f-alt': 'g-image', 'f-caption': 'g-image', 'f-credit': 'g-image', 'f-imgurl': 'g-image', 'f-file': 'g-image', 'f-licenseurl': 'g-image',
  'f-sourcepage': 'g-image', 'f-license': 'g-image', 'img-mode': 'g-image' };

const FIELD_OF_KEY = { title: 'f-title', dek: 'f-dek', section: 'f-section', type: 'f-type', author: 'f-author', date: 'f-date',
  readingTime: 'f-body', tags: 'tag-in', countries: 'country-in', regions: 'regions', sourceUrls: 'f-sources', sourceNote: 'f-sourcenote',
  imageAlt: 'f-alt', imageCaption: 'f-caption', imageCredit: 'f-credit', imageLicense: 'f-license', imageLicenseUrl: 'f-licenseurl',
  imageSourcePage: 'f-sourcepage', image: 'f-imgurl', risk: 'risk', editorialReview: 'f-review', verification: 'f-verify', reviewedBy: 'f-reviewer', publishedAt: 'f-published' };

const LABEL_OF_KEY = { title: 'headline', dek: 'dek', section: 'section', type: 'story type', author: 'byline', date: 'story date',
  tags: 'tags', countries: 'countries', regions: 'regions', sourceNote: 'source note', imageAlt: 'alt text', imageCaption: 'caption',
  imageCredit: 'image credit', imageLicense: 'licence', reviewedBy: 'reviewer name' };

const MISSING = {
  title: 'Add a headline before publishing.',
  dek: 'Add a dek before publishing.',
  section: 'Choose a section.',
  type: 'Choose a story type.',
  author: 'Add the byline (author).',
  date: 'Set the story date.',
  readingTime: 'Write the article: reading time is worked out from the text.',
  status: 'Save the story again from this editor.',
  tags: 'Add at least one tag.'
};

const quote = (s) => `“${s}”`;

// Gate wording shared by the repository validator's messages and the dashboard's gate check.
const GATE_TEXT = {
  review: 'Before publishing: record editorial review as Passed.',
  verify: 'Before publishing: record verification as Cleared (sensitive story).',
  reviewer: 'Before publishing: name the person who verified this sensitive story.'
};

// [pattern, (match) => { text, field }] — first match wins. Patterns are matched against the message
// with any "<slug>.md: " prefix removed.
const RULES = [
  [/^missing required frontmatter field "(\w+)"/, (m) => ({ text: MISSING[m[1]] || `Add the ${LABEL_OF_KEY[m[1]] || m[1]}.`, field: FIELD_OF_KEY[m[1]] || null })],
  [/^tags must be a non-empty/, () => ({ text: 'Add at least one tag.', field: 'tag-in' })],
  [/^status must be/, () => ({ text: 'The story status is not valid. Save it again from this editor.', field: null })],
  [/^unsupported section "(.*)"/, (m) => ({ text: `Choose a section from the list (${quote(m[1])} is not a Nuvellum section).`, field: 'f-section' })],
  [/^unsupported type "(.*)"/, (m) => ({ text: `Choose a story type from the list (${quote(m[1])} is not one of them).`, field: 'f-type' })],
  [/^origin must be/, () => ({ text: 'This story’s origin is not recognised. Reopen it from the Articles list.', field: null })],
  [/require risk|^risk must be/, () => ({ text: 'Choose a risk level: Low or Sensitive.', field: 'risk' })],
  [/^editorialReview must be/, () => ({ text: 'Record the editorial review result.', field: 'f-review' })],
  [/^verification must be/, () => ({ text: 'Record the verification result.', field: 'f-verify' })],
  [/can only be published with editorialReview/, () => ({ text: GATE_TEXT.review, field: 'f-review' })],
  [/can only be published with verification/, () => ({ text: GATE_TEXT.verify, field: 'f-verify' })],
  [/named reviewedBy|cannot be published without reviewedBy/, () => ({ text: GATE_TEXT.reviewer, field: 'f-reviewer' })],
  [/^reviewedBy ".*" is reserved/, () => ({ text: '“Nuvellum Verification Pipeline” is reserved for the automated checks. Enter the name of the person who verified the story.', field: 'f-reviewer' })],
  [/^invalid slug/, () => ({ text: 'Fix the web address: lowercase words joined by hyphens.', field: 'f-slug' })],
  [/^Slug must be/, (m, raw) => ({ text: raw, field: 'f-slug' })],
  [/^The slug ".*" is already/, (m, raw) => ({ text: raw, field: 'f-slug' })],
  [/^date must be/, () => ({ text: 'Set a valid story date.', field: 'f-date' })],
  [/^publishedAt must be/, () => ({ text: 'Set a valid publish time, or leave it empty to use the moment of publication.', field: 'f-published' })],
  [/^publishedAt does not match date/, () => ({ text: 'The publish time falls on a different day from the story date. Make them match.', field: 'f-published' })],
  [/^updated must be/, () => ({ text: 'The “updated” date is not valid. Save the story again from this editor.', field: null })],
  [/^title is over (\d+)/, (m) => ({ text: `Shorten the headline to ${m[1]} characters or fewer.`, field: 'f-title' })],
  [/^dek is over (\d+)/, (m) => ({ text: `Shorten the dek to ${m[1]} characters or fewer.`, field: 'f-dek' })],
  [/^regions may contain at most (\d+)/, (m) => ({ text: `Choose at most ${m[1]} regions.`, field: 'regions' })],
  [/^regions must not contain duplicates/, () => ({ text: 'A region is selected twice. Clear the duplicate.', field: 'regions' })],
  [/^unsupported region "(.*)"/, (m) => ({ text: `${quote(m[1])} is not a Nuvellum region. Choose from the list.`, field: 'regions' })],
  [/^regions must be/, () => ({ text: 'Choose regions from the list.', field: 'regions' })],
  [/^countries may contain at most (\d+)/, (m) => ({ text: `Use at most ${m[1]} countries.`, field: 'country-in' })],
  [/^(?:invalid|unrecognised) country "(.*?)"/, (m) => ({ text: `${quote(m[1])} is not a recognised country name. Pick the name offered in the list (for example “United States”).`, field: 'country-in' })],
  [/^countries must not contain duplicates/, () => ({ text: 'A country is listed twice. Remove the duplicate.', field: 'country-in' })],
  [/^countries must be/, () => ({ text: 'Add countries one at a time from the list.', field: 'country-in' })],
  [/^HTML is not allowed in (\w+)/, (m) => ({ text: `Remove the HTML from the ${LABEL_OF_KEY[m[1]] || m[1]}.`, field: FIELD_OF_KEY[m[1]] || null })],
  [/^image needs imageAlt/, () => ({ text: 'Add alt text that describes the image.', field: 'f-alt' })],
  [/^generic house art/, () => ({ text: 'That picture is generic section art, not the story. Choose a real image, or choose No image so the story is text-led.', field: 'img-mode' })],
  [/^(?:generated images must be|AI image)/, () => ({ text: 'That illustration does not belong to this story. Choose another image or No image.', field: 'img-mode' })],
  [/^image must use/, () => ({ text: 'Use an https:// image address or upload the file.', field: 'f-imgurl' })],
  [/^Image .* must be an https:\/\/ address/, () => ({ text: 'The image address must start with https://.', field: 'f-imgurl' })],
  [/^(?:local article image .* is missing|Image .* is not in the repository|That repository image does not exist)/, () => ({ text: 'That image file is not on the site yet. Upload it again or choose another image.', field: 'img-mode' })],
  [/^Wikimedia image is missing (\w+)/, (m) => ({ text: `The Wikimedia image is missing its ${LABEL_OF_KEY[m[1]] || m[1]}.`, field: FIELD_OF_KEY[m[1]] || 'f-credit' })],
  [/^(?:Wikimedia|automated Wikimedia)/, () => ({ text: 'The Wikimedia image details are incomplete. Check the image credit fields.', field: 'f-credit' })],
  [/^imageSourcePage must be/, () => ({ text: 'The source page for a Wikimedia image must be its Wikimedia Commons page.', field: 'f-sourcepage' })],
  [/^imageLicenseUrl must use/, () => ({ text: 'The licence link must start with https://.', field: 'f-licenseurl' })],
  [/^article body is empty/, () => ({ text: 'Write the article before publishing.', field: 'f-body' })],
  [/^raw HTML is blocked/, () => ({ text: 'Remove the HTML from the article. Use the formatting buttons instead.', field: 'f-body' })],
  [/^blocked unsafe markup or URL pattern/, () => ({ text: 'The article contains something that is never allowed (for example a script or a javascript: link). Remove it.', field: 'f-body' })],
  [/^link target "(.*)" is not allowed/, (m) => ({ text: `The link ${quote(m[1])} is not allowed. Links must start with https://.`, field: 'f-body' })],
  [/^duplicate title also used by (.*)/, (m) => ({ text: `Another story (${m[1].replace(/\.md$/, '')}) already uses this headline. Make it distinct.`, field: 'f-title' })],
  [/^source URL must use/, () => ({ text: 'Source links must start with https://.', field: 'f-sources' })],
  [/^source URL already used by (.*)/, (m) => ({ text: `A source is already cited by another story (${m[1].replace(/\.md$/, '')}). Check this is not a duplicate story.`, field: 'f-sources' })],
  [/^sourceUrls must be/, () => ({ text: 'List the sources one https:// address per line.', field: 'f-sources' })],
  [/^automated stories require at least one sourceUrls/, () => ({ text: 'Newsroom stories need at least one source link.', field: 'f-sources' })],
  [/^automated intake cannot publish/, () => ({ text: 'Opinion, Essay, Ideas and Review are human-led formats: the automated newsroom cannot publish them.', field: 'f-type' })],
  [/^Publication gate not met: Risk/, () => ({ text: 'Before publishing: choose a risk level.', field: 'risk' })],
  [/^Publication gate not met: Editorial review/, () => ({ text: GATE_TEXT.review, field: 'f-review' })],
  [/^Publication gate not met: Verification/, () => ({ text: GATE_TEXT.verify, field: 'f-verify' })],
  [/^Publication gate not met: Named reviewer/, () => ({ text: GATE_TEXT.reviewer, field: 'f-reviewer' })],
  // warnings
  [/^Title is (\d+)\/(\d+) characters/, (m) => ({ text: `The headline is ${m[1]} of ${m[2]} characters, close to the limit.`, field: 'f-title' })],
  [/^Dek is (\d+)\/(\d+) characters/, (m) => ({ text: `The dek is ${m[1]} of ${m[2]} characters, close to the limit.`, field: 'f-dek' })],
  [/^No photo credit recorded/, () => ({ text: 'No photo credit yet. Add the photographer or agency if you know it; never guess.', field: 'f-credit' })],
  [/^No image: the story will be set text-led/, () => ({ text: 'No image: the story will be set text-led. That is fine; add one only if you have a real image.', field: 'img-mode' })],
  [/^Image URL /, (m, raw) => ({ text: raw.replace(/^Image URL/, 'The image address'), field: 'f-imgurl' })],
  [/^SVG (?:images|uploads) are not accepted/, (m, raw) => ({ text: raw, field: 'img-mode' })],
  // upload checks (already plain language)
  [/^(?:The file name ends in|The browser reported|The image dimensions|The image is \d+px wide|The image is too large)/, (m, raw) => ({ text: raw, field: 'f-file' })]
];

/** One message → { text, field, group, raw }. */
export function describeIssue(message) {
  const raw = String(message ?? '').trim();
  const msg = raw.replace(/^[a-z0-9-]+\.md:\s*/, '');
  for (const [re, build] of RULES) {
    const m = msg.match(re);
    if (m) {
      const { text, field } = build(m, msg);
      return { text, field: field || null, group: (field && GROUP[field]) || null, raw };
    }
  }
  const text = msg ? msg[0].toUpperCase() + msg.slice(1) + (/[.!?]$/.test(msg) ? '' : '.') : '';
  return { text, field: null, group: null, raw };
}

/** Translate a list, dropping exact repeats (two raw messages can say the same thing). */
export function describeIssues(messages) {
  const seen = new Set(), out = [];
  for (const m of messages || []) {
    const d = describeIssue(m);
    if (!d.text || seen.has(d.text)) continue;
    seen.add(d.text); out.push(d);
  }
  return out;
}
