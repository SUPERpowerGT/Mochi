# Publishing Mochi

This document records the full path for publishing Mochi as a real VS Code Marketplace extension, plus the follow-up workflow for version updates.

## Current Extension Identity

Mochi is published under:

```text
zee.mochi-local-agent
```

The identity comes from these fields in `package.json`:

```json
{
  "publisher": "zee",
  "name": "mochi-local-agent",
  "version": "0.0.5"
}
```

Marketplace page:

```text
https://marketplace.visualstudio.com/items?itemName=zee.mochi-local-agent
```

Publisher management page:

```text
https://marketplace.visualstudio.com/manage/publishers/zee/extensions/mochi-local-agent/hub
```

GitHub repository:

```text
https://github.com/SUPERpowerGT/Mochi
```

## Useful Links

- VS Code extension publishing guide: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- VS Code extension manifest reference: https://code.visualstudio.com/api/references/extension-manifest
- Visual Studio Marketplace publisher portal: https://marketplace.visualstudio.com/manage
- Azure DevOps: https://dev.azure.com/
- Azure DevOps token settings: https://dev.azure.com/_usersSettings/tokens
- Marketplace extension page: https://marketplace.visualstudio.com/items?itemName=zee.mochi-local-agent
- Marketplace extension management hub: https://marketplace.visualstudio.com/manage/publishers/zee/extensions/mochi-local-agent/hub

## Marketplace Listing Configuration

Most public-facing Marketplace information is configured in the repository, not in the Marketplace web UI.

`package.json` controls:

- Extension id: `publisher` + `name`
- Display name: `displayName`
- Short description: `description`
- Marketplace icon: `icon`
- Header banner: `galleryBanner`
- Preview label: `preview`
- Categories: `categories`
- Search terms: `keywords`
- Repository, issue, and homepage links
- Commands, panels, activation events, and contribution points

`README.md` controls:

- The main Marketplace detail page content
- Feature descriptions
- Usage instructions
- Demo links and images

`LICENSE` controls:

- License metadata shown by Marketplace.

Mochi currently uses:

```json
{
  "icon": "media/mochi_icon.png",
  "galleryBanner": {
    "color": "#111827",
    "theme": "dark"
  },
  "preview": true
}
```

The Marketplace icon should be a PNG image. Mochi uses `media/mochi_icon.png`, generated from the existing SVG logo at 128x128.

## User Installation and First Run

Users install Mochi from:

```text
https://marketplace.visualstudio.com/items?itemName=zee.mochi-local-agent
```

After installation, users should open the VS Code Command Palette and run:

```text
Mochi: Configure Model Credentials
```

This command asks for:

- Provider: OpenAI, Gemini, or OpenAI-compatible
- API key
- Base URL
- Model
- API format

The API key is stored in VS Code Secret Storage. Non-sensitive provider settings are stored in VS Code Settings under `mochi.*`.

Then users run:

```text
Local Agent: Open Chat
```

If the user opens Mochi before configuring an API key, the extension prompts them to configure credentials. If they dismiss the prompt and try to send a message, Mochi shows an in-chat error and prompts for configuration again.

## User Memory Controls

Mochi exposes local memory controls through the VS Code Command Palette:

- `Mochi: Open Memory Controls`
- `Mochi: Toggle Current Window Private Mode`
- `Mochi: Toggle Current Window Memory Isolation`
- `Mochi: Toggle Current Window Persistent Memory Reads`
- `Mochi: Delete Current Window Artifacts`
- `Mochi: Clear Current Window Memory`
- `Mochi: Clear Current Session Summary Memory`
- `Mochi: Clear Current Window Working State`
- `Mochi: Clear Current Workspace Memory`
- `Mochi: Clear User Memory`
- `Mochi: Clear Current Trace Memory`
- `Mochi: Clear All Local Memory`

Current-window memory isolation prevents Mochi from reading memory from other sessions when preparing a run.

Disabling persistent memory reads prevents Mochi from reading stored session summaries, long-term memory, workspace memory, user preferences, and recent session summaries for the current window.

Private current-window mode makes Mochi use only the current window context and skip saved memory reads until the mode is turned off. Deleting current-window artifacts removes that window's chat, working state, trace, and routing artifacts. Clearing current-window memory removes summaries, working state, traces, routing state, and focused pointers for the current session while keeping the visible chat session and messages. The granular clear commands target one internal category at a time during the transition. Clearing all local memory resets local Mochi memory categories while keeping chat sessions and messages.

The chat panel exposes Private mode as a direct current-window toggle. The slash menu is intentionally small and currently focuses on high-frequency shortcuts:

- `/help`
- `/new`
- `/memory`
- `/clear-private-window`
- `/model`

The target memory model is documented in `doc/memory-model.md` and `doc/memory-model.zh.md`. It has exactly three layers: Current Window Memory, Long-Term Memory, and Runtime Trace. User preference, project fact/convention, decision, and window archive are Long-Term Memory record kinds, not separate layers. Non-private window archive/delete should create a `kind: "window_archive"` Long-Term Memory record unless the user explicitly discards without archive. Natural-language chat cannot directly delete memory; deletion must go through Memory Controller confirmation. The implementation direction is documented in `doc/memory-v2.md`.

## One-Time Setup From Zero

### 1. Prepare `package.json`

Confirm the extension has a real Marketplace identity:

```json
{
  "name": "mochi-local-agent",
  "displayName": "Mochi",
  "publisher": "zee"
}
```

The final Marketplace id is:

```text
zee.mochi-local-agent
```

### 2. Create a Marketplace Publisher

Open:

```text
https://marketplace.visualstudio.com/manage
```

Create or select the publisher:

```text
zee
```

If the publisher id is different, update `publisher` in `package.json` before packaging or publishing.

### 3. Create an Azure DevOps Personal Access Token

Open Azure DevOps:

```text
https://dev.azure.com/
```

If needed, create an organization. Then open token settings:

```text
https://dev.azure.com/_usersSettings/tokens
```

Create a new token:

- Name: `mochi-vsce`
- Expiration: short-lived, such as 30 or 90 days
- Scopes: `Custom defined`
- Scope to select: `Marketplace -> Manage`

Do not use `Full access` unless there is no other option. If `Full access` is used temporarily, delete the token after publishing.

The token is shown only once. Copy it immediately and keep it private.

### 4. Login With `vsce`

From the repository root:

```bash
cd /Users/zee/xuziyi/projects/Mochi
npx @vscode/vsce login zee
```

Paste the Personal Access Token when prompted. The terminal may not visually show pasted characters; press Enter after pasting.

### 5. Package a Local VSIX

```bash
npm install
npm run package:vsix
```

This creates:

```text
mochi-local-agent-<version>.vsix
```

Install it locally for a smoke test:

```bash
code --install-extension mochi-local-agent-<version>.vsix
```

Then open VS Code Command Palette and run:

```text
Local Agent: Open Chat
```

### 6. Publish to Marketplace

```bash
npm run publish:marketplace
```

Successful output should include:

```text
DONE  Published zee.mochi-local-agent v<version>.
```

The extension may take a few minutes to appear in Marketplace search.

For normal follow-up releases, prefer:

```bash
npm run release:marketplace
```

This bumps the patch version and publishes it in one command, which avoids Marketplace's "version already exists" error.

## Updating Mochi Later

### 1. Make and Test Changes

Implement changes locally, then smoke-test the extension from VS Code's Extension Development Host or by installing a local VSIX.

### 2. Bump Version

For normal small updates:

```bash
npm version patch
```

Examples:

```text
0.0.1 -> 0.0.2
0.0.2 -> 0.0.3
```

For larger changes:

```bash
npm version minor
```

For breaking changes:

```bash
npm version major
```

`npm version` updates both `package.json` and `package-lock.json`.

By default, `npm version patch`, `minor`, and `major` also create a git commit and a git tag such as `v0.0.2`. Because of that, npm requires the git working tree to be clean first.

If there are uncommitted changes, this command fails with:

```text
npm error Git working directory not clean.
```

There are two valid ways to handle this.

Recommended git-tagged release flow:

```bash
git add .
git commit -m "Prepare Marketplace release"
npm version patch
npm run publish:marketplace
```

This creates a normal release commit and tag.

Quick release flow:

```bash
npm run release:marketplace
```

This runs `npm version patch --no-git-tag-version`, then publishes. It updates `package.json` and `package-lock.json`; it does not create a git commit or tag. Use this when you want to publish quickly while the working tree already contains release-related changes.

### 3. Package and Smoke-Test

```bash
npm run package:vsix
code --install-extension mochi-local-agent-<new-version>.vsix
```

Open the command palette in VS Code and run:

```text
Local Agent: Open Chat
```

### 4. Publish the New Version

```bash
npm run publish:marketplace
```

Users who installed Mochi from the Marketplace receive updates through VS Code's normal extension update flow.

## Common Issues

### `code: command not found`

Install the VS Code shell command:

1. Open VS Code.
2. Press `Cmd + Shift + P`.
3. Run `Shell Command: Install 'code' command in PATH`.
4. Open a new terminal.

Alternative: in VS Code, open Extensions, select `...`, then choose `Install from VSIX...`.

### `Local Agent: Open Chat` Fails in Terminal

`Local Agent: Open Chat` is a VS Code command, not a shell command. Open it from VS Code Command Palette with `Cmd + Shift + P`.

### Marketplace Scope Is Missing in PAT Creation

Click `Show all scopes` in the token creation dialog. If `Marketplace` still does not appear, the account or organization may restrict PAT scopes. Try a personal Microsoft account and a personal Azure DevOps organization.

### README SVG Error

`vsce` rejects SVG images referenced from README content. Use PNG/JPG/GIF images in README Marketplace content. SVG files can still be used as VS Code contribution icons when allowed by VS Code.

### Version Already Exists

Marketplace versions are immutable. If publishing fails because the version already exists:

```bash
npm run release:marketplace
```

This bumps to the next patch version and publishes. Use plain `npm version patch` plus `npm run publish:marketplace` instead if the git working tree is clean and you want npm to create the release commit and tag.

### Large File Count Warning

`vsce` currently warns that Mochi includes many JavaScript files from `node_modules`. This does not block publishing. A future improvement is to bundle the extension before publishing.

## Release Checklist

- Confirm `publisher` is `zee`.
- Confirm `name` is `mochi-local-agent`.
- Run `npm run package:vsix`.
- Install the generated VSIX locally and run `Local Agent: Open Chat`.
- Run `npm run release:marketplace` for the normal quick release path.
- Or run `npm version patch` and `npm run publish:marketplace` for a git-tagged release.
- Check the Marketplace page after a few minutes.
