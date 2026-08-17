// Everything except the Maps API key lives in sync storage (fine to roam
// across your signed-in Chrome instances). The API key lives in local
// storage only, so it never gets sent through Chrome's account sync.
const SYNC_FIELDS = [
  "homeAddress",
  "bufferMinutes",
  "pollMinutes",
  "blockUntilHour",
  "targetCalendarId",
  "avoidKeywords",
  "priorityKeywords",
  "earlyOptionMinutes",
  "weatherLeadDays",
];
const CHECKBOX_FIELDS = ["weatherEnabled"]; // plain boolean checkboxes, not part of the travel-mode grid
const LOCAL_FIELDS = ["mapsApiKey"];
const TRAVEL_MODES = ["BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL"];

// homeLat/homeLng aren't tied to a text input — they're set via the
// geolocation button below — so they're tracked separately and only
// written into the form (or storage) through renderLocationStatus()/save().
let homeLat = null;
let homeLng = null;

function renderLocationStatus() {
  const el = document.getElementById("locationStatus");
  if (homeLat != null && homeLng != null) {
    el.textContent = `Using detected location (${homeLat.toFixed(4)}, ${homeLng.toFixed(4)})`;
    el.classList.add("set");
  } else {
    el.textContent = "Not set";
    el.classList.remove("set");
  }
}

document.getElementById("useLocation").addEventListener("click", () => {
  const status = document.getElementById("locationStatus");
  status.textContent = "Locating…";
  status.classList.remove("set");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      homeLat = pos.coords.latitude;
      homeLng = pos.coords.longitude;
      document.getElementById("homeAddress").value = ""; // detected location takes precedence
      renderLocationStatus();
    },
    (err) => {
      // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
      // The raw err.message for code 2 ("Position update is unavailable") doesn't explain
      // *why* — usually OS-level Location Services being off, or no Wi-Fi radio for the
      // desktop location provider to use — so point at the fix instead of just echoing it.
      if (err.code === 2) {
        status.textContent =
          "Couldn't detect a location — check that Location Services is turned on for Chrome in your OS settings, or use the address field below instead.";
      } else if (err.code === 1) {
        status.textContent =
          "Location permission denied — allow it for this extension in Chrome, or use the address field below instead.";
      } else {
        status.textContent = `Couldn't get location: ${err.message}`;
      }
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

// Typing a manual address overrides a previously detected location, so the
// two never both apply at once — background.js only needs to check one.
document.getElementById("homeAddress").addEventListener("input", () => {
  if (homeLat != null || homeLng != null) {
    homeLat = null;
    homeLng = null;
    renderLocationStatus();
  }
});

// Populates the "Calendar to add blocks to" dropdown with every calendar on
// the account (owned, shared, subscribed) — same call background.js makes —
// so you pick from a real list instead of having to type a name or ID.
async function loadCalendarOptions() {
  const hint = document.getElementById("calendarListHint");
  const select = document.getElementById("targetCalendarId");

  const token = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (t) => {
      resolve(chrome.runtime.lastError ? null : t);
    });
  });

  if (!token) {
    hint.textContent = 'Connect Google Calendar from the popup first to see your calendar list — "Primary calendar" still works meanwhile.';
    return;
  }

  try {
    let calendars = [];
    let pageToken;
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      url.searchParams.set("maxResults", "250");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();

      for (const cal of data.items || []) {
        if (cal.deleted || cal.primary) continue; // primary already has its own option
        calendars.push(cal);
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    for (const cal of calendars) {
      const opt = document.createElement("option");
      opt.value = cal.id;
      opt.textContent = cal.summary;
      select.appendChild(opt);
    }
    hint.textContent = "Pick any calendar you own, one shared with you, or one you've subscribed to.";
  } catch (err) {
    hint.textContent = "Couldn't load your calendar list right now. You can still use \"Primary calendar\".";
  }
}

async function load() {
  // Populate the dropdown's options *before* setting its value from storage,
  // otherwise the saved selection has nothing to attach to yet.
  await loadCalendarOptions();

  const syncStored = await chrome.storage.sync.get({
    homeAddress: "",
    homeLat: null,
    homeLng: null,
    bufferMinutes: 5,
    pollMinutes: 15,
    blockUntilHour: 20,
    targetCalendarId: "primary",
    avoidKeywords: "UP Express, Union Pearson",
    priorityKeywords: "",
    allowedTravelModes: [...TRAVEL_MODES], // all allowed by default
    earlyOptionMinutes: 20,
    weatherEnabled: true,
    weatherLeadDays: 2,
  });
  const localStored = await chrome.storage.local.get({ mapsApiKey: "" });

  for (const key of SYNC_FIELDS) {
    document.getElementById(key).value = syncStored[key];
  }
  for (const key of LOCAL_FIELDS) {
    document.getElementById(key).value = localStored[key];
  }
  for (const key of CHECKBOX_FIELDS) {
    document.getElementById(key).checked = !!syncStored[key];
  }
  for (const mode of TRAVEL_MODES) {
    document.getElementById(`mode_${mode}`).checked = syncStored.allowedTravelModes.includes(mode);
  }

  homeLat = syncStored.homeLat;
  homeLng = syncStored.homeLng;
  renderLocationStatus();
}

async function save() {
  const syncValues = {};
  for (const key of SYNC_FIELDS) {
    const el = document.getElementById(key);
    syncValues[key] = el.type === "number" ? Number(el.value) : el.value.trim();
  }
  syncValues.homeLat = homeLat;
  syncValues.homeLng = homeLng;

  const checkedModes = TRAVEL_MODES.filter((mode) => document.getElementById(`mode_${mode}`).checked);
  // Treat "nothing checked" the same as "everything checked" — an empty
  // restriction isn't meaningful, and background.js already treats "all
  // modes selected" as "no restriction" too.
  syncValues.allowedTravelModes = checkedModes.length > 0 ? checkedModes : [...TRAVEL_MODES];

  for (const key of CHECKBOX_FIELDS) {
    syncValues[key] = document.getElementById(key).checked;
  }

  await chrome.storage.sync.set(syncValues);

  const localValues = {};
  for (const key of LOCAL_FIELDS) {
    const el = document.getElementById(key);
    localValues[key] = el.value.trim();
  }
  await chrome.storage.local.set(localValues);

  // Ask the background worker to reschedule the alarm in case pollMinutes changed.
  chrome.runtime.sendMessage({ type: "RESCHEDULE_ALARM" });

  const saved = document.getElementById("saved");
  saved.style.display = "block";
  setTimeout(() => (saved.style.display = "none"), 1500);
}

document.getElementById("save").addEventListener("click", save);

document.getElementById("toggleKey").addEventListener("click", () => {
  const input = document.getElementById("mapsApiKey");
  const btn = document.getElementById("toggleKey");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.textContent = showing ? "Show" : "Hide";
});

load();
