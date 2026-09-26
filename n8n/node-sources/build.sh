U=$(cat _url.js); F=$(cat _fm.js); A=$(cat _article.js)
{ echo "$U"; cat queue.js; } > out/queue.js
{ echo "$U"; cat prepare_source.js; } > out/prepare_source.js
{ echo "$U"; cat dup_context.js; } > out/dup_context.js
{ echo "$U"; cat open_pr_dups.js; } > out/open_pr_dups.js
{ echo "$U"; cat parse_draft.js; } > out/parse_draft.js
{ echo "$F"; echo; cat parse_review.js; } > out/parse_review.js
{ echo "$F"; echo; cat parse_sensitive.js; } > out/parse_sensitive.js
{ echo "$F"; echo; echo "$A"; echo; cat sanitize_svg.js; } > out/sanitize_svg.js
{ echo "$U"; echo; cat build_payload.js; } > out/build_payload.js
