# security-audit

```bash
pnpm audit:security
```

Two checks, both taken from what actually worked during the September 2026
compromise ([write-up](../../docs/security/2026-09-15-eslint-config-malware.md)),
plus one that would have caught it on day one.

## Why these checks and not a keyword scan

During that incident, searching for the malware's own identifiers came back
clean **three times**. The payload encrypts its strings — the campaign id,
the wallet address, even the words `spawn` and `http` are absent as
plaintext. A scanner built on known indicators would have missed it and
said so confidently.

What it could not hide was its **shape**. So these checks test for shape.

| Check                        | What it looks for                                              | Why                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Padded payload lines         | A long run of spaces, then thousands of characters on one line | Both infected files were padded with 200 spaces so the line reads as blank in an editor                                    |
| Files modified after install | A file in npm's tree dated later than its neighbours           | `npm/lib/cli.js` was the only file in the whole npm installation with a later date — a far louder signal than its contents |
| VS Code code signature       | `codesign --verify` on the app bundle                          | A patched app bundle breaks its seal whatever the change looks like inside; this is what found the injected `main.js`      |

## What it will and will not tell you

It finds **unknown variants of this technique**, because it keys on
mechanics rather than samples. It will miss a payload that pads with tabs,
splits itself across several lines, or hides in a compiled binary.

Treat a finding as a prompt to look, not a verdict. Compiled `.node`
binaries legitimately trip the timestamp check, since they are built at
install time rather than unpacked — and so does any file you have
repaired by hand, forever after.

That last case is why a timestamp finding is reported but does **not** on
its own fail the run. Each one is qualified by re-testing that file's
contents, and only a file that is both late _and_ carries a padded payload
counts. A check that stays red after a legitimate repair is a check people
learn to skip.

It is a smoke alarm. It is not a virus scanner, and a clean run is not
proof of anything.

## Running it regularly

Worth running after adding dependencies, after an editor or Node upgrade,
and any time something behaves oddly. It exits non-zero when it finds
something, so it can be wired into CI or a pre-push hook.
