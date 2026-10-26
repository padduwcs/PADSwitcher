# Releasing the Unix edition

This guide applies to `feature/cross-platform` only. Windows releases follow
[the Windows procedure](https://github.com/padduwcs/PADSwitcher/blob/main/docs/RELEASING.md).
Unix tags use `unix-v…`; releases are previews with `latest=false`.

## Prepare

1. Select the next unused `1.19.1-unix.N` version (or the intended new Unix base).
   Update both package files with `npm version` and `--no-git-tag-version`.
2. Update the Unix changelog, current install guides, both READMEs and docs index.
   `npm run check:docs` catches stale active download links.
3. Update `UNIX-RELEASE-NOTES.md` with user-visible behavior and tested limits.
   Keep `{{VERSION}}` and `{{TAG}}` placeholders in asset links.
4. Run the checks and packaging steps in [DEVELOPMENT.md](DEVELOPMENT.md).
5. Commit only source/docs, then push `feature/cross-platform` and wait for all
   source CI checks. Do not publish generated local files directly from the checkout.

The release commit must have passed CI and must not contain `[skip ci]`. A tag
on a skipped commit can skip the tag workflow too. Published tags/releases are
immutable; choose a new version to fix a published build.

## Publish

From the tested release commit, derive the tag from the package version:

```bash
pad_version=$(node -p "require('./package.json').version")
pad_tag="unix-v$pad_version"
pad_commit=$(git rev-parse HEAD)
git tag "$pad_tag" "$pad_commit"
git push origin "$pad_tag"
```

Only do this after confirming that the tag is unused and `pad_commit` is the
commit whose CI passed. Use an explicit tested SHA instead of HEAD when later
documentation commits have been added.

The Unix release workflow:

- checks shared-core behavior on Windows and builds/tests Linux x64/ARM64 and
  macOS Intel/Apple Silicon;
- verifies native quota/context/tool continuity, sandboxed packaging, installed
  deb/DMG startup and Mac ZIP signatures;
- produces eight installers with sidecar SHA-256 files;
- adds Vietnamese/English installation guides and `SHA256SUMS.txt`;
- verifies all **19 assets** in a draft against GitHub names, sizes and digests;
- publishes the prerelease while keeping the Windows **Latest** release intact.

A rerun can resume a draft. The workflow refuses to overwrite a public release.

## Verify the public release

- Confirm all build/publish jobs passed and the release is public, prerelease,
  and separate from Windows Latest.
- Check the eight download links anonymously; compare downloaded installer and
  guide hashes with the catalog and GitHub metadata.
- Inspect the downloaded package version and relevant runtime sources, and run
  the packaged smoke check in an isolated app-data root.
- Record results in [UNIX-VALIDATION.md](UNIX-VALIDATION.md).
- Mark superseded previews with a link to the current Unix build. Keep published
  tags/assets for provenance; clean duplicate local downloads instead.

No source build, test or release step should access saved accounts or consume
model/reset/Kaggle quota. Real-account acceptance is separate and explicitly authorized.
