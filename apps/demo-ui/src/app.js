const DEFAULT_API_BASE_URL = "http://localhost:5096";
const STORAGE_KEY = "disaster-tracker-demo.api-base-url";

const state = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  activeFilters: {
    source: "",
    category: "",
    severity: "",
    state: "",
    status: "",
    limit: "25"
  },
  zipFilters: {
    zipCode: "90210",
    source: ""
  },
  resourceFilters: {
    state: "",
    resource: "",
    minimumConfidence: ""
  },
  activeResponse: null,
  selectedEventId: null,
  selectedEvent: null,
  zipResponse: null,
  sourceHealthResponse: null,
  resourceResponse: null
};

const dom = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  initializeForms();
  wireEvents();
  renderOverview();
  renderActiveDisasters();
  renderSelectedEvent();
  renderZipImpact();
  renderSourceHealth();
  renderResourceImpacts();
  refreshDashboard();
});

function cacheDom() {
  dom.apiConfigForm = document.querySelector("#api-config-form");
  dom.apiBaseUrlInput = document.querySelector("#api-base-url");
  dom.globalStatus = document.querySelector("#global-status");
  dom.overviewCards = document.querySelector("#overview-cards");
  dom.activeFiltersForm = document.querySelector("#active-filters-form");
  dom.activeDisastersStatus = document.querySelector("#active-disasters-status");
  dom.activeDisastersList = document.querySelector("#active-disasters-list");
  dom.selectedEvent = document.querySelector("#selected-event");
  dom.zipImpactForm = document.querySelector("#zip-impact-form");
  dom.zipImpactResult = document.querySelector("#zip-impact-result");
  dom.sourceHealth = document.querySelector("#source-health");
  dom.resourceFiltersForm = document.querySelector("#resource-filters-form");
  dom.resourceImpactsStatus = document.querySelector("#resource-impacts-status");
  dom.resourceImpactsList = document.querySelector("#resource-impacts-list");
}

function initializeForms() {
  const savedApiBaseUrl = window.localStorage.getItem(STORAGE_KEY);
  if (savedApiBaseUrl) {
    state.apiBaseUrl = normalizeBaseUrl(savedApiBaseUrl);
  }

  dom.apiBaseUrlInput.value = state.apiBaseUrl;
  applyFormValues(dom.activeFiltersForm, state.activeFilters);
  applyFormValues(dom.zipImpactForm, state.zipFilters);
  applyFormValues(dom.resourceFiltersForm, state.resourceFilters);
}

function wireEvents() {
  dom.apiConfigForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.apiBaseUrl = normalizeBaseUrl(dom.apiBaseUrlInput.value);
    window.localStorage.setItem(STORAGE_KEY, state.apiBaseUrl);
    await refreshDashboard();
  });

  dom.activeFiltersForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.activeFilters = getFormValues(dom.activeFiltersForm);
    await loadActiveDisasters();
  });

  dom.activeFiltersForm.addEventListener("reset", async () => {
    window.setTimeout(async () => {
      state.activeFilters = {
        source: "",
        category: "",
        severity: "",
        state: "",
        status: "",
        limit: "25"
      };
      applyFormValues(dom.activeFiltersForm, state.activeFilters);
      await loadActiveDisasters();
    }, 0);
  });

  dom.activeDisastersList.addEventListener("click", async event => {
    const eventButton = event.target.closest("[data-event-id]");
    if (!eventButton) {
      return;
    }

    state.selectedEventId = eventButton.getAttribute("data-event-id");
    renderActiveDisasters();
    await loadSelectedEvent(state.selectedEventId);
  });

  dom.zipImpactForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.zipFilters = getFormValues(dom.zipImpactForm);
    await loadZipImpact();
  });

  dom.resourceFiltersForm.addEventListener("submit", async event => {
    event.preventDefault();
    state.resourceFilters = getFormValues(dom.resourceFiltersForm);
    await loadResourceImpacts();
  });

  dom.resourceFiltersForm.addEventListener("reset", async () => {
    window.setTimeout(async () => {
      state.resourceFilters = {
        state: "",
        resource: "",
        minimumConfidence: ""
      };
      applyFormValues(dom.resourceFiltersForm, state.resourceFilters);
      await loadResourceImpacts();
    }, 0);
  });
}

async function refreshDashboard() {
  setStatus(dom.globalStatus, `Loading data from ${state.apiBaseUrl}...`);

  await Promise.all([
    loadSourceHealth(),
    loadActiveDisasters(),
    loadResourceImpacts(),
    loadZipImpact()
  ]);

  setStatus(dom.globalStatus, `Connected to ${state.apiBaseUrl}.`, "success");
}

async function loadActiveDisasters() {
  setStatus(dom.activeDisastersStatus, "Loading active disasters...");

  try {
    const response = await fetchJson("/disasters", state.activeFilters);
    state.activeResponse = response;

    if (!state.selectedEventId || !response.items.some(item => item.id === state.selectedEventId)) {
      state.selectedEventId = response.items[0]?.id ?? null;
    }

    renderOverview();
    renderActiveDisasters();

    if (state.selectedEventId) {
      await loadSelectedEvent(state.selectedEventId, true);
    } else {
      state.selectedEvent = null;
      renderSelectedEvent();
    }

    setStatus(dom.activeDisastersStatus, `${response.count} event${response.count === 1 ? "" : "s"} loaded.`, "success");
  } catch (error) {
    state.activeResponse = null;
    state.selectedEvent = null;
    renderOverview();
    renderActiveDisasters();
    renderSelectedEvent();
    setStatus(dom.activeDisastersStatus, error.message, "error");
  }
}

async function loadSelectedEvent(eventId, silent = false) {
  if (!eventId) {
    state.selectedEvent = null;
    renderSelectedEvent();
    return;
  }

  if (!silent) {
    dom.selectedEvent.innerHTML = `<p class="detail-placeholder">Loading event details...</p>`;
  }

  try {
    state.selectedEvent = await fetchJson(`/disasters/${encodeURIComponent(eventId)}`);
  } catch (error) {
    state.selectedEvent = null;
    dom.selectedEvent.innerHTML = `<p class="detail-placeholder">${escapeHtml(error.message)}</p>`;
    return;
  }

  renderSelectedEvent();
}

async function loadZipImpact() {
  const zipCode = state.zipFilters.zipCode?.trim();
  if (!zipCode) {
    state.zipResponse = null;
    renderZipImpact();
    return;
  }

  dom.zipImpactResult.innerHTML = `<p class="empty-state">Loading ZIP impact...</p>`;

  try {
    state.zipResponse = await fetchJson(`/zip-codes/${encodeURIComponent(zipCode)}/impact`, {
      source: state.zipFilters.source
    });
  } catch (error) {
    state.zipResponse = null;
    dom.zipImpactResult.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    return;
  }

  renderZipImpact();
}

async function loadSourceHealth() {
  try {
    state.sourceHealthResponse = await fetchJson("/sources/health");
  } catch (error) {
    state.sourceHealthResponse = null;
    dom.sourceHealth.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    renderOverview();
    return;
  }

  renderOverview();
  renderSourceHealth();
}

async function loadResourceImpacts() {
  setStatus(dom.resourceImpactsStatus, "Loading resource impacts...");

  try {
    state.resourceResponse = await fetchJson("/resource-impacts", state.resourceFilters);
    renderOverview();
    renderResourceImpacts();
    setStatus(
      dom.resourceImpactsStatus,
      `${state.resourceResponse.count} impact signal${state.resourceResponse.count === 1 ? "" : "s"} loaded.`,
      "success");
  } catch (error) {
    state.resourceResponse = null;
    renderOverview();
    renderResourceImpacts();
    setStatus(dom.resourceImpactsStatus, error.message, "error");
  }
}

function renderOverview() {
  const events = state.activeResponse?.items ?? [];
  const sourceHealth = state.sourceHealthResponse?.items ?? [];
  const impacts = state.resourceResponse?.items ?? [];

  const activeCount = events.filter(event => event.status === "active").length;
  const monitoringCount = events.filter(event => event.status === "monitoring").length;
  const healthySources = sourceHealth.filter(source => source.status === "healthy").length;
  const highConfidenceImpacts = impacts.filter(impact => impact.confidence === "high").length;

  const cards = [
    {
      label: "Active events",
      value: String(activeCount),
      subtext: `${events.length} normalized event${events.length === 1 ? "" : "s"} in the current result set`,
      tone: "danger"
    },
    {
      label: "Monitoring events",
      value: String(monitoringCount),
      subtext: "Operationally relevant incidents still being tracked",
      tone: "warning"
    },
    {
      label: "Healthy sources",
      value: sourceHealth.length === 0 ? "-" : `${healthySources}/${sourceHealth.length}`,
      subtext: "Per-source refresh health from the latest snapshot",
      tone: "success"
    },
    {
      label: "Resource signals",
      value: String(impacts.length),
      subtext: `${highConfidenceImpacts} high-confidence supply-region alert${highConfidenceImpacts === 1 ? "" : "s"}`,
      tone: "info"
    }
  ];

  dom.overviewCards.innerHTML = cards.map(card => `
    <article class="overview-card tone-${card.tone}">
      <p class="label">${escapeHtml(card.label)}</p>
      <p class="value">${escapeHtml(card.value)}</p>
      <p class="subtext">${escapeHtml(card.subtext)}</p>
    </article>
  `).join("");
}

function renderActiveDisasters() {
  const events = state.activeResponse?.items ?? [];
  if (events.length === 0) {
    dom.activeDisastersList.innerHTML = `<p class="empty-state">No events match the current filters.</p>`;
    return;
  }

  dom.activeDisastersList.innerHTML = events.map(event => {
    const isSelected = event.id === state.selectedEventId;
    const endText = event.expectedEndAt
      ? `${formatDateTime(event.expectedEndAt)} (${formatEnum(event.endTimeConfidence)} confidence)`
      : "No published end time";

    return `
      <button type="button" class="event-card ${isSelected ? "selected" : ""}" data-event-id="${escapeHtml(event.id)}">
        <div class="card-header">
          <div>
            <h3 class="card-title">${escapeHtml(event.title)}</h3>
            <p class="card-subtitle">${escapeHtml(event.summary ?? "")}</p>
          </div>
          <div class="badge-row">
            ${renderBadge(event.source, "source")}
            ${renderBadge(event.status, event.status)}
            ${renderBadge(event.severity, event.severity)}
          </div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Category</span>
            <span class="meta-value">${escapeHtml(formatEnum(event.category))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Started</span>
            <span class="meta-value">${escapeHtml(formatDateTime(event.startedAt))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Area</span>
            <span class="meta-value">${escapeHtml(event.areaDescription || joinOrFallback(event.stateCodes, "Global / unspecified"))}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Expected end</span>
            <span class="meta-value">${escapeHtml(endText)}</span>
          </div>
        </div>

        <p class="small-text">${escapeHtml(event.description || event.endTimeExplanation || "No additional details were published.")}</p>
      </button>
    `;
  }).join("");
}

function renderSelectedEvent() {
  const event = state.selectedEvent;
  if (!event) {
    dom.selectedEvent.innerHTML = `<p class="detail-placeholder">Select an event to inspect the normalized record.</p>`;
    return;
  }

  const impactedResources = event.impactedResources ?? [];

  dom.selectedEvent.innerHTML = `
    <div class="card-header">
      <div>
        <h3 class="card-title">${escapeHtml(event.title)}</h3>
        <p class="card-subtitle">${escapeHtml(event.sourceUrl || "No source URL published")}</p>
      </div>
      <div class="badge-row">
        ${renderBadge(event.source, "source")}
        ${renderBadge(event.category, "match")}
        ${renderBadge(event.severity, event.severity)}
      </div>
    </div>

    <div class="detail-grid">
      ${renderDetailItem("API id", event.id)}
      ${renderDetailItem("Source event id", event.sourceEventId)}
      ${renderDetailItem("Status", formatEnum(event.status))}
      ${renderDetailItem("Started", formatDateTime(event.startedAt))}
      ${renderDetailItem("Expected end", event.expectedEndAt ? formatDateTime(event.expectedEndAt) : "No published end time")}
      ${renderDetailItem("End confidence", formatEnum(event.endTimeConfidence))}
      ${renderDetailItem("State codes", joinOrFallback(event.stateCodes, "None"))}
      ${renderDetailItem("County FIPS", joinOrFallback(event.countyFipsCodes, "None"))}
      ${renderDetailItem("Zone ids", joinOrFallback(event.zoneIds, "None"))}
      ${renderDetailItem("Centroid", event.centroid ? `${event.centroid.latitude.toFixed(3)}, ${event.centroid.longitude.toFixed(3)}` : "None")}
      ${renderDetailItem("Radius (km)", event.radiusKm ? event.radiusKm.toFixed(1) : "None")}
      ${renderDetailItem("Magnitude", event.magnitude ? `${event.magnitude} ${event.magnitudeUnit || ""}`.trim() : "None")}
    </div>

    <div class="section-heading">
      <h2>Description</h2>
      <p>${escapeHtml(event.description || event.instruction || event.endTimeExplanation)}</p>
    </div>

    <div class="section-heading">
      <h2>Impacted resources</h2>
      <p>${impactedResources.length === 0 ? "No strategic resource signals are attached to this event." : "Signals currently attached to this event."}</p>
    </div>

    ${impactedResources.length === 0 ? "" : `
      <div class="resource-list">
        ${impactedResources.map(signal => `
          <article class="resource-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">${escapeHtml(signal.resource)}</h3>
                <p class="card-subtitle">${escapeHtml(signal.region)}</p>
              </div>
              ${renderBadge(signal.confidence, signal.confidence)}
            </div>
            <p class="small-text">${escapeHtml(signal.summary)}</p>
          </article>
        `).join("")}
      </div>
    `}
  `;
}

function renderZipImpact() {
  const response = state.zipResponse;
  if (!response) {
    dom.zipImpactResult.innerHTML = `<p class="empty-state">Run a ZIP lookup to see matching events.</p>`;
    return;
  }

  const location = response.location;
  const matches = response.matches ?? [];

  dom.zipImpactResult.innerHTML = `
    <article class="match-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(location.city)}, ${escapeHtml(location.stateCode)} ${escapeHtml(location.zipCode)}</h3>
          <p class="card-subtitle">
            Coordinates ${escapeHtml(location.centroid.latitude.toFixed(3))}, ${escapeHtml(location.centroid.longitude.toFixed(3))}
          </p>
        </div>
        ${renderBadge(response.isImpacted ? "Impacted" : "Clear", response.isImpacted ? "high" : "source")}
      </div>

      <div class="match-grid">
        <div class="match-item">
          <span class="meta-label">County FIPS</span>
          <span class="meta-value">${escapeHtml(location.countyFipsCode || "Unavailable")}</span>
        </div>
        <div class="match-item">
          <span class="meta-label">Zones</span>
          <span class="meta-value">${escapeHtml(joinOrFallback(location.zoneIds, "Unavailable"))}</span>
        </div>
      </div>
    </article>

    ${matches.length === 0 ? "<p class=\"empty-state\">No active events currently matched this ZIP code.</p>" : `
      <div class="match-list">
        ${matches.map(match => `
          <article class="match-card">
            <div class="card-header">
              <div>
                <h3 class="card-title">${escapeHtml(match.event?.title || match.title)}</h3>
                <p class="card-subtitle">${escapeHtml(match.reason)}</p>
              </div>
              <div class="badge-row">
                ${renderBadge(match.matchKind, "match")}
                ${renderBadge(match.confidence, match.confidence)}
              </div>
            </div>
            <div class="match-grid">
              <div class="match-item">
                <span class="meta-label">Source</span>
                <span class="meta-value">${escapeHtml(formatEnum(match.event?.source || "unknown"))}</span>
              </div>
              <div class="match-item">
                <span class="meta-label">Distance</span>
                <span class="meta-value">${escapeHtml(match.distanceKm ? `${match.distanceKm.toFixed(1)} km` : "Direct coverage")}</span>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    `}
  `;
}

function renderSourceHealth() {
  const items = state.sourceHealthResponse?.items ?? [];
  if (items.length === 0) {
    dom.sourceHealth.innerHTML = `<p class="empty-state">Source health will appear here after the API responds.</p>`;
    return;
  }

  dom.sourceHealth.innerHTML = `
    <div class="health-table">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Events</th>
            <th>Last success</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${escapeHtml(formatEnum(item.source))}</td>
              <td>${renderBadge(item.status, item.status)}</td>
              <td>${escapeHtml(String(item.eventCount))}</td>
              <td>${escapeHtml(item.lastSuccessfulRefreshUtc ? formatDateTime(item.lastSuccessfulRefreshUtc) : "Never")}</td>
              <td>${escapeHtml(item.errorMessage || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderResourceImpacts() {
  const items = state.resourceResponse?.items ?? [];
  if (items.length === 0) {
    dom.resourceImpactsList.innerHTML = `<p class="empty-state">No resource impacts matched the current filters.</p>`;
    return;
  }

  dom.resourceImpactsList.innerHTML = items.map(signal => `
    <article class="resource-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">${escapeHtml(signal.resource)}</h3>
          <p class="card-subtitle">${escapeHtml(signal.region)}</p>
        </div>
        ${renderBadge(signal.confidence, signal.confidence)}
      </div>

      <p class="small-text">${escapeHtml(signal.summary)}</p>

      <div class="detail-grid">
        ${renderDetailItem("Triggered events", String((signal.matchedEventIds || []).length))}
        ${renderDetailItem("State codes", joinOrFallback(signal.stateCodes, "None"))}
      </div>

      <p class="small-text">${escapeHtml(signal.explanation)}</p>
    </article>
  `).join("");
}

function renderBadge(value, variant) {
  return `<span class="badge ${escapeHtml(variant.toLowerCase())}">${escapeHtml(formatEnum(value))}</span>`;
}

function renderDetailItem(label, value) {
  return `
    <div class="detail-item">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function applyFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const control = form.elements.namedItem(key);
    if (control) {
      control.value = value;
    }
  });
}

function getFormValues(form) {
  const formData = new FormData(form);
  return Object.fromEntries(Array.from(formData.entries(), ([key, value]) => [key, String(value).trim()]));
}

async function fetchJson(path, query = {}) {
  const url = new URL(path, `${state.apiBaseUrl}/`);
  Object.entries(query)
    .filter(([, value]) => value)
    .forEach(([key, value]) => url.searchParams.set(key, value));

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    throw new Error(`Could not reach ${state.apiBaseUrl}. Check that the API is running and CORS is enabled.`);
  }

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}.`;

    try {
      const errorPayload = await response.json();
      detail = errorPayload.detail || errorPayload.title || detail;
    } catch {
      const text = await response.text();
      if (text) {
        detail = text;
      }
    }

    throw new Error(detail);
  }

  return response.json();
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status-message${kind ? ` ${kind}` : ""}`;
}

function normalizeBaseUrl(baseUrl) {
  const value = baseUrl.trim() || DEFAULT_API_BASE_URL;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEnum(value) {
  const normalized = String(value ?? "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .trim();

  const upperValue = normalized.toUpperCase();
  if (upperValue === "NWS") {
    return "NWS";
  }

  if (upperValue === "USGS") {
    return "USGS";
  }

  if (upperValue === "FEMA") {
    return "FEMA";
  }

  if (upperValue === "EONET") {
    return "EONET";
  }

  return normalized.replaceAll(/\b\w/g, letter => letter.toUpperCase());
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function joinOrFallback(values, fallback) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : fallback;
}
