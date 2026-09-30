# Action release procedure

No action release exists yet. The initial implementation PR does not authorize
a release. Action and CLI versions are independent.

Before creating a full SemVer action tag:

1. Finish independent security and bundle review, resolve all valid findings,
   and merge the reviewed implementation with maintainer authorization.
2. Require CI and CodeQL success for the exact main commit. CI must exercise
   all five native runners against a supported real shoutx release, including
   the manifest pin, exact installed version, output and subsequent-step PATH.
3. Confirm immutable releases are enabled for `send/setup-shoutx`.
4. Confirm package version and tag match. Create `vVERSION` on that reviewed
   commit only with explicit maintainer direction.

The release workflow reruns tests, syntax checks and byte-for-byte bundle
verification from the committed lockfile, checks successful main CI and CodeQL,
and publishes a draft only after those checks. The resulting release must
report `immutable: true`. A failure of that assertion is a release incident;
do not recommend that version. Use a new version instead of modifying a
published immutable tag. Prereleases do not become GitHub's latest release.

Release tags include `dist/` and the lockfile; consumers do not run npm.
There are no npm dependencies at present. New dependencies require a concrete
security or portability benefit, lockfile/license/advisory review, and review
of the generated bundle. Moving major tags are not created by this workflow.
Recommend an exact full commit SHA or an immutable full-version release tag.

After the first action release, adoption in `send/shoutx` is a separate PR
pinning the action commit, CLI version and manifest digest. Preserve an
independent build/bootstrap path in the CLI repository.
