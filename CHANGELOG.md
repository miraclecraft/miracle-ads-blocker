# Changelog

## 0.2.0

- Removes sponsored posts on Facebook and Instagram, and right-column ads on Facebook. Uses Adblock Plus's anti-circumvention list (now a packaged source) and eyeo's snippet engine, so fixes from Adblock Plus arrive with list updates.
- Gets past "disable your ad blocker" walls that the ABP list covers, such as Weather.com's.
- Snippet rules that rewrite page data run before the page's own scripts, from a script registered at page start.
- Adds Miracle fixes, a small list correcting individual upstream rules. First fix: Instagram's ad-label rule also hid normal posts whose text contained "Ad", such as an "Adele" music credit.
- Element-hiding rules with non-English text are no longer dropped.
- Licence is now GPL-3.0-only, as required by the snippet engine.

## 0.1.1

- Blocks YouTube video ads: a script in the page removes ad entries from the player data (initial load, in-app navigation, fetch and XHR) and skips any ad that still starts.

## 0.1.0

First version.

- Blocks ads and trackers using EasyList, EasyPrivacy, AdGuard Base, uBlock filters and Fanboy's Annoyance List, merged and deduplicated into one rule set.
- Packages the latest lists at build time, so blocking works the moment the extension is installed.
- Checks every list for changes when the browser starts and every 6 hours, and applies only the difference.
- Hides leftover ad boxes on pages, injecting only the rules that can match each page.
- Popup: blocked count for the current page, pause on a site, turn blocking off everywhere, list status.
