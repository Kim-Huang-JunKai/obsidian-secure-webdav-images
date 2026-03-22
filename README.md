# Secure WebDAV Images

Secure WebDAV Images is an Obsidian plugin that:

- uploads note images to a dedicated WebDAV image folder
- rewrites images as secure `secure-webdav` code blocks
- renders those remote images in notes without public image URLs
- syncs the rest of the vault to a separate remote notes folder
- optionally keeps Markdown notes in a lazy on-demand local mode
- can capture original `http/https` article images into WebDAV so notes no longer depend on the source site

Chinese installation guide: [INSTALL.zh-CN.md](./INSTALL.zh-CN.md)

## What It Solves

If your vault contains many screenshots and pasted images, mobile devices become heavy very quickly. This plugin keeps the vault lightweight by separating only images to a dedicated remote folder, while notes and other non-image attachments keep their original paths and are synced separately.

## Core Behavior

- Images are uploaded to the remote image folder and then removed locally.
- Notes keep a secure code-block reference instead of a local image attachment.
- Notes and non-image attachments are synced to a separate remote notes folder.
- Sync is a reconciliation sync:
  it compares local and remote state, uploads new or changed files, and deletes extra remote files.
- Remote images that are no longer referenced by any note are deleted automatically during cleanup.

## Settings

### Connection

- `WebDAV base URL`
  Example: `http://your-webdav-host:port`
- `Username`
  Your WebDAV account name.
- `Password`
  Hidden by default. You can toggle show or hide in the settings panel.
- `Image remote folder`
  Dedicated remote folder for images, for example `remote-images`
- `Remote notes folder`
  Dedicated remote folder for notes and non-image attachments, for example `remote-notes`

### Sync

- `Auto sync frequency`
  The reconciliation sync interval in minutes.
  Set `0` to disable automatic sync.
- `Note local retention mode`
  - `Full local`: Markdown notes always stay on the device.
  - `Lazy notes`: stale Markdown notes can be replaced with a local placeholder and restored from the remote notes folder when opened.
- `Note eviction days`
  Only used in `Lazy notes` mode. Notes not opened within this number of days may be replaced with local placeholders after sync.

### One-time tools

- `Run migration`
  Scans the whole vault, uploads original Obsidian local image embeds such as `![]()` and `![[...]]`, rewrites them to `secure-webdav` code blocks, and removes the migrated local image files when safe.

## Commands

The plugin currently exposes these commands in Obsidian:

### `Upload local images in current note to WebDAV`

Use this when a note already contains normal local image embeds and you want to convert only the current note.

What it does:

- scans the current note
- finds local image embeds like `![]()` and `![[...]]`
- uploads those images to the remote image folder
- rewrites them as `secure-webdav` code blocks
- deletes the local image files after a successful upload

### `Test WebDAV connection`

Use this to verify the WebDAV server before real usage.

What it does:

- creates a temporary probe file
- uploads it with `PUT`
- reads it back with `GET`
- deletes it with `DELETE`

If this command succeeds, the basic WebDAV read/write/delete chain is available.

### `Sync vault content to WebDAV`

Use this to synchronize notes and non-image attachments.

What it does:

- compares the local vault with the remote notes folder
- uploads new or changed files
- skips unchanged files
- deletes remote files that no longer exist locally
- cleans up extra remote directories when possible
- also clears orphaned remote images that are no longer referenced by any note

This is not a simple upload command. It is a reconciliation sync with local state as the source of truth.

## Recommended Workflow

### Daily image workflow

1. Paste or drag an image into a note.
2. The plugin uploads the image automatically.
3. The local image file is removed after upload.
4. The note keeps a `secure-webdav` code block reference.
5. The image can still be viewed inside Obsidian.

### Existing note migration workflow

1. Open plugin settings.
2. Click `Run migration`.
3. Wait for the vault-wide scan to complete.
4. Review a few notes to confirm the old local image embeds were converted.
5. Run `Sync vault content to WebDAV` to reconcile notes and attachments.

### Manual sync workflow

1. Finish editing notes.
2. Click `Sync now` in plugin settings, or run `Sync vault content to WebDAV`.
3. Check the sync status panel for the latest result.

## Storage Format

New remote images are stored as secure code blocks:

````md
```secure-webdav
path: remote-images/example.png
alt: Example image
```
````

This format is easier to control and migrate than old HTML span-based placeholders.

## Notes About Sync Scope

- Images are separated to the image remote folder only.
- Notes and non-image attachments are synced to the remote notes folder.
- `.obsidian` is skipped.
- The plugin's own directory is skipped.
- Image files are skipped from content sync because they are handled by the image pipeline.

## Notes About Lazy Notes

In `Lazy notes` mode:

- Markdown notes can be replaced locally with a lightweight placeholder
- opening that note restores the full content from the remote notes folder
- this helps reduce storage pressure on mobile devices

This mode currently targets Markdown notes only.

## Development

```bash
npm install
npm run build
npx tsc --noEmit
```

## Local-only Files

The following files are intentionally not tracked:

- `data.json`
- `node_modules/`

`data.json` contains local secrets and machine-specific state, so it should not be committed.
