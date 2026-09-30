import { createHash } from 'node:crypto';

const MAX_RECIPIENTS = 100;
const BATCH_SIZE = 100;
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const parseTime = (article) => {
  const raw = article?.publishedAt || article?.date || '';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const t = Date.parse(normalized);
  return Number.isFinite(t) ? t : 0;
};

export function cairoIssueDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function prettyIssueDate(issueDate) {
  const date = new Date(`${issueDate}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Cairo'
  }).format(date);
}

export function selectBriefStories(input, { count = 3 } = {}) {
  const seen = new Set();
  const eligible = (Array.isArray(input) ? input : [])
    .filter((a) => a && a.status === 'published')
    .filter((a) => ['manual', 'automation'].includes(a.origin))
    .filter((a) => typeof a.slug === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(a.slug))
    .filter((a) => typeof a.title === 'string' && a.title.trim().length >= 5)
    .filter((a) => typeof a.dek === 'string' && a.dek.trim().length >= 20)
    .filter((a) => parseTime(a) > 0)
    .sort((a, b) => parseTime(b) - parseTime(a))
    .filter((a) => {
      if (seen.has(a.slug)) return false;
      seen.add(a.slug);
      return true;
    });
  return eligible.slice(0, count);
}

export function issueFingerprint(stories) {
  return createHash('sha256')
    .update(stories.map((s) => s.slug).join('\n'))
    .digest('hex')
    .slice(0, 24);
}

export function issueHasNewStory(stories, previous) {
  const prior = new Set(Array.isArray(previous?.slugs) ? previous.slugs : []);
  return stories.some((story) => !prior.has(story.slug));
}

export function renderBriefIssue({ stories, issueDate, site = 'https://www.nuvellum.news', unsubscribeUrl }) {
  if (!Array.isArray(stories) || stories.length !== 3) throw new Error('Exactly three stories are required.');
  if (!unsubscribeUrl) throw new Error('Unsubscribe URL is required.');

  const root = String(site).replace(/\/+$/, '');
  const readable = prettyIssueDate(issueDate);
  const story = (s, index) => {
    const url = `${root}/article/${encodeURIComponent(s.slug)}`;
    return `
<tr>
<td bgcolor="#faf7f1" style="background-color:#faf7f1;padding-top:${index === 0 ? 30 : 26}px;padding-right:36px;padding-bottom:26px;padding-left:36px;${index ? 'border-top-width:1px;border-top-style:solid;border-top-color:#ded5c9;' : ''}">
<p style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;color:#7b2638;letter-spacing:1.6px;text-transform:uppercase;">${esc(s.section || 'Nuvellum')}</p>
<p style="margin-top:0;margin-right:0;margin-bottom:10px;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:${index === 0 ? 27 : 23}px;line-height:${index === 0 ? 32 : 29}px;color:#17120f;"><a href="${esc(url)}" style="color:#17120f;text-decoration:none;">${esc(s.title)}</a></p>
<p style="margin-top:0;margin-right:0;margin-bottom:14px;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:23px;color:#5d554e;">${esc(s.dek)}</p>
<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#7b2638;"><a href="${esc(url)}" style="color:#7b2638;text-decoration:none;">Read the story →</a></p>
</td>
</tr>`;
  };

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>The Nuvellum Brief</title>
</head>
<body style="margin:0;background-color:#eee8df;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;background-color:#eee8df;">
<tr><td align="center" bgcolor="#eee8df" style="background-color:#eee8df;padding-top:32px;padding-right:16px;padding-bottom:32px;padding-left:16px;">
<!--[if mso]><table width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:600px;background-color:#faf7f1;border-top-width:4px;border-top-style:solid;border-top-color:#6f1d2c;border-right-width:1px;border-right-style:solid;border-right-color:#d8d0c5;border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#d8d0c5;border-left-width:1px;border-left-style:solid;border-left-color:#d8d0c5;">
<tr><td bgcolor="#faf7f1" style="background-color:#faf7f1;padding-top:30px;padding-right:36px;padding-bottom:24px;padding-left:36px;">
<p style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:11px;line-height:16px;color:#7a6e65;letter-spacing:2px;text-transform:uppercase;">Nuvellum · Beyond the headline</p>
<p style="margin-top:0;margin-right:0;margin-bottom:4px;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:42px;color:#17120f;font-weight:400;">The Nuvellum Brief</p>
<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#7a6e65;">${esc(readable)}</p>
</td></tr>
<tr><td bgcolor="#f5efe7" style="background-color:#f5efe7;border-top-width:1px;border-top-style:solid;border-top-color:#ded5c9;border-bottom-width:1px;border-bottom-style:solid;border-bottom-color:#ded5c9;padding-top:22px;padding-right:36px;padding-bottom:22px;padding-left:36px;">
<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:28px;color:#433b35;font-style:italic;">Three stories from Nuvellum worth understanding today.</p>
</td></tr>
${stories.map(story).join('')}
<tr><td align="center" bgcolor="#211b18" style="background-color:#211b18;padding-top:24px;padding-right:36px;padding-bottom:24px;padding-left:36px;">
<p style="margin-top:0;margin-right:0;margin-bottom:15px;margin-left:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:24px;color:#eee4d8;">The rest of the world is still moving.</p>
<table cellpadding="0" cellspacing="0" border="0" role="presentation"><tr><td bgcolor="#6f1d2c" style="background-color:#6f1d2c;"><a href="${esc(root)}/latest" style="display:inline-block;padding-top:11px;padding-right:18px;padding-bottom:11px;padding-left:18px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;color:#ffffff;text-decoration:none;letter-spacing:1px;text-transform:uppercase;">Continue on Nuvellum</a></td></tr></table>
</td></tr>
<tr><td bgcolor="#f0e9df" style="background-color:#f0e9df;padding-top:22px;padding-right:36px;padding-bottom:24px;padding-left:36px;">
<p style="margin-top:0;margin-right:0;margin-bottom:8px;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:16px;color:#756b63;">You received this because you subscribed to The Nuvellum Brief.</p>
<p style="margin-top:0;margin-right:0;margin-bottom:0;margin-left:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:16px;color:#756b63;"><a href="${esc(unsubscribeUrl)}" style="color:#6f1d2c;text-decoration:underline;">Unsubscribe</a> · <a href="${esc(root)}/privacy" style="color:#6f1d2c;text-decoration:underline;">Privacy</a> · <a href="${esc(root)}" style="color:#6f1d2c;text-decoration:underline;">Nuvellum</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'Nuvellum · Beyond the headline',
    '',
    'The Nuvellum Brief',
    readable,
    '',
    'Three stories from Nuvellum worth understanding today.',
    '',
    ...stories.flatMap((s, i) => [
      `${i + 1}. ${s.title}`,
      `${s.section || 'Nuvellum'} — ${s.dek}`,
      `${root}/article/${encodeURIComponent(s.slug)}`,
      ''
    ]),
    `Continue on Nuvellum: ${root}/latest`,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
    `Privacy: ${root}/privacy`
  ].join('\n');

  return {
    subject: `The Nuvellum Brief — ${readable}`,
    previewText: stories[0].title,
    html,
    text
  };
}

export function buildRecipientEmail({ subscriber, stories, issueDate, site, unsubscribeUrl, topicId }) {
  const issue = renderBriefIssue({ stories, issueDate, site, unsubscribeUrl });
  return {
    from: 'Nuvellum Brief <brief@nuvellum.news>',
    to: [subscriber.email],
    subject: issue.subject,
    html: issue.html,
    text: issue.text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    },
    ...(topicId ? { topic_id: topicId } : {})
  };
}

export async function sendResendBatches({
  apiKey,
  emails,
  idempotencyBase,
  fetchImpl = fetch
}) {
  if (!apiKey || !apiKey.startsWith('re_')) throw new Error('Resend API key is not configured.');
  if (!Array.isArray(emails) || !emails.length) return { batches: 0, recipients: 0 };
  if (emails.length > MAX_RECIPIENTS) throw new Error(`Recipient count exceeds the safety cap of ${MAX_RECIPIENTS}.`);

  let batches = 0;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    const res = await fetchImpl(RESEND_BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `${idempotencyBase}/${Math.floor(i / BATCH_SIZE)}`
      },
      body: JSON.stringify(chunk)
    });
    if (!res.ok) throw new Error(`Resend batch send failed (${res.status}).`);
    batches += 1;
  }
  return { batches, recipients: emails.length };
}

export const BRIEF_LIMITS = { maxRecipients: MAX_RECIPIENTS, batchSize: BATCH_SIZE };
