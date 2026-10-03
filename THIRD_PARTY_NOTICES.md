# Third-party notices

PADSwitcher source is licensed under [MIT](LICENSE).

- **Be Vietnam Pro**: distributed under the SIL Open Font License 1.1.
  The font license and attribution are included in [src/assets/fonts](src/assets/fonts).
- **Electron**, **electron-builder**, **jsonc-parser**, **ws** and the development
  dependencies retain their respective licenses. Exact versions are recorded in
  `package-lock.json`; dependency licenses are included in installed packages.
- Electron's Chromium and other bundled components have their own notices in the
  Windows build. Packaging preserves Electron's license resources.
- Codex is a separate OpenAI product. PADSwitcher does not bundle the Codex binary;
  it uses a locally installed compatible version. OpenAI and Codex names belong to
  their respective owners. PADSwitcher is an independent project.

The model router was informed by the request-fallback approach in 9router;
PADSwitcher implements its own relay without copying its provider translation layer.
