# Releasing PADSwitcher

**Unix branch:** follow [UNIX.md](UNIX.md#github-và-phát-hành). Use only
`unix-v<package-version>` tags. Unix releases are prereleases with `latest=false`.
The Windows procedure below applies only to `main` and must not be used here.

Releases are portable Windows executables published from a version tag. The tag, `package.json`, and `package-lock.json` versions must match.

## Prepare

1. Update the version with `npm version <version> --no-git-tag-version`.
2. Update `CHANGELOG.md`, `VALIDATION.md`, and user documentation.
3. Run the checks in [DEVELOPMENT.md](DEVELOPMENT.md), including the portable build and packaged smoke test.
4. Confirm `git status` contains only intended source and documentation changes.

Do not include generated helpers, `dist`, `artifacts`, credentials, gateway files, logs, or QA app data.

## Publish

Merge the release commit into `main`, wait for **Windows checks and portable build**, then create and push the matching tag:

```powershell
git tag -a v1.20.0 -m "PADSwitcher 1.20.0"
git push origin v1.20.0
```

The **Publish Windows release** workflow repeats the isolated checks, builds the portable executable, verifies the packaged app, generates its SHA-256 file, and publishes both assets to GitHub Releases.

For a curated release description, create the GitHub release for the tag with notes from `CHANGELOG.md` before the workflow finishes. The workflow detects the release and uploads or replaces only the two generated assets.

## Verify

- The GitHub release is public and marked latest.
- The executable and `.sha256` filenames contain the expected version.
- `Get-FileHash` matches the published checksum.
- The release page links to the correct commit/tag.
- The README release badge and download link resolve to the new version.
- A clean-machine launch shows the expected version and first-run flow.

The executable is currently unsigned. Do not state otherwise until code signing is part of the verified build.
