# Installer security contract

The normative CLI artifact format is owned by
[shoutx release contract revision 1](https://github.com/send/shoutx/blob/fb6c5beaff2449901250fe4ced950d7ffaaabcc6/docs/release.md).
This document owns installer-specific choices and limits. Action input and
output names are defined in `action.yml`; the README summarizes their use.

## Trust and sequence

Trust the workflow, selected action commit, Node 24 runtime, runner OS and
temporary root, TLS implementation and roots, GitHub, and the shoutx release
authority. A supplied manifest digest is an additional trusted constraint.
Run before untrusted code. A prior process with the runner identity can
compromise the job or replace files; this action does not repair that state.

Validation runs in this order: input/environment/platform checks, opening
existing regular environment files, creation of a private temporary directory,
repository identity, release metadata, manifest digest and grammar, archive
digests, complete archive validation, writing only the executable, captured
version check, version output, and finally PATH append. A failure before the
append phase writes no environment-file records. Output I/O is not
transactional: a failed write can leave partial records or an already-written
version output. An ordinarily rejected install removes its private directory;
forced process termination, an uncaught exception, or a cleanup I/O failure
can leave private temporary files for runner cleanup. Successful
directories remain for the job and are writable by subsequent same-user steps.

The only download authority starts are `api.github.com/repos/send/shoutx` and
deterministically constructed `github.com/send/shoutx/releases/download/`
URLs. Repository ID must be `1381947214`. API asset URLs must match constructed
URLs exactly. Every redirect uses HTTPS without URL credentials or fragments;
final CDN hostnames are not pinned. Tokens are absent on all redirect requests
(including same-origin redirects) and all asset requests. No input or process
environment selects another repository, URL, executable, archive, or transport.

The HTTP client does not use environment proxy settings. Nonempty
`NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`, `NODE_USE_SYSTEM_CA`,
`NODE_DEBUG`, `NODE_DEBUG_NATIVE`, `OPENSSL_CONF`, `SSL_CERT_FILE`, or `SSL_CERT_DIR` are
rejected; `NODE_TLS_REJECT_UNAUTHORIZED` must be absent or `1`. The runner may
apply Node startup options before our launcher; a compromised startup is
outside the trust boundary. GitHub API/server environment overrides must be
absent or exactly the public GitHub origins.

## Resource and path limits

- Versions: at most 55 UTF-8 bytes, ASCII Cargo SemVer with u64 numeric core,
  at least `0.3.0-rc.1` using SemVer prerelease ordering.
- Manifest pin: empty or exactly 64 lowercase hexadecimal characters.
- Token: at most 16 KiB, printable non-space ASCII, never persisted or logged.
- Path strings: at most 16 KiB of well-formed UTF-8. Reject C0 controls, DEL,
  double quotes, and BOM characters anywhere. POSIX requires `/`, rejects `:`
  and trailing backslash. Windows requires a drive-absolute path and rejects
  `;`. These conservative restrictions are stricter than the CLI PATH contract.
- Metadata and manifest: 1 MiB each. Archive input and expanded data: 256 MiB
  each. Complete validation is buffered in memory; peak usage can exceed the
  archive bound because decompressed buffers and input buffers coexist.
- Each logical HTTP fetch: 30-second absolute deadline across at most five
  redirects, no retries. Four logical fetches bound network time to 120 seconds.
  Non-200 final responses, rate limits, encodings other than identity, declared
  or observed oversized responses, and truncated bodies fail closed.
- Binary check: ten seconds, 4 KiB per captured stream, stdin closed, no shell,
  absolute executable path, empty environment except required Windows
  `SystemRoot`. Require exact `shoutx VERSION` plus LF and empty stderr.

The temporary directory uses mode 0700 and the executable 0755 on POSIX. File
headers do not grant permissions. Existing command files must be regular
non-symlink files, are opened without creation, and cannot refer to the same
file. No legacy stdout-command fallback exists. These checks do not establish
exclusive access against a compromised runner or same-user concurrent process.

## Archive interpretation

No general-purpose extraction is used. The parser returns only the executable
bytes after validating the complete archive. Paths must exactly equal the
three revision-1 logical files or optional root directory. The root directory
must have no payload. Duplicate names, aliases, case variants, links, and
special files are rejected. Unsupported encodings fail closed.

TAR validates checksums, recognized ustar/GNU-ustar magic, octal sizes, raw
names, link/prefix absence, file types, zero padding and end markers. Gzip has
one member, optional-header checks, CRC/size validation, and no trailing data.
ZIP validates EOCD, counts and offsets, contiguous nonoverlapping local and
central records, matching metadata/names, CRCs, stored/deflate sizes, and Unix
file types. It rejects extras, comments, ZIP64, encryption, descriptors,
multi-disk archives, and prepended/interstitial/trailing bytes.

The checksum manifest accepts LF-terminated lowercase digest/two-space/safe
filename records, ignores empty lines, rejects duplicate filenames, and permits
unrelated well-formed entries. It must contain the selected archive exactly
once. The API digest and optional caller pin both constrain the manifest;
the manifest and API digest both constrain the selected archive.

## Diagnostic boundary

The launcher installs warning, uncaught-exception and unhandled-rejection
handlers before loading the bundle. Warnings are silently suppressed.
Action-controlled failures emit one fixed
ASCII line, never exception objects, input, paths, downloaded data, response
bodies, or child output. Success is silent. A launcher parse error, Node fatal
abort, runtime startup diagnostic, or runner-generated message precedes or
escapes those handlers and is outside this claim. In particular, runtime debug
output emitted before the launcher executes cannot be suppressed by the action;
debug settings are rejected before any token-bearing network request.

The dependency-injected HTTP seam is exported for module-level tests only.
It cannot be selected by action inputs or environment variables. Shipped-entry
tests cover failures with fixed production endpoints; hostile-transport tests
exercise production modules, not patched shipped-entry bytes. Real-release CI
exercises the full shipped entry, metadata services, archive, native binary,
environment files, and subsequent-step PATH use.

## Review before release

Review raw archive handling, redirects/token boundaries, generated bundle,
workflow privileges, and the above trust assumptions independently before the
first action release. Tests use independent archive constructors and real CLI
release bytes. Passing synthetic tests alone is insufficient release evidence.

Report suspected vulnerabilities through GitHub private vulnerability reporting
when enabled, rather than including secrets in a public issue.
