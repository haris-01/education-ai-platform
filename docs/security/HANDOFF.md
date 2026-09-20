# Handoff — malware incident, 15 September 2026

For the next agent session. Read this before touching the repo or
suggesting anything about security. Full analysis:
[2026-09-15-eslint-config-malware.md](./2026-09-15-eslint-config-malware.md).

## One-paragraph summary

A credential-stealing npm worm (ChainDrop / Shai-Hulud family, campaign
`A9-1446-1`) had code execution on this machine. It patched three things:
npm's own `cli.js`, VS Code's `main.js`, and this repo's
`eslint.config.js`. All three are repaired. The git history has been
rewritten and force-pushed so the payload is gone from GitHub. What remains
is the user's own follow-up, listed below, plus one unanswered question.

## State

Re-verified end to end on **16 September 2026**. Everything below was
checked again from scratch on that date, not carried over.

| Thing                                 | State                                        | Verified how                                                     |
| ------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| `eslint.config.js` (working tree)     | Clean, 716 bytes                             | No line over 500 chars                                           |
| Git history reachable from `main`     | Clean — 41 commits, no blob with a long line | Every blob in `git rev-list --objects main` measured             |
| `npm/lib/cli.js`                      | Genuine 409 bytes                            | Read in full; no other npm file touched since 1 Sept             |
| VS Code app bundle                    | **Signature intact** — reinstall confirmed   | `codesign --verify --deep --strict` exits 0                      |
| VS Code injection artefacts           | Gone                                         | No `*.inz.*` anywhere in the bundle, `~/.vscode`, or user data   |
| Running implants                      | None                                         | `ps` — only Claude and Slack helpers; no node process            |
| C2 connections                        | None                                         | `lsof -i` — nothing to `193.247.144.38` or otherwise             |
| Persistence (launch agents, shell rc) | Clean                                        | 4 LaunchAgents, all Google/Steam; no long line in any shell rc   |
| Every project on this machine         | Clean — **24,440 files**                     | Structural scan of all of `~/Documents/code`, incl. `portfolio`  |
| npm cache, pnpm store, Node, exts     | Clean — 7,040 files                          | Same scan, extension filter removed for content-addressed stores |
| `pnpm audit:security`                 | Passes                                       | Run; 17/17 tests pass; `lint` and `format:check` clean           |

The one remaining copy of the payload on this machine is the old
`eslint.config.js` blob `292c8759`, reachable **only** from the two
`backup/pre-rewrite-*` tags. It is not in `main` and not on GitHub. See
[Evidence, and its expiry](#evidence-and-its-expiry) for how to drop it.

A scan for this campaign's sentinel strings also matches this repo's own
security documentation and `find-padded-payloads.test.ts`, which quote them
deliberately. Those are not findings.

## What still needs doing (user's, not yours)

**Ask before assuming any are done.** As of 16 September:

1. ~~**Restart VS Code.**~~ Done.
2. ~~**Reinstall VS Code.**~~ Done — `codesign --verify --deep --strict`
   now exits 0, which the hand-repair could never have achieved.
3. **Rotate every credential.** _Still outstanding, and still the important
   one._ Nothing found on disk proves anything here: this malware family
   exists to harvest developer credentials, and it had npm-level and
   editor-level execution for ~16 hours. A clean machine today says nothing
   about what left it on 15 September. The SSH key at `~/.ssh/id_ed25519`
   dates from 21 August, so it was present throughout and must be replaced.
4. **Check GitHub** for SSH keys, tokens or repos the user did not create.
   _Still outstanding._
5. **Optionally reinstall Node.** Lower priority now — `cli.js` reads as
   genuine and no other file in the npm tree has been touched since
   1 September, but the repair was still by hand.

## The audit tool

`tools/security-audit/` is committed (`b31d678`), its 17 tests pass, and
`lint` / `format:check` are clean. Run it with:

```bash
pnpm audit:security
```

Expected healthy output: no padded payloads, VS Code signature intact, and
`npm/lib/cli.js` reported as modified-after-install but **contents look
clean**. That last line is not a problem — it is the repair showing up, and
it is deliberately reported without failing the run, because a check that
stays red forever after a legitimate fix is one people learn to skip.

`b31d678` is **not yet pushed**; `origin/main` is at `fdf06a4`.

## Unanswered: how it got in

**Not determined.** All three infected files are persistence the malware
installed once it was already running. The entry point is unknown.

What was ruled out or checked:

- npm's debug logs are pruned; nothing survives from the 02:24 window when
  `cli.js` was patched. Only logs from 17:54 onward (the repair work) and
  one `eresolve-report.txt` from 13 August remain.
- That August report is from an `npm install` in a **different project**
  (`portfolio@0.1.0`, an Expo/React Three Fiber app at
  `~/Documents/code/AZT/portfolio`) — it is an npm project, and npm runs
  install scripts freely. Scanned on 16 September: **no payload in it
  today.** That does not clear it as the vector. The malware's job was to
  patch npm and the editor, not to stay in the tree it arrived through,
  and a dependency that has since been updated or yanked would leave
  nothing behind. Confirming or clearing it means auditing that project's
  lockfile against the published advisories for this campaign, which has
  not been done.
- This repo is an unlikely vector: pnpm blocks install scripts unless
  allow-listed, and only `esbuild` is listed. A poisoned dependency's
  postinstall would not have run here.
- `mongodb-mcp-server` was suspected and **cleared** — its cached tree was
  checked file by file. Do not re-accuse it.

Unexplained: this repo's `eslint.config.js` was infected in commit
`d2ade4d`, dated **5 August** — six weeks before the npm patch. That
commit's author timezone (+0500) and committer timezone (+0200) disagree,
which hand-authoring does not produce. Either the machine was compromised
in early August, or that date is not what it appears.

Remaining avenues, if the user wants to pursue it:

```bash
find ~/.npm/_cacache -newermt "2026-09-15 01:00" ! -newermt "2026-09-15 02:30" -type f
grep -rE "npm (i|install|ci)|npx " ~/.zsh_history | tail -50
```

Every project under `~/Documents/code` has now been scanned structurally
(24,440 files, 16 September) and none carries the payload. That answers
"is it still there", not "where did it come from".

## Things not to do

- **Never `git pull --rebase` on this repo.** It has already undone the
  history rewrite once, replaying the cleaned commits back onto the
  infected base and putting the payload into 15 commits _and_ the working
  tree. If another clone needs syncing, re-clone it.
- **Do not trust a keyword scan.** Searching for this malware's own
  identifiers came back clean three times; the payload encrypts its
  strings, including `spawn` and `http`. Check structure instead — see
  `tools/security-audit/`.
- **Do not assume a clean `audit:security` run means anything.** It is a
  smoke alarm for one technique.

## Evidence, and its expiry

Quarantined samples live in that session's scratchpad:

```
/private/tmp/claude-501/-Users-harissaeed-Documents-code-AI-practice-education-ai-platform/
  0a48f5bd-13b5-44c2-8182-bf9dd0bfd784/scratchpad/
    eslint.config.js.INFECTED.bak          9,970 bytes
    npm-cli.js.INFECTED.bak            1,507,931 bytes
    vscode-main.js.INFECTED.bak        1,317,847 bytes
    quarantine-main.inz.cjs            1,507,322 bytes
```

Still present as of 16 September. **That directory is session-scoped and
will be cleaned up.** If the user wants these for reporting to GitHub, npm
or a vendor, they must be moved somewhere permanent first — and kept
outside any directory a tool might execute from.

**Two** tags plus `refs/original` still point at the pre-rewrite history
and therefore still hold the infected `eslint.config.js` blob
(`292c8759`, 9,970 bytes). All are local-only; `origin/main` does not
reach them. Drop them once the rewrite is trusted and the samples above
are archived somewhere permanent:

```bash
git tag -d backup/pre-rewrite-2 backup/pre-rewrite-2026-09-15
git update-ref -d refs/original/refs/heads/main
git reflog expire --expire=now --all && git gc --prune=now
```

Until that runs, a scan of the full object database will keep reporting
one infected blob. That is expected, and is the only real payload left in
the repository.

## Indicators

```
A9-1446-1                                     campaign id (this machine)
RS260605  M260630A                            injection sentinels
0xa322E5f3D311D3080e6f0121063e9aDC2490Ef1a    C2 dead-drop wallet
193.247.144.38                                resolved C2 (rotates)
*.inz.cjs  *.inz.orig  __inzCR                VS Code injection artefacts
```
