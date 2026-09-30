<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" doctype-system="about:legacy-compat"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>Nuvellum RSS</title>
        <style>
          body{margin:0;background:#f8f4ec;color:#1f1a16;font-family:Georgia,'Times New Roman',serif}
          .page{width:min(980px,calc(100% - 40px));margin:0 auto;padding:48px 0 64px}
          .mast{border-bottom:1px solid #cfc3b3;padding-bottom:24px;margin-bottom:28px}
          .brand{font-size:48px;color:#661227;letter-spacing:.02em}.tag{font-style:italic;color:#6b6259;margin-top:3px}
          h1{font-size:58px;font-weight:400;line-height:1;margin:18px 0 10px}.intro{font-size:18px;line-height:1.5;color:#6b6259;max-width:38em}
          .note{border:1px solid #ddd3c3;padding:14px 16px;margin:24px 0 34px;background:#fbf8f2;font-size:14px;line-height:1.5}
          .feedlink{color:#661227}.item{padding:22px 0;border-top:1px solid #ddd3c3}.item:first-of-type{border-top:0}
          .item h2{font-size:28px;font-weight:400;line-height:1.12;margin:0 0 8px}.item a{color:inherit;text-decoration:none}.item a:hover{color:#661227}
          .date{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#661227}.dek{font-size:17px;line-height:1.45;color:#6b6259;margin:8px 0 0}
          .foot{border-top:1px solid #1f1a16;margin-top:28px;padding-top:16px;color:#6b6259;font-size:13px;font-style:italic}
          @media(max-width:640px){.page{width:min(100% - 24px,980px);padding-top:28px}.brand{font-size:38px}h1{font-size:42px}.item h2{font-size:24px}}
        </style>
      </head>
      <body>
        <main class="page">
          <header class="mast">
            <div class="brand">Nuvellum ✦</div>
            <div class="tag">Beyond the headline.</div>
            <h1>RSS</h1>
            <p class="intro">The publication, in order of publication — without ranking, recommendation or noise.</p>
          </header>
          <div class="note">This is Nuvellum’s RSS feed. Add <span class="feedlink">https://www.nuvellum.news/rss.xml</span> to your preferred RSS reader. The entries below are the same feed rendered for a browser.</div>
          <xsl:for-each select="rss/channel/item">
            <article class="item">
              <div class="date"><xsl:value-of select="pubDate"/></div>
              <h2><a><xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute><xsl:value-of select="title"/></a></h2>
              <p class="dek"><xsl:value-of select="description"/></p>
            </article>
          </xsl:for-each>
          <div class="foot">Nuvellum · Beyond the headline.</div>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
