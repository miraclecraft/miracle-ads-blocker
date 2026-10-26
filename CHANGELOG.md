# Changelog

## Unreleased

- Blocks YouTube video ads: a script in the page removes ad entries from the player data (initial load, in-app navigation, fetch and XHR) and skips any ad that still starts.

## 0.1.0

First version.

- Blocks ads and trackers using EasyList, EasyPrivacy, AdGuard Base, uBlock filters and Fanboy's Annoyance List, merged and deduplicated into one rule set.
- Packages the latest lists at build time, so blocking works the moment the extension is installed.
- Checks every list for changes when the browser starts and every 6 hours, and applies only the difference.
- Hides leftover ad boxes on pages, injecting only the rules that can match each page.
- Popup: blocked count for the current page, pause on a site, turn blocking off everywhere, list status.
