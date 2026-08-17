# Commute Blocker

A Chrome extension that scans your Google Calendar for events with a location and
automatically adds a "Commute" block on your calendar before each one — sized to the
actual transit time (via the Google Routes API), with an optional early-departure
alternative and a weather forecast added a couple of days out. It also blocks the rest
of the evening after an in-person event, so your calendar reflects reality instead of
looking wide open right after you get home.

## Why there's no API key in this repo

This extension talks directly to Google's APIs from your browser — there's no backend
server in the middle. That means any key baked into the extension's code would be
visible to anyone who unpacks it, so **there is no key in this repo**. Instead:

- Each person who installs the extension creates their own free Google Cloud API key
  and pastes it into the extension's Options page.
- That key is stored in `chrome.storage.local` — on that one device only, never synced
  to your Google account, never committed anywhere, never sent to any server except
  Google's own APIs.
- The Google OAuth client ID in `manifest.json` is **not** secret (Google client IDs
  are visible in the browser during the consent screen anyway), but it's tied 1:1 to
  a specific extension install ID, so it can't be reused across installs either. You
  create your own — see setup below.

This is what makes the extension safe to fork and share: nobody's credentials leave
their own machine, and nobody can rack up API charges on someone else's account.

## Setup

### 1. Load the extension

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Note the **extension ID** Chrome assigns it (shown on the card) — you'll need it
   in step 3.

### 2. Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a
   new project (or reuse one).
2. Under **APIs & Services → Library**, enable all four:
   - **Google Calendar API**
   - **Routes API**
   - **Geocoding API**
   - **Weather API**

### 3. OAuth client (for calendar access)

1. **APIs & Services → OAuth consent screen**: fill in the basic app info. Keep it in
   **Testing** mode and add your own Google account (and anyone else's you're sharing
   this with, up to 100) under **Test users** — the calendar scopes are "sensitive",
   so submitting for full verification is only worth it if you plan to publish this
   for a wide, uncontrolled audience.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Chrome Extension**.
   - Item ID: the extension ID from step 1.
3. Copy the generated **Client ID** and paste it into `manifest.json`, replacing
   `YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com` on the `oauth2.client_id` line.
4. Go back to `chrome://extensions` and click the reload icon on the extension card
   so it picks up the updated manifest.

### 4. Maps API key (for transit + weather)

1. **APIs & Services → Credentials → Create Credentials → API key**.
2. Click **Restrict key** and lock it down:
   - **API restrictions**: limit to Routes API, Geocoding API, and Weather API.
   - **Application restrictions → Websites**, add `chrome-extension://<your-extension-id>/*`
     so the key only works from your own installed copy of the extension.
3. Click the extension's icon → **Settings**, paste the key into **Google Maps API
   key**, set your home location (see below), and click **Save settings**.

### Setting your home location

Settings has two ways to set where transit times are calculated from:

- **Use my current location** — uses your browser's built-in geolocation, free and with
  no API key involved. Chrome will prompt for permission the first time. This is the
  default and takes precedence whenever it's set.
- **Type an address** — useful if you're configuring this from somewhere other than
  home (e.g. ahead of a move). Typing here clears any detected location.

### 5. Connect your calendar

Click the extension icon → **Connect Google Calendar** → grant access. Click
**Check now** to run an immediate scan, or just wait — it checks automatically every
15 minutes (configurable in Settings) and also re-checks whenever a Google Calendar
tab finishes loading.

## Settings reference

| Setting | What it does |
|---|---|
| Home location | Origin for every transit calculation — detected via geolocation or typed as an address. |
| Google Maps API key | Your own key — see step 4 above. Local-only, never synced. |
| Extra buffer (min) | Padding added on top of the raw transit estimate. |
| Check every (min) | How often the background poll runs (minimum 5). |
| Block the evening until | After an in-person event, blocks your calendar until this hour so the evening doesn't look free. |
| Calendar to add blocks to | Which calendar receives the generated blocks — defaults to your primary one. |
| Transit types to allow | Broad category filter (bus/subway/train/light rail/rail) from the Routes API. |
| Avoid / prioritize transit lines | Free-text keyword matching against each route's line/agency name, for finer control than the category filter gives you. |
| "Earlier" option | Adds a second itinerary targeting an earlier arrival, shown alongside the on-time one. |
| Weather forecast | Adds a forecast for the event's location a configurable number of days out. |

## Costs and quotas

The Routes, Geocoding, and Weather APIs are billed per-request past Google's free
monthly tier. This extension is deliberately conservative about calls (each event is
only ever processed once, tracked via `extendedProperties` on the created blocks), but
if you have a very full calendar it's worth keeping an eye on usage in Cloud Console
early on.

## Project structure

```
manifest.json    Extension manifest (permissions, OAuth client, entry points)
background.js    Service worker — polling, Calendar API, Routes API, Weather API
popup.html/js    Toolbar popup — connect, run now, status
options.html/js  Settings page — all configuration, including the API key
```

## License

MIT — see [LICENSE](LICENSE).
