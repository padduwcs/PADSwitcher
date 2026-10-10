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

- JetBrains setup copies the user's installed **@agentclientprotocol/codex-acp 2.1.1**
  standalone adapter into the private app-data runtime. The adapter is Apache-2.0
  licensed; its original `LICENSE` is copied alongside it as `LICENSE-codex-acp.txt`.
  It is not bundled into the PADSwitcher download. See the
  [upstream project](https://github.com/agentclientprotocol/codex-acp).

The model router was informed by the request-fallback approach in 9router;
PADSwitcher implements its own relay without copying its provider translation layer.

The Kaggle feature uses user-installed Python, **kaggle** and **kagglesdk**;
these packages are not bundled into the Windows executable. They retain their
upstream licenses and notices. Kaggle is a separate service; PADSwitcher is an
independent project. See the [official CLI](https://github.com/Kaggle/kaggle-cli).
