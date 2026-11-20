# setup-shoutx

Install verified [shoutx](https://github.com/send/shoutx) releases in GitHub Actions.

The action is available as [v0.1.0](https://github.com/send/setup-shoutx/releases/tag/v0.1.0).

## Usage

Pin the published action commit, CLI version and checksum manifest independently:

```yaml
permissions:
  contents: read
steps:
  - uses: send/setup-shoutx@eb61a2361c6c0e0d37ab9cca1c50e998b4a94c24 # v0.1.0
    with:
      shoutx-version: '0.3.0'
      checksums-sha256: fe1055022c9454a344e2b2db52b99eaf5d787213c550888029b4ad424470185d
      github-token: ${{ github.token }}
  - run: shoutx --version
```

CLI and action versions are independent. The digest above pins the
`SHA256SUMS` manifest for shoutx v0.3.0; update it when selecting another CLI
release. Run setup before untrusted steps.

`shoutx-version` is required and must be an exact canonical version without
`v`, whitespace, build metadata, ranges, or aliases. Releases before
`0.3.0-rc.1` are unsupported. `checksums-sha256` optionally adds a trusted
workflow-local constraint on the entire checksum manifest; use lowercase hex.
`github-token` is optional and only sent on initial fixed-origin API requests.
Without it, unauthenticated API rate limits can cause installation failure.

On the development branch, the optional `provider` input selects the CLI to
install: `github-actions` (default) or `azure-pipelines`. This input will be
available in the next action release. Both choices run the installer inside
GitHub Actions. Published CLI versions through 1.0.0 have only a GitHub Actions
binary; selecting Azure for one of those versions fails before downloading.
Later CLI versions use the provider-specific release archives.

On success, the action sets the `version` output and adds a fresh installation
directory to PATH for subsequent steps. It requires existing absolute
`GITHUB_PATH` and `GITHUB_OUTPUT` files. Nothing is printed on success; failure
prints a fixed diagnostic to stderr and exits nonzero.

The native GitHub-hosted matrix covers Linux x86-64/ARM64, macOS x86-64/ARM64,
and Windows x86-64. The action uses the runner's Node 24 runtime. Container
jobs, self-hosted runners, GHES, ARC, proxies, and other architectures have no
support guarantee. Windows runner paths must be drive-absolute; UNC and device
paths are deliberately outside this installer's supported subset.

Successful installation does not expand the CLI's destination-specific support
scope. For mask and annotation commands, consult shoutx's
[current compatibility record](https://github.com/send/shoutx/blob/main/docs/compatibility/stdout-unicode-policy.md).

The installer checks repository identity, immutable release metadata, API
asset digests, the checksum manifest, the archive, and exact `--version` output.
It does not verify artifact attestations. No persistent cache or runtime npm
installation is used. See [the security contract](docs/security.md) for limits
and failure behavior.

## Azure Pipelines (development branch)

Use the external steps template with a GitHub service connection that can read
`send/setup-shoutx`. Pin the repository resource to a reviewed commit containing
the template. The alias `setupShoutx` is also used to check out the installer's
scripts. This example works with a published CLI on an Azure-hosted agent:

```yaml
pool:
  vmImage: ubuntu-24.04
resources:
  repositories:
    - repository: setupShoutx
      type: github
      endpoint: YOUR_GITHUB_SERVICE_CONNECTION
      name: send/setup-shoutx
      ref: YOUR_REVIEWED_40_CHARACTER_COMMIT
steps:
  - checkout: self
  - template: /azure-pipelines.yml@setupShoutx
    parameters:
      shoutxVersion: '1.0.0'
      provider: github-actions
      checksumsSha256: a6336c0e538c54e1fe4e35025983694e4f60ba9ab8aefda740796ab95ee13875
  - pwsh: shoutx --version
```

For a provider-split CLI release, set its exact version and manifest pin and
omit `provider` to install the Azure Pipelines binary. Until the first split
release, the hosted smoke test uses the explicit GitHub Actions selection above.
For authenticated GitHub metadata requests, pass a secret variable reference
such as `githubToken: $(setupGithubToken)`. The repository service connection
is used for checkout, independently of this optional download credential.

The template checks out its pinned resource to `$(Pipeline.Workspace)/setup-shoutx-tools`
and selects Node 24 using `UseNode@1`. Include an explicit `checkout: self`
if the job uses your own source. With multiple checkouts, use an explicit
checkout path if later steps depend on the location of your source. The CLI
is installed under the agent temp directory and added to PATH for subsequent
steps in the same job.

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
