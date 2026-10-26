# Repository maintenance

## Maintained branches

| Branch | Purpose | Release channel |
| --- | --- | --- |
| `main` | Stable Windows edition | `v…`, Windows Latest |
| `feature/cross-platform` | Linux/macOS edition | `unix-v…`, prerelease |

Keep these names stable: clone instructions, CI and published documentation link
to them. A feature branch is temporary; the maintained Unix branch is not an
abandoned feature. Use one checkout and [switch branches](DEVELOPMENT.md#one-folder-and-two-branches)
when working on either edition.

Delete a completed topic branch after its changes are merged into its intended
base, or after explicitly closing/deferring its PR. Check for unique user work
before deleting an unmerged branch. Do not require unrelated editions to contain
one another's implementation. Automatic branch deletion after merging is enabled.

## Dependency updates

Dependabot is configured from `.github/dependabot.yml` on the **default branch**.
Its Windows entries and explicitly targeted Unix entries are separate. Keep the
Unix branch's copy aligned with that configuration.

Monthly grouped patch/minor test/build updates and grouped workflow updates
reduce bot noise. Electron major upgrades require a dedicated compatibility
review; patch/minor security maintenance remains available. CI success is
required before merging; runtime major upgrades do not belong in a docs cleanup.

### Decisions on 2026-10-27

- [PR #7](https://github.com/padduwcs/PADSwitcher/pull/7): merged `setup-go` v7,
  limited to Unix workflows; all five platform checks had passed.
- [PR #9](https://github.com/padduwcs/PADSwitcher/pull/9): merged jsdom 30.1.3,
  limited to test dependencies/lockfile; all five checks had passed.
- [PR #8](https://github.com/padduwcs/PADSwitcher/pull/8): Electron 45.0.0 deferred
  and closed; retain the verified 44.9.3 runtime until a separate upgrade review.
- Windows dependency PRs #5 and #6 remain open and outside this cleanup. No Windows
  runtime, lockfile, workflows or released assets are changed by the docs update.
- The three resolved Unix bot branches are removed. The two maintained branches
  and the two open Windows bot branches remain intentional.

## Documentation ownership

- Keep root READMEs, the docs index, Contributing and Support aligned between
  the maintained branches. Root pages are an entry point for all platforms.
- Unix install/development/release/routing guides live on the Unix branch;
  Windows source instructions live on `main`. Use explicit cross-branch links.
- Current validation is in `UNIX-VALIDATION.md`; prior detailed reports belong
  in `archive/`. Keep changelogs and published version history.
- `npm run check:docs` checks relative files/anchors, local GitHub branch links,
  current Unix download versions and documented Unix npm commands.
- Disabled Windows live scripts have been removed only from the Unix branch.
  Windows implementations/adapters and regression tests remain maintained.

## Generated local files

`node_modules/`, `dist-unix/`, `artifacts/`, generated helpers and preview output
are ignored by Git. They do not inflate the public source checkout. Account data
lives outside those build folders and is not part of cleanup.

Keep:

- the current release installers and their matching checksum files;
- current release verification metadata and a small set of current UI captures;
- the configured developer toolchains and the Kaggle SDK test environment.

Remove when no process uses them:

- superseded local installers and duplicate downloaded copies;
- unpacked build applications after packaging checks;
- completed disposable native protocol homes, old logs and audit-only captures.

Rebuild before packaged tests that need an unpacked application. Routine native
protocol checks remove their own temporary home. Never use a broad home-folder
cleanup command or delete `~/.codex` / application account data to tidy the repo.
Published releases/tags stay available; avoid force-pushing or rewriting history.
