// Which branches may be deleted. Pure; the CLI (scripts/cleanup-merged-branches.mjs) does the I/O.
//
// A branch is deleted only when a PR from it was MERGED and the branch tip is still exactly that PR's head
// (nothing was pushed after the merge). Everything else is kept:
//   - main, social-ledger (and any other name in KEEP)
//   - branches with an open PR, or that an open PR targets as its base (stacked PRs)
//   - branches with no PR (unknown purpose), or closed without merge (kept as evidence)
//   - branches that moved after their merge
// scope 'incoming' (default) considers only incoming/** editorial branches; 'all' considers every branch.
export const KEEP = new Set(['main', 'social-ledger']);

export function planBranches({ refs, prs, repo, scope = 'incoming' }) {
  const openBases = new Set(prs.filter((p) => p.state === 'open').map((p) => p.base?.ref));
  const out = [];
  for (const r of refs) {
    const branch = r.ref.replace(/^refs\/heads\//, '');
    if (scope === 'incoming' && !branch.startsWith('incoming/')) continue;
    const mine = prs.filter((p) => p.head?.ref === branch && p.head?.repo?.full_name === repo);
    const open = mine.find((p) => p.state === 'open');
    const merged = mine.find((p) => p.merged_at);
    let action = 'keep', reason;
    if (KEEP.has(branch)) reason = 'protected';
    else if (open) reason = `open PR #${open.number}`;
    else if (openBases.has(branch)) reason = 'base of an open PR (stacked)';
    else if (!mine.length) reason = 'no PR (kept)';
    else if (!merged) reason = `closed without merge #${mine[0].number} (kept as evidence)`;
    else if (merged.head.sha !== r.object.sha) reason = `branch moved after merge of #${merged.number} (kept)`;
    else { action = 'delete'; reason = `merged in #${merged.number}`; }
    out.push({ branch, action, reason });
  }
  return out;
}
