# setup-shoutx

Install verified [shoutx](https://github.com/send/shoutx) releases in GitHub Actions.

Status: implementation in progress; no action release is available yet.

The accepted [setup action design](https://github.com/send/shoutx/blob/fb6c5beaff2449901250fe4ced950d7ffaaabcc6/docs/decisions/official-setup-action.md)
defines the cross-repository security constraints. The CLI repository owns the
[release artifact contract](https://github.com/send/shoutx/blob/fb6c5beaff2449901250fe4ced950d7ffaaabcc6/docs/release.md).
