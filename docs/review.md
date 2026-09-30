# Initial implementation review

2026-09-30: independent read-only review of the initial implementation
(`d48f019`) used `claude-fable-5-1`. The process returned success with no tool
permission denials. It reported no high/critical findings. This records the
maintainer-facing disposition; security and release contracts remain in their
respective documents.

| Finding | Disposition |
| --- | --- |
| Tagged workflow can replace its own checks | Accepted as a release prerequisite: protected `release` environment and maintainer-restricted `v*` tag ruleset. Workflow names the environment; external protections must be configured before first publication. |
| Lossy Windows inode identity | Accepted: all command-file identity checks request bigint stats. |
| Astral Unicode accepted in token validation | Accepted: positive printable-ASCII allowlist and regression test. |
| New Node trust/proxy environment knobs | Accepted conservatively: reject both knobs explicitly. |
| Warnings abort otherwise valid installs; abnormal cleanup claim | Accepted: suppress warnings, test silence, and explicitly bound cleanup guarantees to ordinary rejection. |
| Bare tag ambiguity and tag movement | Accepted: resolve full `refs/tags` through annotated tags and compare before draft creation, before publishing and after immutable assertion. External tag protection remains required. |
| Latest pointer and immutable preflight | Latest remains intentionally unchanged for all action releases; documented. Immutable-setting confirmation remains a maintainer preflight because publication tokens have minimal permissions. Post-publication assertion detects misconfiguration but is not a preventative control. |
| Action pins and update visibility | Full hashes retained; setup-node v6 and CodeQL v4 refs were resolved through GitHub. Added weekly Actions Dependabot. Version comments and additional CodeQL languages are optional presentation/coverage suggestions, not requirements of the installer contract. |

Expanded tests cover matching forbidden ZIP flags in both headers, unsupported
compression, entry counts, optional gzip headers/header CRC/reserved bits,
redirect boundaries and missing Location, an absolute deadline across hops,
invalid command-file kinds, astral tokens, failed-executable cleanup on every
OS, symlink command files, and full shipped-entry silence/wrong-pin failure
against the real release on the native CI matrix.

Internal errors deliberately remain fixed and unclassified. Negative tests
assert rejection at the public boundary; dedicated mutations isolate relevant
checks instead of requiring error text. Synthetic HTTP transport tests are not
a claim to cover every TLS/socket failure. Resource limits rely on Node's
bounded inflater plus independent declared-size/stream-byte checks; CI does not
allocate an oversized 256 MiB fixture on every runner.

The follow-up Fable review of `3a427d4` confirmed the named corrections and no
remaining high/medium findings. Two new low findings were accepted: reject
Node debug/OpenSSL configuration before token-bearing requests, and publish
only the newly created release ID after refusing existing drafts. Regression
tests cover debug rejection, release identity, unexpected assets, and mutable
publication. The publication script is tested without network writes.

Review of these final corrections is required before handoff. A completed
implementation PR is not authorization to publish an action release.
