# PlainMemo

English | [简体中文](./README.zh-CN.md)

> An Obsidian Memos plugin that stores each memo as an independent Markdown file.

Current stable release: [PlainMemo 2.1.1](https://github.com/MMKLN0/plain-memo/releases/tag/2.1.1)

PlainMemo is an unofficial fork of [BanyanSo/knomo](https://github.com/BanyanSo/knomo), continued under the upstream MIT license. It is not an official release channel for the upstream project and does not imply upstream endorsement or support.

PlainMemo keeps Knomo's card-based browsing, search, tags, links, review, and mobile input experience while making every card a self-contained Markdown file that remains useful outside Obsidian.

## How PlainMemo differs from upstream

| Area | Upstream Knomo | PlainMemo |
| --- | --- | --- |
| Storage unit | Memos in Daily Notes plus maintained monthly collections | One Markdown file per memo |
| Organization | Depends on Daily Notes and monthly Memos files | Recursively scans one or more configured folders; Daily Notes are not required |
| Filename | Carried by daily/monthly source files | `<first body line>_YYMMDDHHmm.md`, with ` (2)`-style collision suffixes |
| Content format | Upstream memo format and indexing workflow | The entire memo is ordinary Markdown; there is no separate title field, YAML frontmatter, or private marker |
| Import | Based on Daily Notes/monthly files | Prepares existing Markdown filenames in place and imports Flomo HTML/ZIP exports |
| Monthly archives | Maintained automatically | Removed |

This is an intentional storage-model change. Existing upstream Daily Notes and monthly Memos are not split into standalone files automatically. Back up your Vault before reorganizing existing files.

## Features

- Create, edit, delete, search, filter, and revisit standalone Markdown memos in a card flow.
- Recursively scan multiple Vault-relative folders and choose a separate default folder for new memos.
- Recognize `#tags` and Obsidian WikiLinks such as `[[Project note]]`.
- Render Markdown lists, tasks, quotes, images, and links.
- Collapse long cards after a configurable line threshold.
- Prepare existing Markdown files by adding recognizable creation-time filename suffixes without rewriting their content.
- Import Flomo HTML or ZIP exports while preserving memo timestamps, tags, web links, and optional attachments.
- Use optional Time buoy reminders from `@YYYY-MM-DD` in the memo body.
- Use desktop and mobile card browsing, editing, tag completion, and WikiLink insertion controls.

## File format

A memo whose body is:

```text
An idea after finishing this book
The second line may contain #reading and [[related notes]].
```

is stored as a file like:

```text
Memos/An idea after finishing this book_2607250855.md
```

- PlainMemo has no separate title field. The first line remains part of the Markdown body and is displayed on the card.
- When creating a memo, the first body line is sanitized and used only as the new filename stem.
- The `_YYMMDDHHmm` suffix records minute-level creation time and provides stable ordering. Same-minute filename conflicts use ` (2)`, ` (3)`, and so on.
- No YAML frontmatter is written; the Markdown file is the sole content source.
- The filename itself is not rendered as an additional card title. Manual filename or body edits become the current source of truth.

## Installation

PlainMemo is not currently published in the Obsidian Community Plugins directory.

### BRAT (recommended)

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's Community Plugins directory.
2. In BRAT settings, choose **Add Beta plugin** and enter `MMKLN0/plain-memo`.
3. Enable PlainMemo in Obsidian's Community Plugins settings.

BRAT installs and updates PlainMemo from the latest stable GitHub Release.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MMKLN0/plain-memo/releases/latest).
2. Place the three files in `<vault>/.obsidian/plugins/plain-memo/`.
3. Reload Obsidian and enable PlainMemo under Community Plugins.

## First-time setup

Open PlainMemo settings and find the standalone memo file section:

1. Fresh installs use `plain_memo` as both the initial scan folder and default save folder. It is created when you save the first memo.
2. Add, remove, or change scan folders relative to the Vault root, for example `Memos` or `Inbox/Cards`.
3. Choose a default save folder. New memos are written there, and the folder is automatically included in the scan scope.
4. Optionally adjust the long-card threshold (minimum 6 lines), mobile compact layout, and Time buoy reminders.

No personal paths are preconfigured. PlainMemo only treats files inside the configured scan folders as memos.

## Import existing Markdown files

Each configured scan folder has an import button with the tooltip: "Add a timestamp suffix so PlainMemo can recognize these filenames."

1. Add the folder containing the Markdown files to the scan scope.
2. Click the import button on that folder's settings row and confirm the preview.
3. PlainMemo renames unrecognized `.md` files from `<existing name>.md` to `<existing name>_YYMMDDHHmm.md` using the file's Vault creation time (`ctime`).

Already recognized files are skipped. Markdown content is not changed, name collisions receive a numbered suffix, and renaming goes through Obsidian's file manager so Vault links can be updated.

Files can also be prepared manually by using `<name>_YYMMDDHHmm.md` or `<name>_YYMMDDHHmm (2).md` inside a configured folder.

## Import Flomo data

PlainMemo settings also provide **Import Flomo data**:

1. Select a Flomo `.html` or `.zip` export.
2. Choose a destination folder inside the Vault.
3. Keep the default option to skip `.m4a` voice attachments, or change the audio and image attachment options as needed.
4. Review the detected memo and attachment counts, then start the import.

Each Flomo memo becomes a standalone PlainMemo Markdown file. The original body, first line, timestamp, tags, and web links are preserved. Imported attachments are stored under `<destination>/flomo-attachments`. Repeated imports reuse matching content and attachments instead of creating unnecessary duplicates.

## Data and privacy

Every memo is an ordinary Markdown file in your Vault. PlainMemo requires no account, relies on no external service, and does not actively upload note content. Plugin settings and rebuildable local state only support the UI and features; memo content remains in its own `.md` file.

## Development

```powershell
npm install
npm run typecheck
npm test
npm run build
```

For local testing, copy `main.js`, `manifest.json`, and `styles.css` into the test Vault plugin directory. Do not overwrite `data.json`; it contains each user's own settings.

## Credits and license

This repository is based on [BanyanSo/knomo](https://github.com/BanyanSo/knomo). Thanks to the upstream author for creating Knomo and releasing it under the MIT license. PlainMemo retains the original copyright and license notices; see [LICENSE](LICENSE).
