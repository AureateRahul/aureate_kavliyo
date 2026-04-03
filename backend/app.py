import json
import os
import subprocess
from flask import Flask, jsonify, request, send_file, abort, render_template_string
from flask_cors import CORS

from db.repository import (
    get_db_connection,
    refresh_metrics_last_90_days,
    update_campaign_messages,
    update_template_paths,
    get_pending_campaign_ids,
    get_pending_campaign_messages,
)
from api.klaviyo import fetch_campaign_values_report, fetch_campaign_messages, fetch_templates

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Load AI context once at startup
# ---------------------------------------------------------------------------
_AI_CONTEXT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "supabase", "functions", "ai-insights", "context.json"
)
try:
    with open(_AI_CONTEXT_PATH, encoding="utf-8") as _f:
        _AI_CONTEXT = json.load(_f)
    print(f"[ai] Loaded context: {_AI_CONTEXT.get('total_campaigns')} campaigns")
except Exception as _e:
    _AI_CONTEXT = {}
    print(f"[ai] Warning: could not load context.json — {_e}")

_AI_SYSTEM_PROMPT = f"""You are an expert Klaviyo email marketing analyst for a healthcare/safety products company.

You have COMPLETE access to all campaign performance data in the snapshot below.
Use this data directly to answer questions — only mention if data is missing.

FULL CAMPAIGN DATA SNAPSHOT (built: {_AI_CONTEXT.get('built_at', 'unknown')}, {_AI_CONTEXT.get('total_campaigns', 0)} campaigns):
{json.dumps(_AI_CONTEXT)}

Instructions:
- Reference actual labels, subjects, open rates, and revenue from the data
- For topic suggestions: identify themes from labels and subjects of top-performing campaigns
- For subject line suggestions: analyze patterns in campaigns with open_rate > 0.30
- Always cite specific numbers (e.g. "38% open rate in Nov 2025")
- Format responses with ## headers, **bold** text, and bullet points"""

TEMPLATES_DIR   = os.path.join(os.path.dirname(__file__), "templates")
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

# Supabase client (reused across requests)
_supabase = get_db_connection()


@app.route("/api/ai-insights", methods=["POST"])
def ai_insights():
    data = request.get_json(silent=True) or {}
    question = data.get("question", "").strip()
    history  = data.get("history", [])   # list of {role, content}
    if not question:
        return jsonify({"error": "No question provided"}), 400

    # Build conversation context from history
    convo = ""
    if history:
        pairs = []
        for msg in history:
            role    = msg.get("role", "")
            content = msg.get("content", "").strip()
            if not content:
                continue
            if role == "user":
                pairs.append(f"Q: {content}")
            else:
                pairs.append(f"A: {content}")
        if pairs:
            convo = "\n\n---\nPREVIOUS CONVERSATION (for context only — do not repeat):\n" + "\n\n".join(pairs) + "\n---"

    prompt = f"{_AI_SYSTEM_PROMPT}{convo}\n\nNow answer this new question thoroughly:\n{question}"

    try:
        claude_cmd = r"C:\Users\Rahul Agarwal\AppData\Roaming\npm\claude.cmd"
        result = subprocess.run(
            [claude_cmd, "--print"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=300,
            encoding="utf-8",
        )
        answer = result.stdout.strip()
        if result.returncode != 0 or not answer:
            error_detail = result.stderr.strip() or "No output from Claude"
            return jsonify({"error": error_detail}), 500
        return jsonify({"answer": answer})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Claude CLI timed out — try a more specific question"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/api/campaigns")
def api_campaigns():
    result = (
        _supabase.table("campaigns")
        .select(
            "id, campaign_id, send_channel, "
            "open_rate, click_rate, conversion_value, click_to_open_rate, "
            "timeframe_start, timeframe_end, "
            "campaign_message_id, subject, template_link, "
            "template_file_path, api_call_1, api_call_2, api_call_3"
        )
        .order("id")
        .execute()
    )
    data = []
    for row in result.data:
        if row.get("template_file_path"):
            row["template_filename"] = os.path.basename(row["template_file_path"])
        else:
            row["template_filename"] = None
        safe_id = "".join(c for c in row["campaign_id"] if c.isalnum())
        row["has_screenshot"] = os.path.exists(
            os.path.join(SCREENSHOTS_DIR, f"{safe_id}.png")
        )
        data.append(row)
    return jsonify(data)


@app.route("/api/stats")
def api_stats():
    from db.repository import _count
    total  = _count(_supabase)
    done_1 = _count(_supabase, api_call_1=1)
    done_2 = _count(_supabase, api_call_2=1)
    done_3 = _count(_supabase, api_call_3=1)
    return jsonify({"total": total, "done_1": done_1, "done_2": done_2, "done_3": done_3})


_VALID_TIMEFRAMES = {
    "today", "yesterday", "this_week", "last_7_days", "last_week",
    "this_month", "last_30_days", "last_month", "last_90_days",
    "last_3_months", "last_365_days", "last_12_months", "this_year", "last_year",
}


@app.route("/api/refresh-metrics", methods=["POST"])
def api_refresh_metrics():
    data = request.get_json(silent=True) or {}
    timeframe_key = data.get("timeframe", "last_90_days")
    if timeframe_key not in _VALID_TIMEFRAMES:
        return jsonify({"error": f"Invalid timeframe '{timeframe_key}'"}), 400

    try:
        rows = fetch_campaign_values_report({"key": timeframe_key})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    result = refresh_metrics_last_90_days(_supabase, rows)
    return jsonify({
        "updated":          result["updated"],
        "inserted":         result["inserted"],
        "new_campaign_ids": result["new_campaign_ids"],
    })


@app.route("/api/run-api2", methods=["POST"])
def api_run_api2():
    data = request.get_json(silent=True) or {}
    campaign_ids = data.get("campaign_ids") or get_pending_campaign_ids(_supabase)
    if not campaign_ids:
        return jsonify({"error": "No pending campaigns for API 2"}), 400

    try:
        rows = fetch_campaign_messages(campaign_ids)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    update_campaign_messages(_supabase, rows)
    return jsonify({"processed": len(rows)})


@app.route("/api/run-api3", methods=["POST"])
def api_run_api3():
    data = request.get_json(silent=True) or {}
    campaign_ids = data.get("campaign_ids")

    if campaign_ids:
        # Filter pending messages for the given campaign IDs
        messages = [
            m for m in get_pending_campaign_messages(_supabase)
            if m["campaign_id"] in campaign_ids
        ]
    else:
        messages = get_pending_campaign_messages(_supabase)

    if not messages:
        return jsonify({"error": "No pending campaigns for API 3"}), 400

    try:
        saved = fetch_templates(messages)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    update_template_paths(_supabase, saved)
    return jsonify({"processed": len(saved)})


@app.route("/download/<campaign_id>")
def download_template(campaign_id):
    safe_id = "".join(c for c in campaign_id if c.isalnum())
    file_path = os.path.join(TEMPLATES_DIR, f"{safe_id}.html")
    if not os.path.exists(file_path):
        abort(404)
    return send_file(file_path, as_attachment=True, download_name=f"{safe_id}.html")


@app.route("/preview/<campaign_id>")
def preview_template(campaign_id):
    safe_id = "".join(c for c in campaign_id if c.isalnum())
    file_path = os.path.join(TEMPLATES_DIR, f"{safe_id}.html")
    if not os.path.exists(file_path):
        abort(404)
    return send_file(file_path)


@app.route("/screenshot/<campaign_id>")
def screenshot(campaign_id):
    """Generate (or serve cached) a PNG screenshot of the email template."""
    safe_id = "".join(c for c in campaign_id if c.isalnum())
    html_path = os.path.join(TEMPLATES_DIR, f"{safe_id}.html")
    if not os.path.exists(html_path):
        abort(404)

    png_path = os.path.join(SCREENSHOTS_DIR, f"{safe_id}.png")

    if not os.path.exists(png_path):
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 800, "height": 1})
                page.goto(f"file:///{html_path.replace(os.sep, '/')}")
                page.wait_for_timeout(500)
                page.screenshot(path=png_path, full_page=True)
                browser.close()
        except Exception as e:
            abort(500, description=str(e))

    return send_file(png_path, mimetype="image/png")


@app.route("/download-image/<campaign_id>")
def download_image(campaign_id):
    """Download the PNG screenshot as a file."""
    safe_id = "".join(c for c in campaign_id if c.isalnum())
    html_path = os.path.join(TEMPLATES_DIR, f"{safe_id}.html")
    if not os.path.exists(html_path):
        abort(404)

    png_path = os.path.join(SCREENSHOTS_DIR, f"{safe_id}.png")

    if not os.path.exists(png_path):
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 800, "height": 1})
                page.goto(f"file:///{html_path.replace(os.sep, '/')}")
                page.wait_for_timeout(500)
                page.screenshot(path=png_path, full_page=True)
                browser.close()
        except Exception as e:
            abort(500, description=str(e))

    return send_file(png_path, as_attachment=True, download_name=f"{safe_id}.png")


# ---------------------------------------------------------------------------
# Frontend HTML
# ---------------------------------------------------------------------------

HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Klaviyo Campaign Dashboard</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdn.datatables.net/1.13.8/css/dataTables.bootstrap5.min.css" rel="stylesheet"/>
  <style>
    body { background:#0f1117; color:#e2e8f0; font-family:'Segoe UI',sans-serif; }
    .navbar { background:#1a1d27!important; border-bottom:1px solid #2d3148; }
    .navbar-brand { color:#7c6af7!important; font-weight:700; font-size:1.3rem; }
    .stat-card { background:#1a1d27; border:1px solid #2d3148; border-radius:12px; padding:20px 24px; }
    .stat-card .label { font-size:.78rem; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; }
    .stat-card .value { font-size:2rem; font-weight:700; color:#fff; }
    .stat-card .sub   { font-size:.82rem; color:#64748b; margin-top:2px; }
    .progress-bar-1{background:#7c6af7} .progress-bar-2{background:#22d3ee} .progress-bar-3{background:#34d399}
    .card-table { background:#1a1d27; border:1px solid #2d3148; border-radius:12px; overflow:hidden; }
    table.dataTable thead th { background:#12141f; color:#94a3b8; font-size:.75rem; text-transform:uppercase; letter-spacing:.06em; border-bottom:1px solid #2d3148!important; white-space:nowrap; }
    table.dataTable tbody tr  { background:#1a1d27!important; border-bottom:1px solid #1e2235; }
    table.dataTable tbody tr:hover { background:#1e2235!important; }
    table.dataTable tbody td  { color:#cbd5e1; font-size:.83rem; vertical-align:middle; }
    .badge-done   { background:#064e3b; color:#34d399; font-size:.72rem; padding:3px 8px; border-radius:20px; }
    .badge-pending{ background:#1e1b4b; color:#818cf8; font-size:.72rem; padding:3px 8px; border-radius:20px; }
    .badge-channel{ background:#1e3a5f; color:#60a5fa; font-size:.72rem; padding:3px 8px; border-radius:20px; }
    .btn-sm-act { border:none; border-radius:6px; padding:3px 9px; font-size:.75rem; text-decoration:none; cursor:pointer; display:inline-flex; align-items:center; gap:3px; }
    .btn-dl    { background:#7c6af7; color:#fff; } .btn-dl:hover { background:#6d5ce6; color:#fff; }
    .btn-prev  { background:#1e3a5f; color:#60a5fa; } .btn-prev:hover { background:#1e4a7f; color:#93c5fd; }
    .btn-img-dl{ background:#065f46; color:#34d399; } .btn-img-dl:hover { background:#047857; color:#6ee7b7; }
    .rate-cell  { font-family:monospace; color:#a5f3fc; }
    .revenue-cell{ font-family:monospace; color:#86efac; font-weight:600; }
    .subject-cell{ max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
    .campaign-id { font-family:monospace; font-size:.75rem; color:#94a3b8; }
    .progress { background:#12141f; height:6px; border-radius:4px; }

    /* Thumbnail */
    .thumb-wrap {
      width:64px; height:80px; overflow:hidden; position:relative;
      border-radius:6px; border:1px solid #2d3148; cursor:pointer;
      background:#12141f; flex-shrink:0;
      transition: transform .15s, box-shadow .15s;
    }
    .thumb-wrap:hover { transform:scale(1.08); box-shadow:0 0 12px #7c6af766; }
    .thumb-wrap iframe {
      width:800px; height:1000px;
      transform:scale(0.08); transform-origin:top left;
      pointer-events:none; border:none;
    }
    .thumb-none {
      width:64px; height:80px; border-radius:6px; border:1px dashed #2d3148;
      display:flex; align-items:center; justify-content:center;
      color:#475569; font-size:1.4rem; flex-shrink:0;
    }

    /* Datatables overrides */
    div.dataTables_wrapper div.dataTables_filter input { background:#12141f; border:1px solid #2d3148; color:#e2e8f0; border-radius:6px; }
    div.dataTables_wrapper div.dataTables_length select { background:#12141f; border:1px solid #2d3148; color:#e2e8f0; border-radius:6px; }
    div.dataTables_wrapper div.dataTables_info { color:#64748b; font-size:.82rem; }
    div.dataTables_wrapper div.dataTables_paginate .paginate_button { color:#94a3b8!important; background:#12141f; border-radius:6px; margin:0 2px; }
    div.dataTables_wrapper div.dataTables_paginate .paginate_button.current { background:#7c6af7!important; color:#fff!important; border:none!important; }
    div.dataTables_wrapper div.dataTables_paginate .paginate_button:hover  { background:#2d3148!important; color:#fff!important; }

    /* Modal */
    .modal-content { background:#1a1d27; border:1px solid #2d3148; }
    .modal-header  { border-bottom:1px solid #2d3148; }
    .modal-footer  { border-top:1px solid #2d3148; }
    .modal-title   { color:#e2e8f0; font-size:.95rem; }
    #modal-iframe  { width:100%; height:70vh; border:none; border-radius:6px; background:#fff; }
    .btn-close { filter:invert(1); }
    #modal-img { max-width:100%; border-radius:8px; cursor:zoom-in; }
    .loading { display:flex; align-items:center; justify-content:center; height:200px; color:#64748b; }
    .spinner { width:20px; height:20px; border:2px solid #2d3148; border-top-color:#7c6af7; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; margin-right:8px; }
    @keyframes spin { to { transform:rotate(360deg); } }
  </style>
</head>
<body>

<nav class="navbar navbar-expand-lg">
  <div class="container-fluid px-4">
    <span class="navbar-brand">⚡ Klaviyo Dashboard</span>
    <span class="ms-auto text-muted" style="font-size:.82rem" id="last-updated"></span>
  </div>
</nav>

<div class="container-fluid px-4 py-4">

  <!-- Stats -->
  <div class="row g-3 mb-4">
    <div class="col-12 col-sm-6 col-xl-3">
      <div class="stat-card">
        <div class="label">Total Campaigns</div>
        <div class="value" id="s-total">—</div>
        <div class="sub">API 1 fetched</div>
        <div class="progress mt-2"><div class="progress-bar progress-bar-1" id="p1" style="width:0%"></div></div>
      </div>
    </div>
    <div class="col-12 col-sm-6 col-xl-3">
      <div class="stat-card">
        <div class="label">Campaign Messages</div>
        <div class="value" id="s-done2">—</div>
        <div class="sub" id="sub-2">API 2 fetched</div>
        <div class="progress mt-2"><div class="progress-bar progress-bar-2" id="p2" style="width:0%"></div></div>
      </div>
    </div>
    <div class="col-12 col-sm-6 col-xl-3">
      <div class="stat-card">
        <div class="label">Templates Saved</div>
        <div class="value" id="s-done3">—</div>
        <div class="sub" id="sub-3">API 3 fetched</div>
        <div class="progress mt-2"><div class="progress-bar progress-bar-3" id="p3" style="width:0%"></div></div>
      </div>
    </div>
    <div class="col-12 col-sm-6 col-xl-3">
      <div class="stat-card">
        <div class="label">Completion</div>
        <div class="value" id="s-pct">—</div>
        <div class="sub">All 3 APIs done</div>
        <div class="progress mt-2"><div class="progress-bar" style="background:#f59e0b;width:0%" id="p-all"></div></div>
      </div>
    </div>
  </div>

  <!-- Table -->
  <div class="card-table p-3">
    <div class="d-flex justify-content-between align-items-center mb-3 px-1">
      <h6 class="mb-0" style="color:#e2e8f0">All Campaigns</h6>
    </div>
    <div class="table-responsive">
      <table id="campaignTable" class="table table-sm dataTable w-100">
        <thead>
          <tr>
            <th>#</th>
            <th>Campaign ID</th>
            <th>Channel</th>
            <th>Open Rate</th>
            <th>Click Rate</th>
            <th>Revenue ($)</th>
            <th>Click-to-Open</th>
            <th>Timeframe</th>
            <th>Subject</th>
            <th>Preview</th>
            <th>Template</th>
            <th>API 1</th>
            <th>API 2</th>
            <th>API 3</th>
          </tr>
        </thead>
        <tbody id="table-body">
          <tr><td colspan="14"><div class="loading">Loading data...</div></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Preview Modal -->
<div class="modal fade" id="previewModal" tabindex="-1">
  <div class="modal-dialog modal-xl modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <span class="modal-title" id="modal-title">Email Preview</span>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-2" id="modal-body">
        <!-- Tab Nav -->
        <ul class="nav nav-tabs mb-3" id="previewTabs" style="border-color:#2d3148">
          <li class="nav-item">
            <button class="nav-link active" id="tab-html-btn" onclick="showTab('html')"
              style="background:transparent;color:#94a3b8;border-color:#2d3148 #2d3148 transparent">
              🌐 HTML Preview
            </button>
          </li>
          <li class="nav-item">
            <button class="nav-link" id="tab-img-btn" onclick="showTab('img')"
              style="background:transparent;color:#94a3b8;border-color:transparent">
              🖼 Image Preview
            </button>
          </li>
        </ul>
        <!-- HTML Tab -->
        <div id="tab-html">
          <iframe id="modal-iframe" src="about:blank"></iframe>
        </div>
        <!-- Image Tab -->
        <div id="tab-img" style="display:none;text-align:center">
          <div id="img-loading" style="display:none;padding:40px;color:#94a3b8">
            <span class="spinner"></span> Generating image...
          </div>
          <img id="modal-img" src="" alt="Email screenshot" style="display:none"/>
        </div>
      </div>
      <div class="modal-footer" style="gap:8px">
        <a id="btn-dl-html" href="#" class="btn-sm-act btn-dl">⬇ Download HTML</a>
        <a id="btn-dl-img"  href="#" class="btn-sm-act btn-img-dl">🖼 Download Image</a>
        <button type="button" class="btn btn-sm" data-bs-dismiss="modal"
          style="background:#2d3148;color:#94a3b8;border:none">Close</button>
      </div>
    </div>
  </div>
</div>

<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.datatables.net/1.13.8/js/jquery.dataTables.min.js"></script>
<script src="https://cdn.datatables.net/1.13.8/js/dataTables.bootstrap5.min.js"></script>
<script>
let dtable;
let currentCampaignId = null;
let currentTab = 'html';
const modal = new bootstrap.Modal(document.getElementById('previewModal'));

// ---- Tab switching ----
function showTab(tab) {
  currentTab = tab;
  const htmlDiv = document.getElementById('tab-html');
  const imgDiv  = document.getElementById('tab-img');
  const btnH    = document.getElementById('tab-html-btn');
  const btnI    = document.getElementById('tab-img-btn');

  if (tab === 'html') {
    htmlDiv.style.display = ''; imgDiv.style.display = 'none';
    btnH.classList.add('active'); btnI.classList.remove('active');
    btnH.style.borderBottomColor = 'transparent'; btnI.style.borderColor = 'transparent';
  } else {
    htmlDiv.style.display = 'none'; imgDiv.style.display = '';
    btnI.classList.add('active'); btnH.classList.remove('active');
    btnI.style.borderBottomColor = 'transparent'; btnH.style.borderColor = 'transparent';
    loadModalImage(currentCampaignId);
  }
}

function loadModalImage(campaignId) {
  const loading = document.getElementById('img-loading');
  const img     = document.getElementById('modal-img');
  loading.style.display = 'block';
  img.style.display = 'none';
  img.src = '';
  const ts = Date.now();
  img.onload = () => { loading.style.display = 'none'; img.style.display = 'block'; };
  img.onerror = () => {
    loading.innerHTML = '<span style="color:#ef4444">Failed to generate screenshot.</span>';
  };
  img.src = `/screenshot/${campaignId}?t=${ts}`;
}

// ---- Open modal ----
function openPreview(campaignId, subject) {
  currentCampaignId = campaignId;
  document.getElementById('modal-title').textContent = subject || campaignId;
  document.getElementById('modal-iframe').src = `/preview/${campaignId}`;
  document.getElementById('btn-dl-html').href = `/download/${campaignId}`;
  document.getElementById('btn-dl-img').href  = `/download-image/${campaignId}`;
  document.getElementById('modal-img').style.display = 'none';
  document.getElementById('img-loading').style.display = 'none';
  showTab('html');
  modal.show();
}

document.getElementById('previewModal').addEventListener('hidden.bs.modal', () => {
  document.getElementById('modal-iframe').src = 'about:blank';
  document.getElementById('modal-img').src = '';
});

// ---- Helpers ----
function badge(val) {
  return val
    ? '<span class="badge-done">Done</span>'
    : '<span class="badge-pending">Pending</span>';
}
function fmt(val, digits) {
  if (val === null || val === undefined) return '<span style="color:#475569">—</span>';
  return parseFloat(val).toFixed(digits);
}
function esc(s) { return s ? s.replace(/"/g,'&quot;').replace(/</g,'&lt;') : ''; }

// ---- Stats ----
function loadStats() {
  fetch('/api/stats').then(r => r.json()).then(s => {
    const total = s.total||0, d1=s.done_1||0, d2=s.done_2||0, d3=s.done_3||0;
    document.getElementById('s-total').textContent = d1;
    document.getElementById('s-done2').textContent = d2;
    document.getElementById('s-done3').textContent = d3;
    document.getElementById('sub-2').textContent = `of ${d1} campaigns`;
    document.getElementById('sub-3').textContent = `of ${d2} with messages`;
    const pct = total > 0 ? Math.round((d3/total)*100) : 0;
    document.getElementById('s-pct').textContent = pct + '%';
    document.getElementById('p1').style.width = (total>0?100:0)+'%';
    document.getElementById('p2').style.width = (d1>0?(d2/d1)*100:0)+'%';
    document.getElementById('p3').style.width = (d2>0?(d3/d2)*100:0)+'%';
    document.getElementById('p-all').style.width = pct+'%';
    document.getElementById('last-updated').textContent = 'Updated: ' + new Date().toLocaleTimeString();
  });
}

// ---- Table ----
function loadTable() {
  fetch('/api/campaigns').then(r => r.json()).then(rows => {
    if (dtable) { dtable.destroy(); }

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = rows.map((r, i) => {
      const tf = r.timeframe_start
        ? r.timeframe_start.split('T')[0] + ' → ' + (r.timeframe_end||'').split('T')[0]
        : '—';

      // Thumbnail column
      const previewCell = r.template_filename
        ? `<div class="thumb-wrap" onclick="openPreview('${r.campaign_id}','${esc(r.subject||r.campaign_id)}')" title="Click to preview">
             <iframe src="/preview/${r.campaign_id}" loading="lazy" scrolling="no" tabindex="-1"></iframe>
           </div>`
        : `<div class="thumb-none" title="No template">📄</div>`;

      // Template file + buttons
      const templateCell = r.template_filename
        ? `<div style="display:flex;flex-direction:column;gap:4px;min-width:160px">
             <span style="font-family:monospace;font-size:.7rem;color:#94a3b8;word-break:break-all">${r.template_filename}</span>
             <div style="display:flex;gap:4px;flex-wrap:wrap">
               <a href="/download/${r.campaign_id}" class="btn-sm-act btn-dl">⬇ HTML</a>
               <a href="/download-image/${r.campaign_id}" class="btn-sm-act btn-img-dl">🖼 Image</a>
             </div>
           </div>`
        : '<span style="color:#475569">—</span>';

      const subject = r.subject
        ? `<span class="subject-cell" title="${esc(r.subject)}">${r.subject}</span>`
        : '<span style="color:#475569">—</span>';

      return `<tr>
        <td style="color:#64748b">${i+1}</td>
        <td><span class="campaign-id">${r.campaign_id}</span></td>
        <td><span class="badge-channel">${r.send_channel||'—'}</span></td>
        <td class="rate-cell">${fmt(r.open_rate!=null?r.open_rate*100:null,2)}${r.open_rate!=null?'%':''}</td>
        <td class="rate-cell">${fmt(r.click_rate!=null?r.click_rate*100:null,3)}${r.click_rate!=null?'%':''}</td>
        <td class="revenue-cell">$${fmt(r.conversion_value,2)}</td>
        <td class="rate-cell">${fmt(r.click_to_open_rate!=null?r.click_to_open_rate*100:null,3)}${r.click_to_open_rate!=null?'%':''}</td>
        <td style="font-size:.75rem;white-space:nowrap;color:#64748b">${tf}</td>
        <td>${subject}</td>
        <td style="padding:6px 8px">${previewCell}</td>
        <td>${templateCell}</td>
        <td>${badge(r.api_call_1)}</td>
        <td>${badge(r.api_call_2)}</td>
        <td>${badge(r.api_call_3)}</td>
      </tr>`;
    }).join('');

    dtable = $('#campaignTable').DataTable({
      pageLength: 25,
      lengthMenu: [10, 25, 50, 100],
      order: [[0,'asc']],
      columnDefs: [{ orderable:false, targets:[9,10] }],
      language: { search:'', searchPlaceholder:'Search campaigns...', lengthMenu:'Show _MENU_' }
    });
  });
}

loadStats();
loadTable();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    app.run(debug=True, port=5000)
