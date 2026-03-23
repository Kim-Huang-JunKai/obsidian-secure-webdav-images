# Secure WebDAV Images

Secure WebDAV Images is an Obsidian plugin that separates images from the rest of the vault:

- note images are uploaded to a dedicated WebDAV image folder
- notes and non-image attachments are synced to a separate remote notes folder
- Markdown notes can optionally use a lazy local placeholder mode to reduce local storage pressure
- pasted article images from `http/https` sources can be captured into your own WebDAV storage

Chinese installation guide: [INSTALL.zh-CN.md](./INSTALL.zh-CN.md)

## Before You Install

This plugin is designed for users who want:

- lighter mobile vault storage
- private image hosting through WebDAV instead of public image URLs
- a split model where images and notes are stored in different remote folders

This plugin may **not** be suitable if you need:

- Git-level merge behavior
- zero-risk multi-device conflict handling under all network conditions
- guaranteed offline access to every note on every device

If you are unsure, start with:

- `Note local retention mode = Full local`
- manual sync first
- lazy notes only after you confirm your WebDAV remote is stable

## Storage Model

The plugin uses two separate remote folders:

- `Image remote folder`
  Stores uploaded images only.
- `Remote notes folder`
  Stores Markdown notes and non-image attachments.

### Image storage

- Local note images are uploaded to the remote image folder.
- After upload succeeds, the local image file is removed.
- Notes are rewritten to secure `secure-webdav` code blocks.

### Note storage

- In `Full local` mode, notes stay on the device.
- In `Lazy notes` mode, stale Markdown notes can be replaced locally by a lightweight placeholder.
- The **remote notes folder always stores the full note body**.
- A lazy placeholder is **never allowed to upload as remote note content**.

## Important Safety Notes

### Lazy notes do not replace the remote source of truth

In lazy mode:

- the server keeps the full Markdown content
- the local device may keep only a placeholder
- the placeholder is only a local storage optimization

### If remote note content goes missing

The plugin uses a cautious two-step rule:

1. The first confirmation keeps the local placeholder and refuses to upload the placeholder as note content.
2. If the remote content is confirmed missing again, the local broken placeholder is removed automatically.

This means the plugin now aims to avoid both of these failure modes:

- uploading a placeholder and accidentally overwriting the remote full note
- keeping a broken placeholder forever after the remote content has already disappeared

### Delete propagation is tombstone-based

Normal note deletion is no longer inferred only from timestamps.

The plugin writes an explicit remote deletion tombstone and prefers that tombstone during reconciliation. A local note is deleted only when the tombstone is authoritative and the local copy has not changed since the last successful sync.

## Recent Safety Fixes In 0.0.8

Version `0.0.8` tightened several high-risk paths:

- lazy placeholders are blocked from uploading as remote note bodies
- remote deletion now uses tombstones with remote version fingerprints
- unchanged local notes can follow an authoritative tombstone
- locally modified notes are protected from old tombstones
- lazy note eviction verifies remote round-trip readability before replacing the local body with a placeholder
- broken lazy placeholders are no longer kept forever when the remote content is repeatedly confirmed missing

## Settings

### Connection

- `WebDAV base URL`
- `Username`
- `Password`
- `Image remote folder`
- `Remote notes folder`

### Sync

- `Auto sync frequency`
  Set minutes. Use `0` to disable auto sync.
- `Note local retention mode`
  - `Full local`
  - `Lazy notes`
- `Note eviction days`
  Used only in `Lazy notes` mode.

### One-time tools

- `Run migration`
  Migrates original Obsidian local image embeds such as `![](...)` and `![[...]]` into secure remote image references.

## Commands

### `Upload local images in current note to WebDAV`

Converts only the current note's local image embeds:

- uploads images to the remote image folder
- rewrites embeds to `secure-webdav` code blocks
- removes local image files after successful upload

### `Test WebDAV connection`

Checks the WebDAV read/write/delete chain by performing:

- `PUT`
- `GET`
- `DELETE`

### `Sync vault content to WebDAV`

Runs reconciliation sync for notes and non-image attachments:

- uploads new or changed files
- downloads remote changes
- skips unchanged files
- deletes remote note files that were explicitly removed
- removes extra remote directories when safe

## What Sync Does Not Promise

- It is not a Git replacement.
- It does not provide line-level merge resolution.
- Remote image cleanup is currently conservative for safety and may leave redundant files behind.
- If your remote storage is unreliable, do not rely on `Lazy notes` until you have verified the remote thoroughly.

## Recommended Workflow

1. Configure WebDAV and remote folders.
2. Run `Test WebDAV connection`.
3. Migrate old local image embeds if needed.
4. Use `Full local` mode first.
5. After validating remote note integrity, optionally enable `Lazy notes`.

## Development

```bash
npm install
npm run build
npx tsc --noEmit
```

## Local-only Files

These are intentionally not tracked:

- `data.json`
- `node_modules/`

`data.json` contains local machine state and secrets and must not be committed.
