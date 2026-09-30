# setup-shoutx

Install verified [shoutx](https://github.com/send/shoutx) releases in GitHub Actions.

Status: implementation in progress; no action release is available yet.

## Usage

After reviewing and pinning an action commit, use:

```yaml
permissions:
  contents: read
steps:
  - uses: send/setup-shoutx@REVIEWED_FULL_COMMIT_SHA
    with:
      shoutx-version: '0.3.0-rc.1'
      checksums-sha256: b280ecb4122b02c0961638c0eb84bae6932af55193c3ea9ae2aa2b02ef8afa99
      github-token: ${{ github.token }}
  - run: shoutx --version
```

Replace `REVIEWED_FULL_COMMIT_SHA` with a reviewed 40-character commit. This
placeholder is not a published action version. CLI and action versions are
independent. Run setup before untrusted steps.

`shoutx-version` is required and must be an exact canonical version without
`v`, whitespace, build metadata, ranges, or aliases. Releases before
`0.3.0-rc.1` are unsupported. `checksums-sha256` optionally adds a trusted
workflow-local constraint on the entire checksum manifest; use lowercase hex.
`github-token` is optional and only sent on initial fixed-origin API requests.
Without it, unauthenticated API rate limits can cause installation failure.

On success, the action sets the `version` output and adds a fresh installation
directory to PATH for subsequent steps. It requires existing absolute
`GITHUB_PATH` and `GITHUB_OUTPUT` files. Nothing is printed on success; failure
prints only `setup-shoutx: installation failed` to stderr and exits nonzero.

The native GitHub-hosted matrix covers Linux x86-64/ARM64, macOS x86-64/ARM64,
and Windows x86-64. The action uses the runner's Node 24 runtime. Container
jobs, self-hosted runners, GHES, ARC, proxies, and other architectures have no
support guarantee. Windows runner paths must be drive-absolute; UNC and device
paths are deliberately outside this installer's supported subset.

The installer checks repository identity, immutable release metadata, API
asset digests, the checksum manifest, the archive, and exact `--version` output.
It does not verify artifact attestations. No persistent cache or runtime npm
installation is used. See [the security contract](docs/security.md) for limits
and failure behavior.

## Development

Use Node 24 (the exact CI version is in `.node-version`). There are no npm
dependencies, including build dependencies.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm run lint
npm test
```

`build` deterministically wraps the four production modules into
`dist/bundle.cjs` and copies the minimal launcher to `dist/index.cjs`. Tests
import those same modules; only HTTP transport is substituted in hostile
network tests. The action entry point always uses the fixed production client.
CI compares generated files byte-for-byte, checks syntax, runs adversarial
tests and CodeQL, and installs a real digest-pinned CLI release on all five
native runners. See [release procedure](docs/release.md).

The accepted [setup action design](https://github.com/send/shoutx/blob/fb6c5beaff2449901250fe4ced950d7ffaaabcc6/docs/decisions/official-setup-action.md)
defines the cross-repository security constraints. The CLI repository owns the
[release artifact contract](https://github.com/send/shoutx/blob/fb6c5beaff2449901250fe4ced950d7ffaaabcc6/docs/release.md).
