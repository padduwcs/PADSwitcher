# Releasing PADSwitcher

Releases are portable Windows executables published from a version tag. The tag, `package.json`, and `package-lock.json` versions must match.

## Prepare

1. Update the version with `npm version <version> --no-git-tag-version`.
2. Update `CHANGELOG.md`, `VALIDATION.md`, user documentation and bilingual release notes in `docs/releases/v<version>.md`.
3. Run the checks in [DEVELOPMENT.md](DEVELOPMENT.md), including the portable build, ASAR smoke and `npm run smoke:executables`.
4. Confirm `git status` contains only intended source and documentation changes.

Do not include generated helpers, `dist`, `artifacts`, credentials, gateway files, logs, or QA app data.

## Publish

Merge the release commit into `main`, wait for **Windows checks and portable build**, then create and push the matching tag:

```powershell
git tag -a v1.20.1 -m "PADSwitcher 1.20.1"
git push origin v1.20.1
```

The **Publish Windows release** workflow repeats the isolated checks, builds the portable executable, verifies the packaged app, generates its SHA-256 file, and publishes both assets to GitHub Releases.

The workflow creates or resumes a draft, checks both uploaded assets against local
SHA-256 digests, sizes and names, then publishes it as Latest. A rerun refuses to
overwrite a published release. The tag must point to a commit on main.

For curated notes, edit the draft before publication or edit the public release
notes afterward; do not pre-create a public release before asset verification.

## Verify

- The GitHub release is public and marked latest.
- The executable and `.sha256` filenames contain the expected version.
- `Get-FileHash` matches the published checksum.
- The release page links to the correct commit/tag.
- The README release badge and download link resolve to the new version.
- A clean-machine launch shows the expected version and first-run flow.

The executable is currently unsigned. Do not state otherwise until code signing is part of the verified build.
