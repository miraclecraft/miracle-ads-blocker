<h1 align="center">
  <img src="docs/assets/logo.svg" alt="Miracle logo" width="56" height="56" align="center" />
  Miracle - Ads Blocker
</h1>

<p align="center">
  <b>Block ads and trackers, with the best open-source lists merged into one.</b><br />
  A free, open-source browser extension for Edge, Chrome and every Chromium browser.
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-0.1.0-7c3aed?style=flat-square" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-db2777?style=flat-square" alt="License: GPL-3.0" /></a>
  <a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img src="https://img.shields.io/badge/manifest-v3-f59e0b?style=flat-square" alt="Manifest V3" /></a>
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> &nbsp;·&nbsp;
  <a href="#how-it-works"><b>How it works</b></a> &nbsp;·&nbsp;
  <a href="docs/DEVELOPMENT.md"><b>For developers</b></a>
</p>

## What it does

- **Blocks ads and trackers** before they load, using EasyList, EasyPrivacy, AdGuard Base, uBlock filters and Fanboy's Annoyance List.
- **Hides leftover ad boxes** so pages don't show empty gaps.
- **Blocks YouTube video ads** by removing them from the player data before the video starts.
- **Stays up to date by itself.** The lists are packaged into every release, and the extension checks each one for changes every time your browser starts.
- **Lets you pause it** on any site that misbehaves, or turn it off everywhere, from the toolbar.
- **Free and private.** No account, no "acceptable ads", no servers of ours. The only network requests it makes are to the filter lists' own hosts.

## Install

Store listings are coming. Until then:

1. Download the latest `miracle-ads-blocker-*.zip` from [Releases](https://github.com/miraclecraft/miracle-ads-blocker/releases) and unzip it.
2. Open `edge://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

## How it works

1. **On every push**, CI downloads every list, merges them, removes duplicates, and ranks each rule by how many lists agree on it. The result is packaged into the extension, so blocking works the moment it's installed.
2. **When your browser starts**, the extension asks each list's host whether anything changed. This is a conditional request, so an unchanged list costs almost nothing.
3. **Only the difference is applied.** New rules are added on top of the packaged ones, and rules a list has since deleted (usually because they broke a site) are switched off. The update happens in one step in the background, so pages never wait for it.

If a list is unreachable or looks broken, the extension keeps using the copy it already has.

## Licence

[GPL-3.0-or-later](LICENSE). The packaged filter lists belong to their authors. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Part of the Miracle family of free, open-source browser tools, alongside [Miracle - Video Downloader](https://github.com/miraclecraft/miracle-video-downloader).
