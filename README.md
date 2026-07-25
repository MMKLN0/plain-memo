# Knomo

English | [简体中文](./README.zh-CN.md)

> An Obsidian Memos plugin that stores each memo as an independent Markdown file.

This is an unofficial fork of [BanyanSo/knomo](https://github.com/BanyanSo/knomo), continued under the upstream MIT license. It is not an official release channel for the upstream project and does not imply upstream endorsement or support.

This fork keeps Knomo's card-based browsing, search, tags, links, review, and mobile input experience while making every card a self-contained Markdown file that remains useful outside Obsidian.

## How this fork differs from upstream

| Area | Upstream Knomo | This fork |
| --- | --- | --- |
| Storage unit | Memos in Daily Notes plus maintained monthly collections | One Markdown file per memo |
| Organization | Depends on Daily Notes and monthly Memos files | Recursively scans one or more configured folders; Daily Notes are not required |
| Filename | Carried by daily/monthly source files | `<first line>_YYMMDDHHmm.md`, with ` (2)`-style collision suffixes |
| Content format | Upstream memo format and indexing workflow | First line is the title and remaining lines are the body; no YAML frontmatter or private markers |
| Import | Based on Daily Notes/monthly files | Matching files in a scan folder are recognized without moving or rewriting them |
| Monthly archives | Maintained automatically | Removed |

This is an intentional storage-model change. Existing upstream Daily Notes and monthly Memos are not migrated automatically. Back up your vault before reorganizing files as described in [Import existing notes](#import-existing-notes).

## Features

- Create, edit, delete, search, filter, and revisit standalone Markdown memos in a card flow.
- Recursively scan multiple Vault-relative folders and choose a separate default folder for newly created cards.
- Recognize `#tags` and Obsidian WikiLinks such as `[[Project note]]`.
- Collapse long cards after a configurable line threshold.
- Render Markdown lists, tasks, quotes, images, and links.
- Optional Time buoy reminders from `@YYYY-MM-DD` in the memo body.
- Desktop and mobile card browsing and composer experiences.

## File format

A new memo:

```text
An idea after finishing this book
The body starts on the second line and may contain #reading and [[related notes]].
```

is stored as a file like:

```text
Memos/An idea after finishing this book_2607250855.md
```

- The first line is used as the card title and filename stem. It is ordinary text, not a required level-one heading.
- The `_YYMMDDHHmm` suffix is the minute-level creation time, used for stable ordering and filename conflict avoidance.
- No YAML frontmatter is written; the Markdown file is the sole content source.
- Renaming a file or changing its title manually is supported. The plugin reads the current path and content rather than maintaining a second copy of the title.

## Installation

This fork is not published in the Obsidian Community Plugins directory. Install it manually:

1. Download a compatible package from [Releases](https://github.com/MMKLN0/knomo/releases). If no release is available, run `npm install` and `npm run build` in a source checkout.
2. Place `main.js`, `manifest.json`, and `styles.css` in `<vault>/.obsidian/plugins/knomo/`.
3. Enable Knomo under Obsidian's Community plugins settings.

## First-time setup

Open Knomo settings and, under its standalone-card-files section:

1. Add one or more scan folders relative to the Vault root, for example `Memos` or `Inbox/Cards`.
2. Choose a default save folder. New cards are written only there, and it is automatically included in the scan scope.
3. Optionally adjust the long-card threshold (minimum 6 lines), mobile compact layout, and Time buoy reminders.

No personal paths or folders are preconfigured. Until a scan folder is configured, existing Vault files are not treated as memos.

## Import existing notes

Knomo does not import or migrate files. It reads files that follow its convention:

1. Put the notes in a configured scan folder; subfolders are supported.
2. Name each file `<title>_YYMMDDHHmm.md`, for example `Weekend plans_2607250855.md`.
3. Put the title on the first line and the body below it.
4. Reopen Knomo or wait for the Vault file change to refresh the card flow.

For same-title notes created in the same minute, use a suffix such as `Weekend plans_2607250855 (2).md`. Markdown files outside this naming convention are ignored as cards and are never changed.

## Data and privacy

Every memo is an ordinary Markdown file in your Vault. Knomo requires no account, relies on no external service, and does not actively upload note content. Plugin settings and rebuildable local state only support the UI and features; memo content remains in its own `.md` file.

## Development

```powershell
npm install
npm run typecheck
npm test
npm run build
```

For local testing, copy `main.js`, `manifest.json`, and `styles.css` into the test Vault plugin directory. Do not overwrite `data.json`; it contains each user's own settings.

## Credits and license

This repository is based on [BanyanSo/knomo](https://github.com/BanyanSo/knomo). Thanks to the upstream author for creating Knomo and releasing it under the MIT license. This fork retains the original copyright and license notices; see [LICENSE](LICENSE).
