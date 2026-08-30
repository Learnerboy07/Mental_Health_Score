// ============================================================
// CONFIG
// ============================================================
// If this page is served BY the FastAPI app (e.g. http://127.0.0.1:8000/),
// a relative path works because the browser is already on that origin.
// But if you open index.html directly from disk (a "file://..." URL, which
// is what double-clicking the file or "Open File" in an editor does), a
// relative "/predict" resolves to "file:///predict" and always fails.
// This picks the right one automatically so both workflows work:
const BACKEND_ORIGIN = "https://mental-health-score-1-ma8a.onrender.com";
const API_URL = window.location.protocol === "file:"
  ? `${BACKEND_ORIGIN}/predict`
  : "/predict";

// Fields that must be sent as numbers (Pydantic int/float fields).
// Everything else in the form is sent as a string.
const INT_FIELDS = ["Age", "Daily_Unlocks"];
const FLOAT_FIELDS = [
  "Avg_Daily_Usage_Hours",
  "Study_Hours",
  "Physical_Activity_Hours",
  "Sleep_Hours_Per_Night"
];

// ============================================================
// ELEMENT REFERENCES
// ============================================================
const form = document.getElementById("predict-form");
const submitBtn = document.getElementById("submit-btn");
const btnLabel = submitBtn.querySelector(".btn-label");
const btnSpinner = submitBtn.querySelector(".btn-spinner");
const resetBtn = document.getElementById("reset-btn");
const errorBox = document.getElementById("error-box");
const loadingOverlay = document.getElementById("loading-overlay");
const resultCard = document.getElementById("result-card");

// ============================================================
// FORM SUBMIT
// ============================================================
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  hideResult();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const payload = buildPayload();
  setLoading(true);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let body = null;
    try {
      body = await response.json();
    } catch (parseErr) {
      // Response wasn't JSON at all.
      throw new ApiError(
        "The server sent back an unexpected response. Please try again.",
        []
      );
    }

    if (!response.ok) {
      throw parseErrorResponse(response.status, body);
    }

    if (typeof body.predicted_mental_health_score !== "number") {
      throw new ApiError(
        "The prediction response didn't include a score. Please try again later.",
        []
      );
    }

    showResult(body.predicted_mental_health_score);

  } catch (err) {
    if (err instanceof ApiError) {
      showError(err.message, err.details);
    } else if (err instanceof TypeError) {
      // fetch() throws TypeError on network failure / connection refused
      showError(
        "Couldn't reach the prediction service. Check your connection and that the API is running.",
        []
      );
    } else {
      showError("Something unexpected went wrong. Please try again.", []);
    }
  } finally {
    setLoading(false);
  }
});

resetBtn.addEventListener("click", () => {
  hideError();
  hideResult();
});

// ============================================================
// PAYLOAD BUILDING
// ============================================================
function buildPayload() {
  const formData = new FormData(form);
  const payload = {};

  for (const [key, rawValue] of formData.entries()) {
    if (INT_FIELDS.includes(key)) {
      payload[key] = parseInt(rawValue, 10);
    } else if (FLOAT_FIELDS.includes(key)) {
      payload[key] = parseFloat(rawValue);
    } else {
      payload[key] = rawValue.trim();
    }
  }

  return payload;
}

// ============================================================
// ERROR HANDLING
// ============================================================
class ApiError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details || [];
  }
}

function parseErrorResponse(status, body) {
  const detail = body && body.detail;

  // FastAPI/Pydantic validation errors (422): detail is an array of
  // { loc: [...], msg: "...", type: "..." }
  if (status === 422 && Array.isArray(detail)) {
    const details = detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "field";
      return `${humanizeFieldName(field)}: ${d.msg}`;
    });
    return new ApiError("Please fix the following before submitting:", details);
  }

  // HTTPException(status_code=500, detail="...") style: detail is a string.
  if (typeof detail === "string") {
    return new ApiError(detail, []);
  }

  if (status >= 500) {
    return new ApiError("The prediction service hit an internal error. Please try again shortly.", []);
  }

  return new ApiError(`Request failed (HTTP ${status}). Please check your inputs and try again.`, []);
}

function humanizeFieldName(name) {
  return String(name).replace(/_/g, " ");
}

function showError(message, details) {
  errorBox.innerHTML = "";

  const strong = document.createElement("strong");
  strong.textContent = message;
  errorBox.appendChild(strong);

  if (details && details.length) {
    const list = document.createElement("ul");
    details.forEach((d) => {
      const li = document.createElement("li");
      li.textContent = d;
      list.appendChild(li);
    });
    errorBox.appendChild(list);
  }

  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
  errorBox.hidden = true;
  errorBox.innerHTML = "";
}

// ============================================================
// LOADING STATE
// ============================================================
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  btnLabel.textContent = isLoading ? "Analyzing…" : "Get my prediction";
  btnSpinner.hidden = !isLoading;
  loadingOverlay.hidden = !isLoading;
}

// ============================================================
// RESULT DISPLAY
// ============================================================
function hideResult() {
  resultCard.hidden = true;
}

function showResult(score) {
  const rounded = Math.round(score * 100) / 100;
  document.getElementById("score-number").textContent = rounded;

  const { status, detail } = interpretScore(rounded);
  document.getElementById("result-status").textContent = status;
  document.getElementById("result-detail").textContent = detail;

  renderGauge(rounded);

  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function interpretScore(score) {
  // The backend only returns a numeric score; these bands are a general
  // reading of a typical 0–10 wellbeing scale, meant as a rough guide only.
  if (score >= 8) {
    return {
      status: "Thriving",
      detail: "Your reported habits line up with a strong overall wellbeing pattern."
    };
  }
  if (score >= 6) {
    return {
      status: "Doing well",
      detail: "Your habits mostly support your wellbeing, with some room to fine-tune."
    };
  }
  if (score >= 4) {
    return {
      status: "Some strain showing",
      detail: "A few habits — sleep, stress, or screen time — may be weighing on you."
    };
  }
  return {
    status: "Notable strain",
    detail: "Your answers suggest real pressure right now. Consider talking to someone you trust."
  };
}

// ============================================================
// GAUGE RENDERING (SVG semicircle dial, 0–10 scale)
// ============================================================
const GAUGE_CENTER = { x: 110, y: 110 };
const GAUGE_RADIUS = 70;
const GAUGE_MIN = 0;
const GAUGE_MAX = 10;

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy - r * Math.sin(rad)
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = Math.abs(startAngle - endAngle) <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

function ensureGaugeGradient() {
  const svg = document.getElementById("gauge-svg");
  if (svg.querySelector("#gaugeGradient")) return;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  gradient.setAttribute("id", "gaugeGradient");
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("y1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y2", "0%");

  const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#8073A8");

  const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop2.setAttribute("offset", "100%");
  stop2.setAttribute("stop-color", "#2F5D57");

  gradient.appendChild(stop1);
  gradient.appendChild(stop2);
  defs.appendChild(gradient);
  svg.prepend(defs);
}

function renderGauge(score) {
  ensureGaugeGradient();

  const clamped = Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, score));
  const fraction = (clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN);

  const track = document.getElementById("gauge-track");
  const fill = document.getElementById("gauge-fill");
  const needle = document.getElementById("gauge-needle");

  track.setAttribute(
    "d",
    describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, 180, 0)
  );

  const endAngle = 180 - fraction * 180;
  fill.setAttribute(
    "d",
    describeArc(GAUGE_CENTER.x, GAUGE_CENTER.y, GAUGE_RADIUS, 180, endAngle)
  );

  const rotation = -90 + fraction * 180;
  needle.style.transform = `rotate(${rotation}deg)`;
}

// ============================================================
// CORS NOTE (only relevant if frontend and API are on different origins)
// ============================================================
// If you serve this frontend separately from the FastAPI app (different
// host or port), add this to your FastAPI backend so the browser allows
// the request:
//
//   from fastapi.middleware.cors import CORSMiddleware
//
//   app.add_middleware(
//       CORSMiddleware,
//       allow_origins=["http://localhost:5500"],  # your frontend's origin
//       allow_methods=["POST"],
//       allow_headers=["Content-Type"],
//   )
//
// Then set API_URL at the top of this file to the full backend URL,
// e.g. "http://127.0.0.1:8000/predict".
