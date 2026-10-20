import datetime as dt
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("newsroom_engine", Path(__file__).parents[1] / "scripts" / "newsroom-engine.py")
engine = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(engine)


class NewsroomMigrationTests(unittest.TestCase):
    def test_feeds_match_v65(self):
        self.assertEqual(len(engine.FEEDS), 27)
        self.assertTrue(all(engine.safe_https(row[0]) for row in engine.FEEDS))

    def test_unsafe_urls_rejected(self):
        for url in ("http://example.com/", "https://localhost/x", "https://127.0.0.1/x",
                    "file:///etc/passwd", "https://user:password@www.bbc.com/"):
            with self.subTest(url=url):
                self.assertFalse(engine.safe_https(url))

    def test_source_keys_strip_www_query_and_tracking(self):
        url = "https://www.bbc.co.uk/news/a-story/?utm_source=xx&ref=r"
        self.assertEqual(engine.source_key(url), "https://bbc.co.uk/news/a-story")
        self.assertEqual(engine.canonical_url(url), "https://www.bbc.co.uk/news/a-story")

    def test_same_story_query_variants_are_deduplicated(self):
        now = 1_777_000_000
        x = {"title": "Research announcement", "link": "https://www.nasa.gov/news/abc?utm_source=rss",
             "outlet": "NASA", "section": "Science", "timestamp": now}
        y = {**x, "link": "https://nasa.gov/news/abc?ref=home", "timestamp": now - 100}
        self.assertEqual(len(engine.select_candidates([x, y])), 1)
        self.assertEqual(engine.source_hash(x["link"]), engine.source_hash(y["link"]))

    def test_rss_parse_and_stale_rejection(self):
        now = dt.datetime(2026, 10, 20, 12, 0, tzinfo=dt.timezone.utc)
        xml = "<rss><channel><item><title>Space research expands</title>" + \
              "<link>https://www.nasa.gov/space-research</link><description>Details</description>" + \
              "<pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate></item>" + \
              "<item><title>Old story</title><link>https://nasa.gov/old</link>" + \
              "<pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>"
        results = engine.parse_feed(xml, "NASA", "Science", now=now)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Space research expands")

    def test_atom_entry_href(self):
        now = dt.datetime(2026, 10, 20, 12, 0, tzinfo=dt.timezone.utc)
        xml = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Major launch</title>' + \
              '<link href="https://techcrunch.com/major-launch" />' + \
              '<updated>2026-10-20T11:00:00Z</updated></entry></feed>'
        self.assertEqual(len(engine.parse_feed(xml, "TechCrunch", "Technology", now=now)), 1)

    def test_article_body_extraction(self):
        body = "<p>This detailed scientific finding is now published with extensive source material. </p>" * 25
        page = "<html><body><nav>Unrelated links</nav><main><article>" + body + \
               "</article></main></body></html>"
        text = engine.source_text(page, "scientific finding published")
        self.assertGreater(engine.words(text), 180)
        self.assertNotIn("Unrelated", text)

    def test_draft_rejects_unattributed_opinion(self):
        d = self.valid_draft()
        d["title"] = "NASA must change its research policies"
        with self.assertRaisesRegex(ValueError, "normative"):
            engine.validate_draft(d, {"title": "NASA research changes"}, "")

    def test_sensitive_risk_cannot_be_downgraded(self):
        d = self.valid_draft()
        candidate = {"title": "Police arrest suspect after fatal attack"}
        result = engine.validate_draft(d, candidate, "")
        self.assertEqual(result["risk"], "sensitive")
        self.assertIn('status: "review"', engine.frontmatter(result,
                      {"link": "https://bbc.com/x", "outlet": "BBC"}, published=False)[1])

    def test_frontmatter_matches_repo_structure(self):
        d = engine.validate_draft(self.valid_draft(), {"title": "NASA research changes"}, "")
        slug, md = engine.frontmatter(d, {"link": "https://nasa.gov/news/a", "outlet": "NASA"},
                                      published=True)
        self.assertIn('origin: "automation"', md)
        self.assertIn('editorialReview: "passed"', md)
        self.assertIn('sourceUrls: ["https://nasa.gov/news/a"]', md)
        self.assertRegex(slug, r"^[a-z0-9-]+$")
        self.assertNotIn("image:", md)

    def test_generated_article_passes_repository_integrity_gate(self):
        draft = self.valid_draft()
        article = engine.validate_draft(draft, {"title": "NASA research changes"}, "")
        slug, markdown = engine.frontmatter(article,
                    {"link": "https://nasa.gov/news/quality-check", "outlet": "NASA"},
                    published=False)
        engine.local_repository_gate(slug, markdown)

    @staticmethod
    def valid_draft():
        sentence = "NASA published research findings based on observations and described the methods used in the study. "
        return {"title": "NASA reports findings from scientific research", "dek": "NASA has reported scientific findings from new observations.",
                "section": "Science", "type": "News", "risk": "low",
                "tags": ["NASA", "research"], "countries": [], "regions": [],
                "bodyMarkdown": "## Context\n" + sentence * 7 + "\n\n## Findings\n" + sentence * 8}


if __name__ == "__main__":
    unittest.main()
