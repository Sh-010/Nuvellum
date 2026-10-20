#!/usr/bin/env python3
"""Nuvellum newsroom v6.5 migration: feed -> source -> Gemini -> guarded GitHub branch.

Safe by default: without --write, never changes GitHub. No external Python packages.
The existing GitHub editorial PR + image-acquisition + publication gates remain authoritative.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import email.utils
import hashlib
import html
from html.parser import HTMLParser
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO = "Sh-010/Nuvellum"
FEEDS = [
    ("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC", "World"),
    ("https://www.aljazeera.com/xml/rss/all.xml", "Al Jazeera", "World"),
    ("https://www.france24.com/en/rss", "France 24", "World"),
    ("https://rss.dw.com/rdf/rss-en-all", "Deutsche Welle", "World"),
    ("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC", "Business"),
    ("https://www.cnbc.com/id/100003114/device/rss/rss.html", "CNBC", "Business"),
    ("https://fortune.com/feed/", "Fortune", "Business"),
    ("https://feeds.bbci.co.uk/news/technology/rss.xml", "BBC", "Technology"),
    ("https://techcrunch.com/feed/", "TechCrunch", "Technology"),
    ("https://www.theverge.com/rss/index.xml", "The Verge", "Technology"),
    ("https://feeds.arstechnica.com/arstechnica/index", "Ars Technica", "Technology"),
    ("https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "BBC", "Science"),
    ("https://www.nasa.gov/feed/", "NASA", "Science"),
    ("https://www.sciencedaily.com/rss/top/science.xml", "ScienceDaily", "Science"),
    ("https://www.fbi.gov/feeds/national-press-releases/rss.xml", "FBI", "Crime"),
    ("https://www.theguardian.com/us-news/us-crime/rss", "The Guardian", "Crime"),
    ("https://feeds.bbci.co.uk/sport/rss.xml?edition=uk", "BBC", "Sports"),
    ("https://www.espn.com/espn/rss/news", "ESPN", "Sports"),
    ("https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "BBC", "Culture"),
    ("https://www.theguardian.com/culture/rss", "The Guardian", "Culture"),
    ("https://www.theguardian.com/film/rss", "The Guardian", "Film & TV"),
    ("https://variety.com/feed/", "Variety", "Film & TV"),
    ("https://deadline.com/feed/", "Deadline", "Film & TV"),
    ("https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us", "Anime News Network", "Anime"),
    ("https://feeds.feedburner.com/ign/all", "IGN", "Gaming"),
    ("https://www.polygon.com/rss/index.xml", "Polygon", "Gaming"),
    ("https://www.gamesindustry.biz/feed", "GamesIndustry.biz", "Gaming"),
]
SECTIONS = {"World", "Business", "Technology", "Science", "Crime", "Sports", "Culture", "Film & TV", "Anime", "Gaming"}
TYPES = {"News", "Analysis", "Explainer"}
REGIONS = {"north-america", "latin-america-caribbean", "europe-central-asia", "middle-east-north-africa",
           "sub-saharan-africa", "south-asia", "east-asia", "southeast-asia-oceania"}
BLOCKED_PATH = re.compile(r"/(?:video|watch|liveblog|live-updates|podcast|audio|gallery|in-pictures|pictures|photos|slideshow|newsletter|quiz)(?:/|-)", re.I)
BLOCKED_TITLE = re.compile(r"^(?:live|watch|video|listen|podcast|gallery|photos?|quiz)\b|\blive(?: blog| updates|:)\b|\bas it happened\b", re.I)
COMMENTARY = re.compile(r"\b(opinion|editorial|review|best of|buyers? guide|gift guide|ranking|listicle)\b", re.I)
RISK_TERMS = re.compile(r"\b(election\w*|candidate\w*|politic\w*|minister\w*|president\w*|parliament\w*|war|missile|attack\w*|"
                        r"fatal|kill(?:ed|ing)?|died|deaths?|injur\w*|lawsuit|court|arrest\w*|charged|accused|"
                        r"allegation|rape|sex abuse|data breach|privacy breach|terror|hostage|crime)\b", re.I)
TRACK = re.compile(r"^(utm_.*|fbclid|gclid|dclid|msclkid|yclid|igshid|mc_cid|mc_eid|_ga|_gl|ref|ref_src|source|src|partner|share)$", re.I)
USER_AGENT = "NuvellumNewsroom/6.5 (+https://nuvellum.news)"
MAX_BYTES = 2_000_000
MAX_SOURCE_AGE_H = 72


def safe_https(value: str) -> bool:
    try:
        u = urllib.parse.urlsplit(value)
        if u.scheme != "https" or not u.hostname or u.username or u.password or u.port not in (None, 443):
            return False
        host = u.hostname.lower()
        if host in ("localhost", "localhost.localdomain") or host.endswith((".local", ".internal", ".localhost")):
            return False
        try:
            return ipaddress.ip_address(host).is_global
        except ValueError:
            return bool(re.fullmatch(r"[a-z0-9.-]+", host) and "." in host)
    except (ValueError, AttributeError):
        return False


def canonical_url(raw: str) -> str:
    if not safe_https(raw):
        raise ValueError("unsafe or non-HTTPS source link")
    u = urllib.parse.urlsplit(raw.strip())
    query = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
    kept = [(k, v) for k, v in query if not TRACK.match(k)]
    return urllib.parse.urlunsplit(("https", u.hostname.lower(), u.path.rstrip("/") or "/",
                                    urllib.parse.urlencode(kept), ""))


def source_key(raw: str) -> str:
    u = urllib.parse.urlsplit(canonical_url(raw))
    return "https://" + u.hostname.removeprefix("www.") + (u.path.rstrip("/") or "/")


def source_hash(raw: str) -> str:
    # JavaScript Math.imul FNV-1a, matching n8n v6.5 branch suffix.
    h = 0x811C9DC5
    for char in source_key(raw):
        h = ((h ^ ord(char)) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def request(url: str, *, method="GET", payload=None, token=None, timeout=18, max_bytes=MAX_BYTES):
    if not safe_https(url):
        raise ValueError("blocked URL")
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, application/xml, text/xml, text/html, */*"}
    if token:
        headers["Authorization"] = "Bearer " + token
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        data = res.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("oversized response")
        return data.decode("utf-8", errors="replace")


def json_request(url, **kw):
    return json.loads(request(url, **kw))


def strip_tags(text):
    return html.unescape(re.sub(r"<[^>]*>", " ", str(text or ""))).replace("\xa0", " ").strip()


def words(text):
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def child_text(elem, name):
    for child in elem:
        if child.tag.rsplit("}", 1)[-1].lower() == name.lower():
            return "".join(child.itertext()).strip()
    return ""


def parse_time(value):
    if not value:
        return None
    try:
        d = email.utils.parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try:
            d = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)


def parse_feed(xml_text, outlet, section, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    root = ET.fromstring(xml_text)
    items = []
    for el in root.iter():
        if el.tag.rsplit("}", 1)[-1].lower() not in ("item", "entry"):
            continue
        title = child_text(el, "title")
        link = child_text(el, "link")
        if not link:
            for c in el:
                if c.tag.rsplit("}", 1)[-1].lower() == "link" and c.attrib.get("href"):
                    link = c.attrib["href"]
                    break
        if not title or not link or BLOCKED_TITLE.search(title) or COMMENTARY.search(title):
            continue
        if BLOCKED_PATH.search(link):
            continue
        try:
            link = canonical_url(link)
        except ValueError:
            continue
        when = next((parse_time(child_text(el, k)) for k in ("pubDate", "published", "updated", "date")
                     if parse_time(child_text(el, k))), None)
        if when is None or when > now + dt.timedelta(hours=2) or now - when > dt.timedelta(hours=MAX_SOURCE_AGE_H):
            continue
        description = child_text(el, "description") or child_text(el, "summary") or child_text(el, "content")
        items.append({"title": strip_tags(title), "link": link, "summary": strip_tags(description),
                      "outlet": outlet, "section": section, "timestamp": when.timestamp()})
    return items


class ArticleExtractor(HTMLParser):
    """Extract article/main text and JSON-LD without depending on external packages."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.text_parts = []
        self.ld_parts = []
        self.ld = False
        self.depth = 0
        self.blocked = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.stack.append(tag)
        if tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self.ld = True
            self.ld_parts.append("")
            return
        if tag in ("article", "main"):
            self.depth += 1
        if tag in ("script", "style", "nav", "header", "footer", "aside", "form", "noscript"):
            self.blocked += 1
        if tag in ("p", "h1", "h2", "h3", "li"):
            self.text_parts.append(" ")

    def handle_endtag(self, tag):
        if tag == "script" and self.ld:
            self.ld = False
        if tag in ("article", "main") and self.depth > 0:
            self.depth -= 1
        if tag in ("script", "style", "nav", "header", "footer", "aside", "form", "noscript") and self.blocked > 0:
            self.blocked -= 1
        if tag in self.stack:
            self.stack = self.stack[:len(self.stack) - 1 - self.stack[::-1].index(tag)]

    def handle_data(self, data):
        if self.ld:
            self.ld_parts[-1] += data
        elif self.depth and not self.blocked:
            self.text_parts.append(data)


def source_text(page, headline, fallback=""):
    parser = ArticleExtractor()
    parser.feed(page)
    structured = []
    for block in parser.ld_parts:
        try:
            def visit(v):
                if isinstance(v, list):
                    for x in v: visit(x)
                elif isinstance(v, dict):
                    if isinstance(v.get("articleBody"), str):
                        structured.append(v["articleBody"])
                    for x in v.values():
                        if isinstance(x, (list, dict)):
                            visit(x)
            visit(json.loads(block))
        except (ValueError, RecursionError):
            pass
    choices = sorted(structured, key=words, reverse=True) + [" ".join(parser.text_parts), fallback]
    title_terms = [w.lower() for w in re.findall(r"[a-z0-9]{5,}", headline.lower())]
    for candidate in choices:
        cleaned = re.sub(r"\s+", " ", strip_tags(candidate)).strip()
        on_topic = len(title_terms) < 2 or sum(t in cleaned[:2500].lower() for t in title_terms) >= 2
        if on_topic and words(cleaned) >= 180:
            return " ".join(cleaned.split()[:2200])
    return ""


def select_candidates(items, max_candidates=5):
    items = sorted(items, key=lambda x: x["timestamp"], reverse=True)
    unique = []
    seen = set()
    for x in items:
        key = source_key(x["link"])
        if key not in seen:
            seen.add(key)
            unique.append(x)
    result, hosts, sections = [], set(), set()
    for varied in (True, False):
        for x in unique:
            host = urllib.parse.urlsplit(x["link"]).hostname.removeprefix("www.")
            if x in result or host in hosts or (varied and x["section"] in sections):
                continue
            result.append(x)
            hosts.add(host)
            sections.add(x["section"])
            if len(result) >= max_candidates:
                return result
    return result


def gemini(prompt, api_key, *, model=None):
    model = model or os.getenv("NUVELLUM_GEMINI_MODEL", "gemini-3.5-flash-lite")
    if not re.fullmatch(r"[a-zA-Z0-9._-]+", model):
        raise ValueError("Invalid model name")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}
    }
    for attempt in range(3):
        try:
            req = urllib.request.Request(endpoint, data=json.dumps(body).encode(), method="POST",
                                         headers={"Content-Type": "application/json", "x-goog-api-key": api_key,
                                                  "User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=75) as res:
                response = json.load(res)
            parts = response["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
            return json.loads(text)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or attempt == 2:
                raise RuntimeError(f"Gemini API returned HTTP {e.code}") from None
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("Gemini unavailable")


def index_and_prs(token):
    # An unreachable index is not proof of uniqueness: fail closed.
    indexed = json_request("https://nuvellum.vercel.app/search-index.json")
    if isinstance(indexed, dict):
        indexed = indexed.get("articles", indexed.get("items", []))
    if not isinstance(indexed, list):
        raise ValueError("Search index shape unexpectedly changed")
    prs = json_request(f"https://api.github.com/repos/{REPO}/pulls?state=open&per_page=100", token=token)
    if not isinstance(prs, list):
        raise ValueError("GitHub PR list unavailable")
    sources = set()
    titles = []
    for row in indexed:
        if isinstance(row, dict):
            titles.append(str(row.get("title", "")))
            for url in row.get("sourceUrls", []):
                try: sources.add(source_key(url))
                except ValueError: pass
    for pr in prs:
        titles.append(re.sub(r"^Editorial:\s*", "", str(pr.get("title", "")), flags=re.I))
        for url in re.findall(r"\*\*Source:\*\*\s*(https://\S+)", pr.get("body") or ""):
            try: sources.add(source_key(url))
            except ValueError: pass
    return sources, [x for x in titles if x][-100:]


def duplicate_check(candidate, titles, api_key):
    prompt = (
        "You are Nuvellum's duplicate-story gate. Compare the new headline against "
        "published and in-flight titles. Same event without materially new development "
        "is duplicate; a genuinely new filing, decision or result is not. Similar subject "
        "alone is not duplicate. Return JSON exactly with keys isDuplicate (bool), reason (string).\n"
        + json.dumps({"headline": candidate["title"], "recentTitles": titles}, ensure_ascii=False)
    )
    d = gemini(prompt, api_key)
    if not isinstance(d.get("isDuplicate"), bool):
        raise ValueError("invalid duplicate-gate output")
    return d["isDuplicate"]


def draft_story(candidate, text, api_key):
    prompt = (
        "You are Nuvellum's senior international news editor. Write one original English-language "
        "reported story based ONLY on the provided source. Never fabricate facts, quotes, dates or "
        "background. No long copied phrases. Attribute contested claims. Neutral, nonpartisan tone. "
        "If this is opinion, review, ranking, roundup, advertising or multiple unrelated stories, "
        "return JSON {\"skip\":true,\"reason\":\"...\"}. Otherwise return ONLY a JSON object with "
        "title, dek, section, type, tags (array), regions (array), countries (array), risk "
        "(low|sensitive), bodyMarkdown. Section: World|Business|Technology|Science|Crime|Sports|"
        "Culture|Film & TV|Anime|Gaming. Type: News|Analysis|Explainer. "
        "Use original sentence-case headline under 120 chars and factual dek under 260. "
        "Write 120-500 words, only as long as the source supports, with two or three ## subheads. "
        "No raw HTML, invented quotes, unattributed accusations, or embedded images. "
        "Tags: 2-6 factual labels. regions: only north-america,latin-america-caribbean,"
        "europe-central-asia,middle-east-north-africa,sub-saharan-africa,south-asia,"
        "east-asia,southeast-asia-oceania. Countries only when explicitly relevant; "
        "spell out canonical names such as United States, United Kingdom, Türkiye, Palestine. "
        "risk=sensitive for politics, lawsuits, security issues, allegations, deaths, conflict or "
        "serious reputational harm. Human-only opinions and reviews must be skipped.\n"
        + json.dumps({"sourceOutlet": candidate["outlet"], "sectionHint": candidate["section"],
                      "sourceHeadline": candidate["title"], "sourceUrl": candidate["link"],
                      "sourceText": text}, ensure_ascii=False)
    )
    return gemini(prompt, api_key)


def validate_draft(d, candidate, text):
    if d.get("skip") is True:
        raise ValueError("commentary or other ineligible source")
    title = str(d.get("title", "")).strip()
    dek = str(d.get("dek", "")).strip()
    body = str(d.get("bodyMarkdown", "")).strip()
    if not (12 <= len(title) <= 120 and 20 <= len(dek) <= 260 and 120 <= words(body) <= 700):
        raise ValueError("title/dek/body lengths invalid")
    if re.search(r"<\s*/?\s*[a-z][^>]*>", body, re.I) or re.search(r"!\[[^\]]*\]\(", body):
        raise ValueError("unsafe markup or embedded image")
    if len(re.findall(r"^##\s+", body, flags=re.M)) < 2:
        raise ValueError("article is missing structure")
    if re.search(r"\]\((?!https://|mailto:|/|#)", body, re.I):
        raise ValueError("unsafe markdown link")
    if re.search(r"\b(needs to|should|must|ought to)\b", title, re.I) and not re.search(r"\b(says?|argues?|claims?)\b", title, re.I):
        raise ValueError("normative headline")
    if d.get("type", "News") not in TYPES:
        raise ValueError("human-led or invalid type")
    if d.get("section") not in SECTIONS:
        raise ValueError("invalid section")
    tags = d.get("tags")
    regions = d.get("regions")
    countries = d.get("countries")
    if not isinstance(tags, list) or not (2 <= len(tags) <= 6) or not all(isinstance(x, str) and 1 <= len(x) <= 40 for x in tags):
        raise ValueError("invalid tags")
    if not isinstance(regions, list) or len(regions) > 4 or len(regions) != len(set(regions)) or not set(regions) <= REGIONS:
        raise ValueError("invalid regions")
    if not isinstance(countries, list) or len(countries) > 12 or not all(isinstance(x, str) for x in countries) or len(set(countries)) != len(countries):
        raise ValueError("invalid countries")
    # A model's low-risk label cannot override deterministic escalation.
    elevated = candidate.get("section") == "Crime" or RISK_TERMS.search(title + " " + candidate["title"] + " " + dek)
    risk = "sensitive" if elevated else d.get("risk")
    if risk not in ("low", "sensitive"):
        raise ValueError("invalid risk")
    return {"title": title, "dek": dek, "body": body, "section": d["section"], "type": d.get("type", "News"),
            "tags": tags, "regions": regions, "countries": countries, "risk": risk}


def review_story(article, candidate, source, api_key):
    prompt = (
        "You are Nuvellum's publication review gate. Compare the proposed article against "
        "the complete source text. Fail if any claim, quote, number, location or allegation "
        "is unsupported, if the category is wrong, if this is commentary disguised as news, "
        "or if source text contains other stories. A model reviewing this source is not "
        "independent corroboration. Return JSON with approved (boolean), risk_score (0-100), "
        "issues (array of strings), sensitive (boolean), decision_reason (string). "
        "Approve only on zero issues, score <=20, and verified grounded reporting.\n"
        + json.dumps({"sourceTitle": candidate["title"], "source": source, "article": article}, ensure_ascii=False)
    )
    decision = gemini(prompt, api_key)
    score = decision.get("risk_score", 100)
    if not isinstance(score, (int, float)) or score < 0 or score > 100:
        raise ValueError("invalid review score")
    if decision.get("approved") is not True or score > 20 or decision.get("issues") != []:
        raise ValueError("editorial review rejected the article")
    if decision.get("sensitive") is True:
        article["risk"] = "sensitive"
    return decision


def verify_sensitive(article, candidate, source, api_key):
    """Independent second-model pass is an additional check, never human approval."""
    prompt = ("Nuvellum sensitive reporting second-pass verification. Reject fabricated facts, "
              "unattributed disputed claims, inferred guilt or causation, partisan language, altered "
              "quotes, unsupported headlines, omissions or opinion disguised as news. "
              "Return JSON: publishable (boolean), risk_score (number), issues (array of strings), "
              "reason (string). Be strict. This model check is NOT human approval.\n" +
              json.dumps({"headline": article["title"], "dek": article["dek"], "source": source,
                          "body": article["body"], "outlet": candidate["outlet"]}, ensure_ascii=False))
    verdict = gemini(prompt, api_key)
    if verdict.get("publishable") is not True or verdict.get("issues") != [] or not isinstance(verdict.get("risk_score"), (int, float)) or verdict["risk_score"] > 20:
        raise ValueError("sensitive verification declined; human review required")
    return verdict


def frontmatter(article, candidate, *, published):
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    published_at = now.isoformat().replace("+00:00", "Z")
    slug = re.sub(r"[^a-z0-9]+", "-", article["title"].lower().encode("ascii", "ignore").decode()).strip("-")[:90].rstrip("-")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("invalid article slug")
    outlet = candidate["outlet"]
    fields = [
        ("title", article["title"]), ("dek", article["dek"]), ("section", article["section"]),
        ("type", article["type"]), ("author", "Nuvellum Global Desk"),
        ("date", now.date().isoformat()), ("publishedAt", published_at),
        ("readingTime", f"{max(1, (words(article['body']) + 199) // 200)} min"),
        ("status", "published" if published else "review"),
        ("tags", article["tags"]), ("regions", article["regions"]), ("countries", article["countries"]),
        ("sourceUrls", [candidate["link"]]),
        ("sourceNote", f"Prepared from {outlet} reporting and reviewed by the Nuvellum editorial pipeline."),
        ("origin", "automation"), ("risk", article["risk"]), ("editorialReview", "passed"),
        ("reviewedBy", ""),
    ]
    if article["risk"] == "sensitive":
        fields.append(("verification", "uncertain"))
    def quote(v):
        if isinstance(v, list):
            return json.dumps(v, ensure_ascii=False)
        # The existing frontmatter parser strips only outer quotes.
        return json.dumps(str(v).replace('"', "”").replace("<", "").replace(">", ""), ensure_ascii=False)
    markdown = "---\n" + "\n".join(f"{key}: {quote(value)}" for key, value in fields) + "\n---\n\n" + article["body"] + "\n"
    return slug, markdown


def local_repository_gate(slug, markdown):
    """Run the authoritative repository validator without mutating content."""
    js = (
        "import {readFileSync} from 'node:fs'; "
        "import {articleErrors} from './scripts/lib/article-rules.mjs'; "
        "import {newStoryQualityProblems} from './scripts/lib/newsroom.mjs'; "
        "const text=readFileSync(0,'utf8');const file=process.argv[1]+'.md'; "
        "const errors=articleErrors(text,file); "
        "const end=text.indexOf('\\n---',3);"
        "const raw=text.slice(4,end);const fields={}; "
        "for(const line of raw.split('\\n')){const m=line.match(/^([A-Za-z]+): (.+)$/);"
        "if(m){try{fields[m[1]]=JSON.parse(m[2])}catch{fields[m[1]]=m[2]}}} "
        "errors.push(...newStoryQualityProblems(fields,text.slice(end+4),{slug:process.argv[1],hasAiArt:false}));"
        "if(errors.length){console.error(errors.join('\\n'));process.exit(1)}"
    )
    run = subprocess.run(["node", "--input-type=module", "-e", js, slug], input=markdown,
                         text=True, capture_output=True, timeout=30, check=False)
    if run.returncode:
        raise ValueError("repository gate rejected draft: " + run.stderr[:650])


def github_write(slug, markdown, candidate, token):
    if os.getenv("ALLOW_EDITORIAL_WRITES") != "on":
        raise ValueError("writes not explicitly allowed")
    deploy_key = os.getenv("NUVELLUM_USE_DEPLOY_KEY") == "on"
    if not deploy_key and not os.getenv("NUVELLUM_EDITORIAL_TOKEN"):
        raise ValueError("write requires the repository deploy key or NUVELLUM_EDITORIAL_TOKEN")
    branch = f"incoming/{slug[:60].rstrip('-')}-{source_hash(candidate['link'])}"
    path = f"src/content/articles/{slug}.md"
    if deploy_key:
        # actions/checkout provides the existing NUVELLUM_DEPLOY_KEY as SSH credentials.
        # Unlike GITHUB_TOKEN writes, deploy-key git pushes start the downstream gates.
        def run_git(*args):
            return subprocess.run(["git", *args], capture_output=True, text=True,
                                  check=True, timeout=90)
        remote = run_git("ls-remote", "--heads", "origin", branch)
        if remote.stdout.strip():
            raise ValueError("incoming branch already exists; refusing an overwrite")
        run_git("fetch", "origin", "main", "--depth=1")
        run_git("checkout", "-b", branch, "FETCH_HEAD")
        destination = Path(path)
        if destination.exists():
            raise ValueError("the article slug already exists on main")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(markdown, encoding="utf-8")
        run_git("add", path)
        run_git("-c", "user.name=Nuvellum Newsroom",
                "-c", "user.email=actions@users.noreply.github.com",
                "commit", "-m", "editorial: add " + slug)
        run_git("push", "origin", "HEAD:refs/heads/" + branch)
        return branch
    base = f"https://api.github.com/repos/{REPO}"
    head = json_request(base + "/git/ref/heads/main", token=token)["object"]["sha"]
    # No publishing changes happen until editorial checks have passed.
    json_request(base + "/git/refs", token=token, method="POST",
                 payload={"ref": "refs/heads/" + branch, "sha": head})
    json_request(base + "/contents/" + path, token=token, method="PUT",
                 payload={"message": "editorial: add " + slug,
                          "content": base64.b64encode(markdown.encode()).decode(), "branch": branch})
    return branch


def collect_feeds():
    items, errors = [], []
    with ThreadPoolExecutor(max_workers=9) as executor:
        futures = {executor.submit(request, url): (url, name, section) for url, name, section in FEEDS}
        for future in as_completed(futures):
            url, name, section = futures[future]
            try:
                items.extend(parse_feed(future.result(), name, section))
            except Exception as e:
                errors.append({"feed": url, "error": type(e).__name__})
    return items, errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Submit one qualified story to an incoming branch")
    parser.add_argument("--max-candidates", type=int, default=5)
    parser.add_argument("--feeds-only", action="store_true", help="No AI calls; check feed discovery")
    args = parser.parse_args(argv)
    if not 1 <= args.max_candidates <= 5:
        parser.error("--max-candidates must be between 1 and 5")
    api_key = os.getenv("GOOGLE_GEMINI_API_KEY", "")
    token = os.getenv("NUVELLUM_EDITORIAL_TOKEN", "") or os.getenv("GITHUB_TOKEN", "")
    if args.write and (not api_key or not (os.getenv("NUVELLUM_EDITORIAL_TOKEN") or os.getenv("NUVELLUM_USE_DEPLOY_KEY") == "on")):
        parser.error("Write mode requires Gemini key and either an SSH deploy key or editorial token")
    feed_items, errors = collect_feeds()
    candidates = select_candidates(feed_items, args.max_candidates)
    print(json.dumps({"stage": "feed_discovery", "feeds": len(FEEDS), "items": len(feed_items),
                      "errors": errors, "selected": len(candidates)}, ensure_ascii=False))
    if args.feeds_only or not api_key:
        print("Feed-only mode: no generation and no GitHub writes.")
        return 0
    try:
        existing, titles = index_and_prs(token)
    except Exception as e:
        print(f"Fail closed: published index or GitHub PR checks unavailable ({type(e).__name__})", file=sys.stderr)
        return 1
    for candidate in candidates:
        try:
            if source_key(candidate["link"]) in existing:
                print("Skip exact-source duplicate:", candidate["link"])
                continue
            if duplicate_check(candidate, titles, api_key):
                print("Skip event duplicate:", candidate["title"][:100])
                continue
            page = request(candidate["link"], timeout=25)
            source = source_text(page, candidate["title"], candidate["summary"])
            if not source:
                print("Skip short/off-topic source:", candidate["link"])
                continue
            generated = draft_story(candidate, source, api_key)
            article = validate_draft(generated, candidate, source)
            review_story(article, candidate, source, api_key)
            if article["risk"] == "sensitive":
                verify_sensitive(article, candidate, source, api_key)
            # Sensitive stories are human-review candidates, NEVER auto-published.
            is_low_risk = article["risk"] == "low"
            slug, markdown = frontmatter(article, candidate, published=is_low_risk)
            local_repository_gate(slug, markdown)
            if not args.write:
                print(json.dumps({"stage": "dry_run_approved", "slug": slug,
                                  "risk": article["risk"], "section": article["section"],
                                  "would_publish": is_low_risk}, ensure_ascii=False))
                return 0
            branch = github_write(slug, markdown, candidate, token)
            print(json.dumps({"stage": "submitted", "branch": branch,
                              "sensitive_human_review_required": not is_low_risk}))
            return 0  # Always one approved story per run.
        except Exception as e:
            print(json.dumps({"stage": "candidate_rejected", "title": candidate["title"][:100],
                              "reason": str(e)[:700]}, ensure_ascii=False))
            # On GitHub write failure stop rather than try another and risk >1 submission.
            if args.write and isinstance(e, (urllib.error.HTTPError, urllib.error.URLError)):
                return 1
    print("No eligible candidate survived the gates; no write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
