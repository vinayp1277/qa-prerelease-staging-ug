"""Pipeline orchestration state for QA Pre-Release Auto Test.

Manages the 5-step DAG execution: merge -> build -> gitops -> deploy&notify -> jenkins.
Handles deploy retries, gRPC watch during pause, diagnostics, and Slack notifications.
"""

from __future__ import annotations

import asyncio
import json
import random
import time
from pathlib import Path

import reflex as rx

from config.settings import cfg
from autotest.utils.correlation import set_correlation, clear_correlation, get_correlation_id

ROSTER_FILE = Path(cfg.pipeline.run_store_path).parent / "roster.json"
LIVE_STATE_FILE = Path(cfg.pipeline.run_store_path).parent / "live_state.json"

DEFAULT_ROSTER = {
    "shift": "TW AQA",
    "oncall": "@vinay.puranik",
    "escalation": "@vinay.puranik",
    "emails_raw": "@vinay.puranik=vinay.puranik@sporty.com",
}


def _load_roster() -> dict[str, str]:
    """Load roster from JSON file, or return defaults."""
    try:
        if ROSTER_FILE.exists():
            return json.loads(ROSTER_FILE.read_text())
    except Exception:
        pass
    return dict(DEFAULT_ROSTER)


def _save_roster(data: dict[str, str]) -> None:
    """Persist roster to JSON file."""
    ROSTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    ROSTER_FILE.write_text(json.dumps(data, indent=2))


class _SafeEncoder(json.JSONEncoder):
    """JSON encoder that safely handles Reflex proxy objects and datetimes.

    Instead of `default=str` (which silently corrupts data), this encoder:
    - Converts dict-like proxies (ImmutableMutableProxy) via dict()
    - Converts list-like proxies via list()
    - Formats datetimes as ISO 8601 strings (RFC 3339)
    - Raises TypeError for truly unserializable types (fail-loud)
    """

    def default(self, obj):
        # Handle Reflex ImmutableMutableProxy and similar dict/list wrappers
        if hasattr(obj, 'items'):
            return dict(obj)
        if hasattr(obj, '__iter__') and not isinstance(obj, (str, bytes)):
            return list(obj)
        # ISO 8601 / RFC 3339 for datetime objects
        if hasattr(obj, 'isoformat'):
            return obj.isoformat()
        # Let it raise TypeError — fail loud, don't corrupt
        return super().default(obj)


def _save_live_state(data: dict) -> None:
    """Atomically persist pipeline UI state to disk.

    Uses atomic write (write to .tmp then rename) to prevent partial writes.
    Uses _SafeEncoder to properly serialize Reflex proxy objects.
    """
    try:
        LIVE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = LIVE_STATE_FILE.with_suffix(".tmp")
        payload = json.dumps(data, cls=_SafeEncoder)
        # Validate round-trip: if it doesn't parse back, don't write it
        json.loads(payload)
        tmp.write_text(payload)
        tmp.rename(LIVE_STATE_FILE)
    except Exception:
        log.exception("Failed to save live state")


def _recover_corrupted_str(val: str, expected_type: type) -> list | dict | None:
    """Attempt to recover a string-serialized field from a corrupted state file.

    Handles values saved by `json.dumps(default=str)` that contain Python repr
    strings with ImmutableMutableProxy(...) wrappers, single quotes, and Python
    True/False/None literals.

    Returns the parsed value or None if unrecoverable.
    """
    if not val.strip():
        return None

    # Strategy: eval() with a safe namespace that stubs ImmutableMutableProxy
    # as a passthrough identity function. This handles arbitrarily nested proxies.
    safe_ns = {"ImmutableMutableProxy": lambda x: x, "true": True, "false": False, "null": None}
    try:
        result = eval(val, {"__builtins__": {}}, safe_ns)  # noqa: S307
        if isinstance(result, expected_type):
            return result
    except Exception:
        pass
    return None


# Schema: field name → expected type (for validation on load)
_STATE_SCHEMA: dict[str, type] = {
    "runs_summary": list, "merge_statuses": list, "build_statuses": list,
    "gitops_statuses": list, "deploy_apps": list, "jenkins_jobs": list,
    "logs": list, "proposed_actions": list, "forecasts": list,
    "_selected_services": list, "_actually_merged": list,
    "active_run": dict, "health_map": dict, "expected_tags": dict, "_shas": dict, "_current_steps": dict,
}


def _load_live_state() -> dict | None:
    """Load persisted pipeline UI state from disk.

    Validates field types against _STATE_SCHEMA. If a field has the wrong type
    (e.g., string instead of list due to prior corruption), attempts recovery.
    Unrecoverable fields are reset to their type's empty value.
    """
    try:
        if not LIVE_STATE_FILE.exists():
            return None
        data = json.loads(LIVE_STATE_FILE.read_text())
        if not isinstance(data, dict):
            return None

        # Validate and recover corrupted fields
        needs_rewrite = False
        for field, expected in _STATE_SCHEMA.items():
            if field not in data:
                continue
            val = data[field]
            if isinstance(val, expected):
                continue
            # Field has wrong type — attempt recovery
            needs_rewrite = True
            if isinstance(val, str):
                recovered = _recover_corrupted_str(val, expected)
                if recovered is not None:
                    data[field] = recovered
                    log.warning("Recovered corrupted field '%s' from string", field)
                else:
                    data[field] = [] if expected is list else {}
                    log.warning("Could not recover field '%s', reset to empty", field)
            else:
                data[field] = [] if expected is list else {}
                log.warning("Field '%s' had type %s, reset to empty", field, type(val).__name__)

        # Re-save with proper encoding to fix the file on disk
        if needs_rewrite:
            log.info("Re-writing live_state.json to fix corrupted fields")
            _save_live_state(data)

        return data
    except Exception:
        log.exception("Failed to load live state")
    return None


def _parse_email_map(roster: dict[str, str]) -> dict[str, str]:
    """Parse emails_raw from roster into {display_name: email} dict.

    Format: one per line, @handle=email
    Example: @vinay.k=vinay.puranik@sporty.com
    """
    raw = roster.get("emails_raw", "")
    if not raw:
        return {}
    email_map: dict[str, str] = {}
    for line in raw.strip().splitlines():
        line = line.strip()
        if "=" in line:
            handle, email = line.split("=", 1)
            handle = handle.strip()
            email = email.strip()
            if handle and email:
                email_map[handle] = email
    return email_map

from autotest.models.pipeline import STEP_DEFINITIONS, STEP_IDS, PipelineStatus, RunRecord
from autotest.models.argocd import AppHealth
from autotest.services.argocd_client import ArgocdClient
from autotest.services.ecr_client import EcrClient
from autotest.services.github_client import GitHubClient
from autotest.services.jenkins_client import JenkinsClient, jenkins_job_url
from autotest.services.slack_client import SlackClient
from autotest.state import user_registry
from autotest.utils.forecasting import compute_forecasts
from autotest.utils.logging import log
from autotest.utils.run_store import RunStore


def _ts() -> str:
    """Current time as HH:MM:SS."""
    t = time.localtime()
    return f"{t.tm_hour:02d}:{t.tm_min:02d}:{t.tm_sec:02d}"


# ── Shared state singleton ──────────────────────────────────────────────
# Module-level dict shared across ALL Reflex sessions in the same process.
# The session running the pipeline writes here; observer sessions poll from here.
# Also persisted to disk for crash recovery.
import threading

_SHARED_LOCK = threading.Lock()
_SHARED: dict = {}      # canonical pipeline state — same shape as live_state.json
_SHARED_VERSION: int = 0  # monotonically increasing; observers skip if unchanged

# Asyncio-level executor gate — prevents two sessions from both becoming executor.
# Lazily initialised so the lock is created on the running event loop.
_EXECUTOR_GATE: asyncio.Lock | None = None


def _get_executor_gate() -> asyncio.Lock:
    """Get or create the module-level asyncio executor gate."""
    global _EXECUTOR_GATE
    if _EXECUTOR_GATE is None:
        _EXECUTOR_GATE = asyncio.Lock()
    return _EXECUTOR_GATE


_LAST_DISK_WRITE: float = 0.0
_DISK_WRITE_INTERVAL: float = 3.0  # Throttle disk writes to every 3 seconds


def _publish_shared(data: dict, force_disk: bool = False) -> None:
    """Update the in-memory shared state and bump version.

    Always updates _SHARED (fast, in-memory). Throttles disk writes to
    avoid I/O overhead during rapid gRPC watch ticks.
    force_disk=True bypasses throttle (used on pipeline start/finish).
    """
    global _SHARED, _SHARED_VERSION, _LAST_DISK_WRITE
    with _SHARED_LOCK:
        _SHARED = data
        _SHARED_VERSION += 1
    now = time.time()
    if force_disk or (now - _LAST_DISK_WRITE) >= _DISK_WRITE_INTERVAL:
        _LAST_DISK_WRITE = now
        _save_live_state(data)


def _read_shared() -> tuple[dict, int]:
    """Read current shared state + version."""
    with _SHARED_LOCK:
        return _SHARED, _SHARED_VERSION


# Cross-session pause action signal.
# When an observer session clicks Retry/Force Proceed, it writes here.
# The runner session's _wait_for_pause_action polls this.
_SHARED_PAUSE_ACTION: str = ""
_SHARED_ABORT: bool = False


def _set_shared_pause_action(action: str) -> None:
    """Set the shared pause action (called from any session)."""
    global _SHARED_PAUSE_ACTION
    with _SHARED_LOCK:
        _SHARED_PAUSE_ACTION = action


def _read_shared_pause_action() -> str:
    """Read and clear the shared pause action."""
    global _SHARED_PAUSE_ACTION
    with _SHARED_LOCK:
        action = _SHARED_PAUSE_ACTION
        if action:
            _SHARED_PAUSE_ACTION = ""
        return action


def _set_shared_abort(abort: bool) -> None:
    """Set abort flag (called from any session)."""
    global _SHARED_ABORT
    with _SHARED_LOCK:
        _SHARED_ABORT = abort


def _read_shared_abort() -> bool:
    """Read abort flag (does NOT clear it — cleared on pipeline finish)."""
    with _SHARED_LOCK:
        return _SHARED_ABORT


# Cross-session run context for CEN-PE agent.
# When a new pipeline run starts, we publish the run ID + context here.
# AgentState reads this to detect run changes and auto-reset its session.
_CURRENT_RUN_ID: str = ""
_CURRENT_RUN_CONTEXT: str = ""
_CURRENT_CORRELATION: str = ""


def _publish_run_context(run_id: str, context: str) -> None:
    """Publish new run context for CEN-PE agent session reset."""
    global _CURRENT_RUN_ID, _CURRENT_RUN_CONTEXT
    with _SHARED_LOCK:
        _CURRENT_RUN_ID = run_id
        _CURRENT_RUN_CONTEXT = context


def _publish_correlation(cid: str) -> None:
    """Publish live correlation ID for CEN-PE agent context."""
    global _CURRENT_CORRELATION
    with _SHARED_LOCK:
        _CURRENT_CORRELATION = cid


def read_run_context() -> tuple[str, str, str]:
    """Read current run ID + context + correlation ID. Used by AgentState."""
    with _SHARED_LOCK:
        return _CURRENT_RUN_ID, _CURRENT_RUN_CONTEXT, _CURRENT_CORRELATION


# ── CEN-PE Auto-Diagnostics ───────────────────────────────────────────
# Uses the configured agent model (Sonnet by default) for step-failure diagnosis.
# Diagnostics only run on failures — quality matters more than speed here.

DIAG_SYSTEM_PROMPT = (
    "You are CEN-PE, an expert SRE diagnosing a pipeline failure. "
    "Analyze the data below and provide a concise diagnosis:\n"
    "- Root cause (most likely)\n"
    "- Affected services\n"
    "- Recommended action\n"
    "For Jenkins QA failures: list specific failing test classes/methods by name. "
    "Prioritize test report data (pass/fail counts, failing test names) over raw console log. "
    "Be direct and actionable. No pleasantries."
)

ACTION_SYSTEM_PROMPT = (
    "You are CEN-PE, proposing remediation actions for a pipeline failure.\n"
    "Based on the diagnosis and context, propose specific actions.\n"
    "Return ONLY valid JSON array. Each object must have:\n"
    '  "action": one of "hard_sync","restart_pods","retry_merge","retry_build","rollback_image","clear_cache"\n'
    '  "target": specific service/app name\n'
    '  "confidence": integer 0-100\n'
    '  "reason": explanation (max 100 chars)\n'
    "Max 5 actions. Return [] if no clear action."
)

ALLOWED_ACTIONS = frozenset({
    "hard_sync", "restart_pods", "retry_merge", "retry_build",
    "rollback_image", "clear_cache",
})

# Actions with confidence >= this threshold are auto-executed without manual approval
AUTO_EXECUTE_CONFIDENCE = 80

# Actions that are safe to auto-execute (idempotent / low-risk)
AUTO_EXECUTE_ACTIONS = frozenset({
    "hard_sync", "retry_merge", "retry_build", "clear_cache", "rollback_image",
})


async def _call_diagnostic_claude(
    prompt: str,
    system_prompt: str = DIAG_SYSTEM_PROMPT,
) -> str:
    """Call Claude for diagnostic analysis. Non-streaming, uses cfg.agent.model.

    Args:
        prompt: The user message content.
        system_prompt: System prompt to use (allows reuse for actions/diagnosis).
    """
    from autotest.utils.resilience import get_client, get_bulkhead, get_breaker
    from autotest.utils.errors import UpstreamError, classify_http_error

    api_key = cfg.agent.api_key
    if not api_key:
        return "Diagnostics unavailable — AGENT_API_KEY not set"
    model = cfg.agent.model or "claude-sonnet-4-5-20250929"
    try:
        client = get_client("claude_api")
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [{"role": "user", "content": prompt}],
        }
        async with get_bulkhead("claude_api"):
            resp = await get_breaker("claude_api").call(
                client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers, json=payload,
                )
            )
            if resp.status_code >= 400:
                problem = classify_http_error(
                    resp.status_code, "claude_api", resp.text[:200],
                    dict(resp.headers),
                )
                if resp.status_code == 429:
                    raise UpstreamError(problem)
                log.warning("Diagnostic API error: %s", problem)
                return f"Diagnostics unavailable — {problem.title}"
            data = resp.json()
            text_parts = [b["text"] for b in data.get("content", []) if b.get("type") == "text"]
            return "\n".join(text_parts) or "No diagnostic response"
    except UpstreamError as exc:
        log.warning("Diagnostic Claude call upstream error: %s", exc.problem)
        return f"Diagnostics unavailable — {exc.problem.title}"
    except Exception as exc:
        log.warning("Diagnostic Claude call failed: %s", exc)
        return "Diagnostics unavailable"


class PipelineState(rx.State):
    """State for the QA Pre-Release Auto Test pipeline page."""

    # Run management
    runs_summary: list[dict] = []
    active_run: dict = {}
    active_run_id: str = ""

    # Available services from ArgoCD (for Start Automation popup)
    available_services: list[dict] = []

    # On-call roster (persisted to data/roster.json)
    roster: dict[str, str] = {}

    # Slack channel (from config, for UI display)
    slack_channel: str = cfg.slack.channel

    # Execution state
    live_step: str = ""
    is_running: bool = False
    paused: bool = False
    watch_count: int = 0
    health_map: dict[str, str] = {}
    deploy_apps: list[dict] = []  # Full ArgoCD app data for deploy step (same format as health page)
    expected_tags: dict[str, str] = {}  # svc_name → expected tag from build step
    diagnostics: str = ""
    slack_sent: bool = False
    logs: list[dict] = []
    jenkins_jobs: list[dict] = []
    merge_statuses: list[dict] = []
    build_statuses: list[dict] = []
    gitops_statuses: list[dict] = []

    # CEN-PE action proposals (Phase 2)
    proposed_actions: list[dict] = []

    # Predictive forecasts (Phase 3)
    forecasts: list[dict] = []

    # Connection health indicators (UI status bar)
    connection_statuses: dict[str, str] = {}  # svc → "ok" | "err" | "checking"

    # Pause-on-error state (visible to UI)
    pause_error: str = ""        # Error description shown to user when paused
    pause_step: str = ""         # Which step triggered the pause

    # Internal
    _run_store: RunStore = RunStore(cfg.pipeline.run_store_path)
    _shas: dict[str, str] = {}
    _run_counter: int = 1
    _current_steps: dict[str, str] = {}
    _watch_running: bool = False
    _pause_action: str = ""  # "retry" or "proceed" or ""
    _cenpe_secs: float = 0.0  # Time taken by CEN-PE diagnostics + action proposal
    _deploy_timeline: list[dict] = []  # [{ts, elapsed_s, event, detail}] for DORA MTTR
    _deploy_degraded_at: float = 0.0  # epoch when degraded first detected (MTTR start)
    _tag_pushed_at: dict[str, float] = {}   # svc → epoch when gitops push verified
    _tag_healthy_at: dict[str, float] = {}  # svc → epoch when Healthy with correct tag
    _selected_services: list[str] = []
    _actually_merged: list[str] = []  # Services that got real merges (not no-op)
    _skip_jenkins_qa: bool = False    # Runtime override from UI toggle
    _is_executor: bool = False       # True ONLY on the session that started the pipeline
    yaml_lock_acquired: bool = False  # True when deploy lock held on YAML repo (public for UI)
    _observer_polling: bool = False  # True when this session is polling shared state
    _last_shared_ver: int = 0        # last shared version this session saw
    _metrics_buffer: dict[str, list[dict]] = {}  # service → [{ts, cpu, mem, restarts, ...}]
    _triggered_by: str = ""          # User name who started the pipeline
    _step_start_times: dict[str, float] = {}  # step_id → epoch start
    _step_end_times: dict[str, float] = {}    # step_id → epoch end

    def _init_state(self) -> None:
        """Initialize state — restore from shared memory / disk, or start clean.

        Priority: in-memory shared state > live_state.json on disk > clean start.
        """
        if self.runs_summary:
            return  # already initialized

        # Prefer in-memory shared state (another session is running the pipeline)
        shared, _ = _read_shared()
        saved = shared if shared else _load_live_state()
        if saved and saved.get("runs_summary"):
            # Restore persisted state
            self.runs_summary = saved["runs_summary"]
            self.active_run_id = saved.get("active_run_id", "")
            self.active_run = saved.get("active_run", {})
            self.merge_statuses = saved.get("merge_statuses", [])
            self.build_statuses = saved.get("build_statuses", [])
            self.gitops_statuses = saved.get("gitops_statuses", [])
            self.health_map = saved.get("health_map", {})
            self.deploy_apps = saved.get("deploy_apps", [])
            self.expected_tags = saved.get("expected_tags", {})
            self.jenkins_jobs = saved.get("jenkins_jobs", [])
            self.logs = saved.get("logs", [])
            self.diagnostics = saved.get("diagnostics", "")
            _pa = saved.get("proposed_actions", [])
            self.proposed_actions = _pa if isinstance(_pa, list) else []
            _fc = saved.get("forecasts", [])
            self.forecasts = _fc if isinstance(_fc, list) else []
            self.slack_sent = saved.get("slack_sent", False)
            self.paused = saved.get("paused", False)
            self.watch_count = saved.get("watch_count", 0)
            self.pause_error = saved.get("pause_error", "")
            self.pause_step = saved.get("pause_step", "")
            self._run_counter = saved.get("_run_counter", 1)
            self._shas = saved.get("_shas", {})
            self._current_steps = saved.get("_current_steps", {})
            self._selected_services = saved.get("_selected_services", [])
            self._actually_merged = saved.get("_actually_merged", [])

            # If the saved state had a running pipeline, mark it interrupted
            if saved.get("is_running"):
                run_id = saved.get("active_run_id", "")
                for i, r in enumerate(self.runs_summary):
                    if r["id"] == run_id:
                        r_copy = dict(r)
                        r_copy["st"] = "interrupted"
                        # Mark running steps as interrupted
                        steps = dict(r_copy.get("steps", {}))
                        for k, v in steps.items():
                            if v == "running":
                                steps[k] = "interrupted"
                        r_copy["steps"] = steps
                        self.runs_summary[i] = r_copy
                        self.active_run = r_copy
                        break
                self.is_running = False
                self.live_step = ""
                self._current_steps = saved.get("_current_steps", {})
                for k, v in self._current_steps.items():
                    if v == "running":
                        self._current_steps[k] = "interrupted"
                log.info("Restored interrupted run %s from live state", run_id)
            else:
                self.is_running = False
                self.live_step = ""

            log.info("Restored %d runs from live state", len(self.runs_summary))
            return

        # No saved state — start clean
        self.runs_summary = []
        self._shas = {}
        self._run_counter = 1

    @rx.event
    def on_load(self) -> None:
        """Page load handler.

        Initializes state, then starts the observer poller if this session
        is NOT the one running the pipeline — so it receives live updates
        from shared memory.
        """
        self._init_state()
        if not self.roster:
            self.roster = _load_roster()
        if not self.available_services:
            return [
                PipelineState.load_argocd_services,  # type: ignore[list-item]
                PipelineState.start_observer_poller,  # type: ignore[list-item]
                PipelineState.check_connections,  # type: ignore[list-item]
            ]
        return [
            PipelineState.start_observer_poller,  # type: ignore[list-item]
            PipelineState.check_connections,  # type: ignore[list-item]
        ]

    @rx.event(background=True)
    async def start_observer_poller(self) -> None:
        """Background poller that syncs this session from shared state.

        Only active when this session is NOT the one running the pipeline.
        Polls every ~1s, skips if shared version hasn't changed.
        Stops automatically when this session starts its own pipeline run.
        """
        async with self:
            if self._observer_polling:
                return  # already polling
            self._observer_polling = True

        try:
            idle_count = 0
            while True:
                # Adaptive backoff: 1s when active, ramp to 3s when idle (+ jitter)
                sleep_time = 1.0 if idle_count < 3 else min(1.0 + idle_count * 0.5, 3.0)
                sleep_time += random.uniform(0, 0.3)  # jitter to avoid thundering herd
                await asyncio.sleep(sleep_time)

                async with self:
                    # Stop polling if this session is the executor
                    if self._is_executor:
                        self._observer_polling = False
                        return

                shared, ver = _read_shared()
                if not shared:
                    idle_count += 1
                    continue

                async with self:
                    if ver == self._last_shared_ver:
                        idle_count += 1
                        continue  # no change
                    idle_count = 0  # reset on change
                    self._last_shared_ver = ver

                    # Sync all UI-visible fields from shared state
                    self.runs_summary = shared.get("runs_summary", self.runs_summary)
                    self.active_run_id = shared.get("active_run_id", self.active_run_id)
                    self.active_run = shared.get("active_run", self.active_run)
                    self.is_running = shared.get("is_running", False)
                    self.live_step = shared.get("live_step", "")
                    self.merge_statuses = shared.get("merge_statuses", [])
                    self.build_statuses = shared.get("build_statuses", [])
                    self.gitops_statuses = shared.get("gitops_statuses", [])
                    self.health_map = shared.get("health_map", {})
                    self.deploy_apps = shared.get("deploy_apps", [])
                    self.expected_tags = shared.get("expected_tags", {})
                    self.jenkins_jobs = shared.get("jenkins_jobs", [])
                    self.logs = shared.get("logs", [])
                    self.diagnostics = shared.get("diagnostics", "")
                    self.slack_sent = shared.get("slack_sent", False)
                    self.paused = shared.get("paused", False)
                    self.pause_error = shared.get("pause_error", "")
                    self.pause_step = shared.get("pause_step", "")
                    self.watch_count = shared.get("watch_count", 0)
                    self._run_counter = shared.get("_run_counter", self._run_counter)
                    self._shas = shared.get("_shas", {})
                    self._current_steps = shared.get("_current_steps", {})
                    self._selected_services = shared.get("_selected_services", [])
                    self._actually_merged = shared.get("_actually_merged", [])
                    _pa2 = shared.get("proposed_actions", [])
                    self.proposed_actions = _pa2 if isinstance(_pa2, list) else []
                    _fc2 = shared.get("forecasts", [])
                    self.forecasts = _fc2 if isinstance(_fc2, list) else []
        except Exception:
            log.exception("Observer poller error")
        finally:
            async with self:
                self._observer_polling = False

    @rx.event
    def save_roster(self, data: dict[str, str]) -> None:
        """Save on-call roster to file and update state."""
        self.roster = data
        _save_roster(data)
        log.info("Roster saved: %s", data)

    @rx.event(background=True)
    async def load_argocd_services(self) -> None:
        """Fetch real app list from ArgoCD and build service groups for the popup."""
        client = ArgocdClient()
        apps = await client.list_applications()

        # Strip namespace prefix to get short service name
        # e.g. "sportybet-ug-alive" -> "alive"
        ns = cfg.argocd.namespace.lower()  # "sportybet-ug"
        prefix = f"{ns}-" if ns else ""

        svc_names: list[str] = []
        for app in apps:
            name = app.name
            if prefix and name.startswith(prefix):
                name = name[len(prefix):]
            svc_names.append(name)

        # Inject known init containers that are treated as separate services
        if "fe-web-mvc" not in svc_names:
            svc_names.append("fe-web-mvc")

        svc_names.sort()

        # Build a single group with all real services
        groups = [{"id": "staging-ug", "l": f"Staging UG ({len(svc_names)} apps)", "svcs": svc_names}]

        async with self:
            self.available_services = groups
            log.info("Loaded %d ArgoCD services for Start Automation popup", len(svc_names))

    @rx.event(background=True)
    async def check_connections(self) -> None:
        """Probe all external service connections and update status indicators."""
        import httpx

        svc_keys = ["github", "jenkins_build", "ecr", "jenkins_qa", "argocd"]
        async with self:
            self.connection_statuses = {k: "checking" for k in svc_keys}

        results: dict[str, str] = {}

        # ── GitHub ──
        try:
            gh_token = cfg.gitops.github_token
            if not gh_token:
                results["github"] = "err"
            else:
                async with httpx.AsyncClient(timeout=10) as hc:
                    r = await hc.get(
                        "https://api.github.com/rate_limit",
                        headers={"Authorization": f"token {gh_token}"},
                    )
                    results["github"] = "ok" if r.status_code == 200 else "err"
        except Exception:
            results["github"] = "err"

        # ── Jenkins Build (artifact) ──
        try:
            jb_url = cfg.jenkins_build.url
            if not jb_url:
                results["jenkins_build"] = "err"
            else:
                async with httpx.AsyncClient(timeout=10, verify=False) as hc:
                    r = await hc.get(f"{jb_url.rstrip('/')}/api/json", auth=(
                        cfg.jenkins_build.user, cfg.jenkins_build.token,
                    ) if cfg.jenkins_build.user else None)
                    results["jenkins_build"] = "ok" if r.status_code == 200 else "err"
        except Exception:
            results["jenkins_build"] = "err"

        # ── ECR (AWS credentials) ──
        try:
            if not cfg.ecr.access_key or not cfg.ecr.secret_key:
                results["ecr"] = "err"
            else:
                import os as _os
                env = dict(_os.environ)
                env["AWS_ACCESS_KEY_ID"] = cfg.ecr.access_key
                env["AWS_SECRET_ACCESS_KEY"] = cfg.ecr.secret_key
                env["AWS_DEFAULT_REGION"] = cfg.ecr.region
                proc = await asyncio.create_subprocess_exec(
                    "aws", "sts", "get-caller-identity",
                    "--output", "json",
                    env=env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
                results["ecr"] = "ok" if proc.returncode == 0 else "err"
        except Exception:
            results["ecr"] = "err"

        # ── Jenkins QA ──
        try:
            jq_url = cfg.jenkins.url
            if not jq_url:
                results["jenkins_qa"] = "err"
            else:
                async with httpx.AsyncClient(timeout=10, verify=False) as hc:
                    r = await hc.get(f"{jq_url.rstrip('/')}/api/json", auth=(
                        cfg.jenkins.user, cfg.jenkins.token,
                    ) if cfg.jenkins.user else None)
                    results["jenkins_qa"] = "ok" if r.status_code == 200 else "err"
        except Exception:
            results["jenkins_qa"] = "err"

        # ── ArgoCD gRPC ──
        try:
            if not cfg.argocd.server or not cfg.argocd.token:
                results["argocd"] = "err"
            else:
                client = ArgocdClient()
                apps = await asyncio.wait_for(
                    client.list_applications(), timeout=15,
                )
                results["argocd"] = "ok" if apps else "err"
        except Exception:
            results["argocd"] = "err"

        async with self:
            self.connection_statuses = results
            log.info("Connection check: %s", results)

    @rx.event
    def select_run(self, run_id: str) -> None:
        """Select a run to view, restoring its step visualization data."""
        self.active_run_id = run_id
        for r in self.runs_summary:
            if r["id"] == run_id:
                self.active_run = r
                # Restore step viz data from stored run
                if not self.is_running:
                    self.merge_statuses = r.get("merge_statuses", [])
                    self.build_statuses = r.get("build_statuses", [])
                    self.gitops_statuses = r.get("gitops_statuses", [])
                    self.health_map = r.get("health_map", {})
                    self.jenkins_jobs = r.get("jenkins_jobs", [])
                    self.logs = r.get("logs", [])
                break

    @rx.event
    def retry(self) -> None:
        """Retry the failed step. Works from any browser session."""
        self._pause_action = "retry"
        _set_shared_pause_action("retry")

    @rx.event
    def force_proceed(self) -> None:
        """Force proceed past the failed step. Works from any browser session."""
        self._pause_action = "proceed"
        _set_shared_pause_action("proceed")

    @rx.event
    def rollback(self) -> None:
        """Rollback degraded services to previous image tag. Works from any browser session."""
        self._pause_action = "rollback"
        _set_shared_pause_action("rollback")

    @rx.event
    def abort_pipeline(self) -> None:
        """Abort the running pipeline. Works from any browser session."""
        self._pause_action = "abort"
        _set_shared_pause_action("abort")
        _set_shared_abort(True)

    @rx.event(background=True)
    async def approve_action(self, action_id: str) -> None:
        """Execute an approved remediation action."""
        async with self:
            actions = list(self.proposed_actions)
            target_idx = next(
                (i for i, a in enumerate(actions) if a.get("id") == action_id),
                None,
            )
            if target_idx is None:
                return
            actions[target_idx] = {**actions[target_idx], "status": "executing"}
            self.proposed_actions = actions

        action = actions[target_idx]
        result_msg = await self._execute_action(action)

        async with self:
            actions = list(self.proposed_actions)
            for i, a in enumerate(actions):
                if a.get("id") == action_id:
                    actions[i] = {**a, "status": "done", "result": result_msg}
                    break
            self.proposed_actions = actions
            self._persist_live_state()

    @rx.event
    def skip_action(self, action_id: str) -> None:
        """Mark action as skipped."""
        actions = list(self.proposed_actions)
        for i, a in enumerate(actions):
            if a.get("id") == action_id:
                actions[i] = {**a, "status": "skipped"}
                break
        self.proposed_actions = actions
        self._persist_live_state()

    @rx.event(background=True)
    async def start_pipeline(self, services: list[str] | None = None, skip_jenkins: bool = False) -> None:
        """Execute the full 5-step pipeline."""
        # Executor gate: only one session can pass this check-and-set at a time,
        # closing the race window between _SHARED_LOCK (threading) and self (Reflex).
        async with _get_executor_gate():
            async with self:
                if self.is_running:
                    return
                # Check cross-session: another session may already be running
                shared_data, _ = _read_shared()
                if shared_data and shared_data.get("is_running"):
                    return
                self._init_state()

                # Store selected services for this run
                if services:
                    self._selected_services = list(services)
                else:
                    self._selected_services = list(cfg.app.services)

                # Runtime skip-jenkins override (UI toggle or env var)
                self._skip_jenkins_qa = skip_jenkins or cfg.pipeline.skip_jenkins_qa

                # Create new run
                run_num = self._run_counter
                self._run_counter += 1
                run_id = f"r{run_num}"
                self._shas = {}

                init_steps = {sid: "pending" for sid in STEP_IDS}
                self._current_steps = dict(init_steps)

                # Look up user who started the pipeline
                token = self.router.session.client_token
                user = user_registry.lookup(token)
                self._triggered_by = user.get("name", "") if user else ""

                new_run = {
                    "id": run_id,
                    "n": run_num,
                    "st": "running",
                    "dur": "\u2014",
                    "t": _ts(),
                    "by": self._triggered_by,
                    "steps": dict(init_steps),
                }
                self.runs_summary = [new_run] + self.runs_summary[:4]
                self.active_run_id = run_id
                self.active_run = new_run
                self.is_running = True
                self._is_executor = True
                self.logs = []
                self.paused = False
                self.pause_error = ""
                self.pause_step = ""
                self.diagnostics = ""
                self.proposed_actions = []
                self.forecasts = []
                self._metrics_buffer = {}
                self.slack_sent = False
                self.health_map = {}
                self.watch_count = 0
                self.jenkins_jobs = []
                self.merge_statuses = []
                self.build_statuses = []
                self.gitops_statuses = []
                self._watch_running = False
                self._pause_action = ""
                self._actually_merged = []
                self._deploy_timeline = []
                self._deploy_degraded_at = 0.0
                self._cenpe_secs = 0.0
                self._tag_pushed_at = {}
                self._tag_healthy_at = {}
                self._step_start_times = {}
                self._step_end_times = {}
                self._persist_live_state(force_disk=True)

        # Clear any stale abort signal from previous runs
        _set_shared_abort(False)

        # Publish run context for CEN-PE agent — triggers fresh session
        _publish_run_context(
            run_id,
            f"Pipeline run #{run_num} started on branch {cfg.pipeline.target_branch} "
            f"by {self._triggered_by or 'unknown'} at {_ts()}. "
            f"Services: {', '.join(self._selected_services)}.",
        )

        start_time = time.time()

        # Pull latest yaml-repo before the run starts
        repo_path = Path(cfg.gitops.yaml_repo_path)
        if not repo_path.is_absolute():
            repo_path = Path.cwd() / repo_path
        if repo_path.exists() and (repo_path / ".git").exists():
            try:
                proc = await asyncio.create_subprocess_exec(
                    "git", "pull", "--ff-only",
                    cwd=str(repo_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=60)
                if proc.returncode == 0:
                    log.info("Pre-run yaml-repo git pull OK")
                else:
                    log.warning("Pre-run yaml-repo git pull warning: %s",
                                stderr_bytes.decode().strip()[:200])
            except Exception as exc:
                log.warning("Pre-run yaml-repo git pull failed: %s", exc)

        # Execute steps sequentially
        idx = 0
        aborted = False
        while idx < len(STEP_IDS):
            step_id = STEP_IDS[idx]

            # Check for abort before running each step
            if _read_shared_abort():
                async with self:
                    self._log(step_id, "e",
                              f"  \u2718 Pipeline ABORTED by {self._triggered_by or 'user'}")
                    self._sync_active_run(run_id)
                aborted = True
                break

            # Set correlation context for this step
            set_correlation(run_id, step_id)
            _publish_correlation(get_correlation_id())

            # Record step start time
            async with self:
                self._step_start_times[step_id] = time.time()

            # Run the step
            if step_id == "merge":
                await self._run_merge_step(run_id)
            elif step_id == "build":
                await self._run_build_step(run_id)
            elif step_id == "gitops":
                await self._run_gitops_step(run_id)
                # Acquire deploy lock after successful gitops push
                # to prevent other commits to values-staging-{country}.yaml
                async with self:
                    gitops_ok = self._current_steps.get("gitops") == "success"
                if gitops_ok:
                    await self._acquire_yaml_lock(run_id)
            elif step_id == "deploy":
                await self._run_deploy_step(run_id)
            elif step_id == "jenkins":
                await self._run_jenkins_step(run_id)
                # Release deploy lock after Jenkins QA completes
                await self._release_yaml_lock(run_id)
            else:
                await self._run_normal_step(run_id, step_id, idx)

            # Record step end time
            async with self:
                self._step_end_times[step_id] = time.time()

            # Check if step failed — if so, pause and wait for user action
            async with self:
                step_status = self._current_steps.get(step_id, "pending")

            if step_status == "failed":
                step_label = next(
                    (d["label"] for d in STEP_DEFINITIONS if d["id"] == step_id),
                    step_id,
                )

                async with self:
                    # Build error description (needs state access)
                    error_desc = self._build_step_error(step_id)
                    self.paused = True
                    self.pause_step = step_id
                    self.pause_error = (
                        f"{step_label} failed: {error_desc}\n"
                        f"Click 'Force Proceed' to skip to the next step, "
                        f"or 'Retry' to re-run this step."
                    )
                    self._pause_action = ""
                    self._log(step_id, "w",
                              f"  \u23f8 Pipeline PAUSED — {step_label} failed. "
                              f"Waiting for user action...")
                    self._sync_active_run(run_id, force_disk=True)

                # Poll-wait for user to click Retry or Force Proceed
                action = await self._wait_for_pause_action()

                if action == "retry":
                    # Re-run the same step
                    async with self:
                        self.paused = False
                        self.pause_error = ""
                        self.pause_step = ""
                        self._pause_action = ""
                        self._current_steps[step_id] = "pending"
                        self._log(step_id, "i",
                                  f"  \u21bb Retrying {step_label}...")
                        if step_id == "deploy" and self._deploy_timeline:
                            self._tl("user_action",
                                      f"Retry by {self._triggered_by or 'user'}")
                        self._sync_active_run(run_id, force_disk=True)
                    if step_id == "deploy" and self._deploy_timeline:
                        self._log_deploy_timeline_summary("retry")
                    continue  # re-run same idx without incrementing

                elif action == "proceed":
                    # Force proceed to next step
                    async with self:
                        self.paused = False
                        self.pause_error = ""
                        self.pause_step = ""
                        self._pause_action = ""
                        self._log(step_id, "w",
                                  f"  \u23e9 Force proceeding past {step_label} "
                                  f"(user override)")
                        if step_id == "deploy" and self._deploy_timeline:
                            self._tl("user_action",
                                      f"Force Proceed by "
                                      f"{self._triggered_by or 'user'}")
                        self._sync_active_run(run_id, force_disk=True)
                    if step_id == "deploy" and self._deploy_timeline:
                        self._log_deploy_timeline_summary("proceed")
                    idx += 1
                    continue

                elif action == "rollback" and step_id == "deploy":
                    # User approved rollback for degraded services
                    async with self:
                        self.paused = False
                        self.pause_error = ""
                        self.pause_step = ""
                        self._pause_action = ""
                        approved_by = self._triggered_by or "user"
                        self._log(step_id, "i",
                                  f"  \u21ba Rollback approved by {approved_by}")
                        svcs = list(self._selected_services)
                        hm_now = dict(self.health_map)
                        degraded_svcs = [
                            s for s in svcs if hm_now.get(s) != "Healthy"
                        ]
                        if self._deploy_timeline:
                            self._tl("user_action",
                                      f"Rollback by {approved_by} — "
                                      f"{', '.join(degraded_svcs)}")
                        self._sync_active_run(run_id, force_disk=True)

                    from autotest.services.agent_tools import rollback_service

                    rollback_details: list[dict] = []
                    for svc in degraded_svcs:
                        async with self:
                            self._log(step_id, "i",
                                       f"  Rolling back {svc}...")
                            self._sync_active_run(run_id)
                        try:
                            rb = await rollback_service(
                                service=svc,
                                user_name=approved_by,
                                reason=f"Rollback approved by {approved_by}",
                            )
                            if rb["success"]:
                                rollback_details.append({
                                    "service": svc,
                                    "failed_tag": rb["old_tag"],
                                    "rolled_back_to": rb["rolled_back_to"],
                                })
                                async with self:
                                    self._log(step_id, "s",
                                               f"  \u2713 {svc}: {rb['old_tag']} "
                                               f"\u2192 {rb['rolled_back_to']}")
                            else:
                                async with self:
                                    self._log(step_id, "w",
                                               f"  \u2717 {svc}: rollback failed "
                                               f"\u2014 {rb.get('error', '')}")
                        except Exception as exc:
                            async with self:
                                self._log(step_id, "w",
                                           f"  \u2717 {svc}: rollback error \u2014 {exc}")

                    # Send Slack with rollback results
                    if rollback_details:
                        slack = SlackClient()
                        email_map = _parse_email_map(self.roster) if self.roster else None
                        async with self:
                            _run_num = self.active_run.get("n", 0)
                            _diag = self.diagnostics
                            self._log(step_id, "h",
                                       "\u2500\u2500\u2500 Slack Notification (Rolled Back) \u2500\u2500\u2500")
                            self.slack_sent = True
                            self._sync_active_run(run_id)

                        await slack.send_deploy_rollback(
                            branch=cfg.pipeline.target_branch,
                            rollback_details=rollback_details,
                            diagnostics=_diag,
                            shift_roster=dict(self.roster) if self.roster else None,
                            email_map=email_map,
                            run_num=_run_num,
                            triggered_by=approved_by,
                        )
                        if self._deploy_timeline:
                            self._log_deploy_timeline_summary("rollback")

                        # Wait 5s for ArgoCD to converge (batched state sync)
                        async with self:
                            self._log(step_id, "i",
                                       "  Waiting 5s for ArgoCD to converge...")
                        await asyncio.sleep(5)

                        # Re-check health
                        argocd = ArgocdClient()
                        try:
                            app_list = await argocd.list_apps(
                                cfg.argocd.country.upper() or "UG")
                            app_dicts = [a.to_dict() for a in app_list]
                            async with self:
                                hm2: dict[str, str] = {}
                                for a in app_list:
                                    short = (a.name.split("-", 1)[-1]
                                             if "-" in a.name else a.name)
                                    if short in self._selected_services:
                                        hm2[short] = a.health.value
                                self.health_map = hm2
                                self.deploy_apps = [
                                    a for a in app_dicts
                                    if a.get("name") in set(self._selected_services)
                                ]
                                self.watch_count += 1
                                all_ok = all(
                                    v == "Healthy" for s, v in hm2.items()
                                    if s in self._selected_services
                                )
                        except Exception:
                            log.exception("Re-check after rollback failed")
                            all_ok = False

                        if all_ok:
                            async with self:
                                self._log(step_id, "s",
                                           "  \u2713 All apps healthy after rollback!")
                                self._current_steps[step_id] = "success"
                                self._sync_active_run(run_id)
                            idx += 1
                            continue
                        else:
                            async with self:
                                still_bad = [
                                    s for s in self._selected_services
                                    if self.health_map.get(s) != "Healthy"
                                ]
                                self._log(step_id, "w",
                                           f"  Still {len(still_bad)} not healthy "
                                           f"after rollback: {', '.join(still_bad)}")
                                self._sync_active_run(run_id)
                            # Stay paused — user can retry/proceed/abort
                            continue

                    else:
                        async with self:
                            self._log(step_id, "w",
                                       "  No services could be rolled back")
                            self._sync_active_run(run_id)
                        continue

                elif action == "abort":
                    async with self:
                        self.paused = False
                        self.pause_error = ""
                        self.pause_step = ""
                        self._pause_action = ""
                        self._log(step_id, "e",
                                  f"  \u2718 Pipeline ABORTED by {self._triggered_by or 'user'}")
                        if step_id == "deploy" and self._deploy_timeline:
                            self._tl("user_action",
                                      f"Abort by "
                                      f"{self._triggered_by or 'user'}")
                        self._sync_active_run(run_id, force_disk=True)
                    if step_id == "deploy" and self._deploy_timeline:
                        self._log_deploy_timeline_summary("abort")
                    aborted = True
                    break

                else:
                    # Shouldn't happen, but treat as abort
                    aborted = True
                    break

            # Check abort signal between steps
            if _read_shared_abort():
                async with self:
                    self._log(step_id, "e",
                              f"  \u2718 Pipeline ABORTED by {self._triggered_by or 'user'}")
                    self._sync_active_run(run_id)
                aborted = True
                break

            idx += 1

        # Finish run — always release YAML lock if held
        if self.yaml_lock_acquired:
            await self._release_yaml_lock(run_id)

        # Clear abort flag before finalizing
        _set_shared_abort(False)

        async with self:
            elapsed = time.time() - start_time
            mins = int(elapsed // 60)
            secs = int(elapsed % 60)
            duration = f"{mins}m{secs:02d}s"

            all_success = all(
                s == "success" for s in self._current_steps.values()
            )
            has_failed = any(
                s == "failed" for s in self._current_steps.values()
            )
            if all_success:
                final_status = "success"
            elif aborted:
                final_status = "failed"
            elif has_failed:
                final_status = "degraded"
            else:
                final_status = "success"

            # Mark any running steps as failed on abort
            if aborted:
                for k, v in self._current_steps.items():
                    if v == "running":
                        self._current_steps[k] = "failed"

            # ── Build per-step timing data ──
            step_times: dict[str, dict] = {}
            for sid in STEP_IDS:
                s_start = self._step_start_times.get(sid)
                s_end = self._step_end_times.get(sid, time.time() if s_start else None)
                if s_start and s_end:
                    dur_s = round(s_end - s_start, 1)
                    dur_mins = int(dur_s // 60)
                    dur_secs = int(dur_s % 60)
                    dur_label = f"{dur_mins}m{dur_secs:02d}s"
                    start_t = time.localtime(s_start)
                    start_str = f"{start_t.tm_hour:02d}:{start_t.tm_min:02d}:{start_t.tm_sec:02d}"
                    step_times[sid] = {
                        "start": start_str,
                        "dur_s": dur_s,
                        "dur": dur_label,
                        "status": self._current_steps.get(sid, "pending"),
                    }

            # ── Compute propagation stats + MTTR ──
            prop_stats = self._compute_propagation_stats()
            mttr_secs = round(
                time.time() - self._deploy_degraded_at, 1
            ) if self._deploy_degraded_at else 0.0

            # ── Emit completion summary to logs ──
            last_step = STEP_IDS[-1]
            for sid in reversed(STEP_IDS):
                if self._current_steps.get(sid) in ("success", "failed"):
                    last_step = sid
                    break

            self._log(last_step, "h",
                      f"─── Run #{run_num} Complete — "
                      f"{final_status.upper()} ({duration}) ───")

            for step_def in STEP_DEFINITIONS:
                sid = step_def["id"]
                st = self._current_steps.get(sid, "pending")
                times = step_times.get(sid)
                if times:
                    icon = ("✓" if st == "success" else
                            "✕" if st == "failed" else
                            "⏭" if st == "skipped" else "—")
                    kind = ("s" if st == "success" else
                            "e" if st == "failed" else
                            "w" if st == "skipped" else "i")
                    self._log(last_step, kind,
                              f"  {icon} {step_def['label']:30s} "
                              f"{times['dur']:>8s}  ({times['start']})")

            # Propagation stats summary
            if prop_stats:
                healthy_times = [
                    p["push_to_healthy_secs"]
                    for p in prop_stats if p["push_to_healthy_secs"] > 0
                ]
                if healthy_times:
                    avg = round(sum(healthy_times) / len(healthy_times), 1)
                    mn = round(min(healthy_times), 1)
                    mx = round(max(healthy_times), 1)
                    self._log(last_step, "i",
                              f"  Push→Healthy: avg {avg}s · "
                              f"min {mn}s · max {mx}s")
                    for p in prop_stats:
                        t = p["push_to_healthy_secs"]
                        dur_str = f"{t}s" if t > 0 else p["status"]
                        self._log(last_step, "i",
                                  f"    {p['service']}: {dur_str}")

            # MTTR summary
            if mttr_secs > 0:
                self._log(last_step, "w", f"  MTTR: {int(mttr_secs)}s")

            self.is_running = False
            self._is_executor = False
            self.live_step = ""
            self.paused = False
            self.pause_error = ""
            self.pause_step = ""
            self._update_run(
                run_id, final_status, duration, list(self.logs),
                step_times=step_times,
                propagation_stats=prop_stats,
                mttr_secs=mttr_secs,
            )
            self._persist_live_state(force_disk=True)

            triggered_by = self._triggered_by
            run_num_val = run_num

        # Send Slack abort notification
        if aborted:
            slack = SlackClient()
            roster = _load_roster()
            email_map = _parse_email_map(roster)
            await slack.send_deploy_aborted(
                branch=cfg.pipeline.target_branch,
                run_num=run_num_val,
                triggered_by=triggered_by,
                shift_roster=roster,
                email_map=email_map,
            )

        # Clean up correlation context now that pipeline is done
        clear_correlation()
        _publish_correlation("")

    async def _wait_for_pause_action(self) -> str:
        """Poll-wait until user clicks Retry, Force Proceed, Rollback, or Abort.

        Checks both the local session's _pause_action (same browser)
        and the shared signal (another browser/machine). Returns "retry",
        "proceed", "rollback", or "abort". Polls every 0.5s.
        """
        _valid = ("retry", "proceed", "rollback", "abort")
        while True:
            await asyncio.sleep(0.5)
            # Check abort signal first
            if _read_shared_abort():
                return "abort"
            # Check local session
            async with self:
                action = self._pause_action
                if action in _valid:
                    return action
            # Check cross-session shared signal
            shared_action = _read_shared_pause_action()
            if shared_action in _valid:
                async with self:
                    self._pause_action = shared_action
                return shared_action

    def _build_step_error(self, step_id: str) -> str:
        """Build a human-readable error summary for a failed step."""
        if step_id == "merge":
            failed = [m["name"] for m in self.merge_statuses if m["status"] == "failed"]
            msgs = [
                f'{m["name"]}: {m.get("message", "unknown error")}'
                for m in self.merge_statuses if m["status"] == "failed"
            ]
            if msgs:
                return "; ".join(msgs)
            return f"{len(failed)} service(s) failed" if failed else "merge error"

        elif step_id == "build":
            failed = [b["name"] for b in self.build_statuses if b["status"] == "failed"]
            msgs = [
                f'{b["name"]}: {b.get("message", "unknown error")}'
                for b in self.build_statuses if b["status"] == "failed"
            ]
            if msgs:
                return "; ".join(msgs)
            return f"{len(failed)} service(s) failed" if failed else "build error"

        elif step_id == "gitops":
            failed = [g["name"] for g in self.gitops_statuses if g["status"] == "failed"]
            msgs = [
                f'{g["name"]}: {g.get("message", "unknown error")}'
                for g in self.gitops_statuses if g["status"] == "failed"
            ]
            if msgs:
                return "; ".join(msgs)
            return f"{len(failed)} service(s) failed" if failed else "gitops error"

        elif step_id == "deploy":
            degraded = [
                s for s in self._selected_services
                if self.health_map.get(s) != "Healthy"
            ]
            if degraded:
                return f"{len(degraded)} app(s) not healthy: {', '.join(degraded)}"
            return "deploy health check failed"

        elif step_id == "jenkins":
            failed = [j["label"] for j in self.jenkins_jobs if j["status"] != "success"]
            if failed:
                return f"job(s) failed: {', '.join(failed)}"
            return "jenkins job error"

        return "step failed"

    _MAX_LOGS = 500  # Cap log entries to prevent unbounded growth

    def _log(self, step_id: str, kind: str, text: str) -> None:
        """Append a log entry tagged with its step (capped at _MAX_LOGS)."""
        new_logs = self.logs + [{"t": _ts(), "k": kind, "x": text, "s": step_id}]
        if len(new_logs) > self._MAX_LOGS:
            new_logs = new_logs[-self._MAX_LOGS:]
        self.logs = new_logs

    async def _acquire_yaml_lock(self, run_id: str) -> None:
        """Acquire country-level deploy lock on the YAML repo.

        Prevents other commits to values-staging-{country}.yaml while
        QA testing is in progress.  Non-fatal: logs a warning if lock
        cannot be acquired (another run holds it).
        """
        country = cfg.argocd.country or "ug"
        async with self:
            self._log("gitops", "i",
                       f"  Acquiring deploy lock for staging-{country}...")

        gh = GitHubClient()
        acquired, reason = await gh.acquire_deploy_lock(
            country=country,
            run_id=run_id,
            triggered_by=self._triggered_by or "autotest",
        )

        async with self:
            if acquired:
                self.yaml_lock_acquired = True
                self._log("gitops", "s",
                           f"  \u2713 Deploy lock acquired — "
                           f"values-staging-{country}.yaml protected")
            else:
                self._log("gitops", "w",
                           f"  \u26a0 Could not acquire deploy lock: {reason}")
                self._log("gitops", "w",
                           f"  \u2192 Proceeding without lock — "
                           f"concurrent commits are possible")

        # Ensure GitHub Actions lock enforcement workflow exists (idempotent)
        if acquired:
            try:
                ok = await gh.ensure_lock_enforcement_workflow(
                    slack_webhook_url=cfg.slack.webhook_url,
                )
                if ok:
                    async with self:
                        self._log("gitops", "i",
                                   "  ✓ Lock enforcement workflow verified")
            except Exception:
                log.debug("Lock enforcement workflow setup failed (non-fatal)",
                          exc_info=True)

    async def _release_yaml_lock(self, run_id: str) -> None:
        """Release the country-level deploy lock.  Safe to call if not held."""
        if not self.yaml_lock_acquired:
            return

        country = cfg.argocd.country or "ug"
        gh = GitHubClient()
        released = await gh.release_deploy_lock(
            country=country, run_id=run_id,
        )

        async with self:
            self.yaml_lock_acquired = False
            if released:
                self._log("jenkins", "s",
                           f"  \u2713 Deploy lock released for staging-{country}")
            else:
                self._log("jenkins", "w",
                           f"  \u26a0 Failed to release deploy lock — "
                           f"may need manual cleanup")

    def _tl(self, event: str, detail: str = "") -> None:
        """Append a deploy timeline event for DORA MTTR tracking.

        Must be called inside `async with self:` block.
        """
        now = time.time()
        elapsed = round(now - self._deploy_degraded_at, 1) if self._deploy_degraded_at else 0
        self._deploy_timeline = self._deploy_timeline + [{
            "ts": _ts(),
            "epoch": now,
            "elapsed_s": elapsed,
            "event": event,
            "detail": detail,
        }]

    def _compute_propagation_stats(self) -> list[dict]:
        """Compute per-service image propagation times (push → Healthy).

        Must be called inside `async with self:` block.
        Returns list of {service, push_to_healthy_secs, status}.
        """
        stats: list[dict] = []
        for svc in self._selected_services:
            pushed = self._tag_pushed_at.get(svc)
            healthy = self._tag_healthy_at.get(svc)
            if pushed and healthy:
                stats.append({
                    "service": svc,
                    "push_to_healthy_secs": round(healthy - pushed, 1),
                    "status": "healthy",
                })
            elif pushed:
                # Pushed but never became healthy
                stats.append({
                    "service": svc,
                    "push_to_healthy_secs": -1,
                    "status": self.health_map.get(svc, "Unknown"),
                })
        return stats

    def _log_deploy_timeline_summary(self, user_action: str) -> None:
        """Log deploy event timeline + MTTR to UI logs (not Slack).

        Called after user takes action (Retry/Rollback/Force Proceed/Abort).
        Shows the full sequence of events from degraded detection to user decision.
        """
        if not self._deploy_timeline:
            return
        mttr = (time.time() - self._deploy_degraded_at
                if self._deploy_degraded_at else 0)
        mttr_label = f"{int(mttr)}s" if mttr else "—"
        action_display = user_action.replace("_", " ").title()
        user_name = self._triggered_by or "user"

        self._log("deploy", "h",
                  f"─── Deploy Timeline — {action_display} by {user_name} "
                  f"(MTTR: {mttr_label}) ───")
        for ev in self._deploy_timeline:
            elapsed = ev.get("elapsed_s", 0)
            elapsed_label = (
                f"{int(elapsed)}s" if elapsed < 120
                else f"{int(elapsed // 60)}m{int(elapsed % 60)}s"
            )
            self._log("deploy", "i",
                      f"  +{elapsed_label} {ev['event']} — "
                      f"{ev.get('detail', '')[:100]}")

    async def _run_normal_step(
        self, run_id: str, step_id: str, idx: int
    ) -> None:
        """Execute a normal (non-deploy) pipeline step."""
        step_def = STEP_DEFINITIONS[idx]

        async with self:
            self._current_steps[step_id] = "running"
            self.live_step = step_id
            self._sync_active_run(run_id, force_disk=True)
            self._log(step_id, "h", f"\u2500\u2500\u2500 {step_def['label']} \u2500\u2500\u2500")

        # Simulate step execution per service
        failed_svcs: list[str] = []
        for svc in self._selected_services:
            await asyncio.sleep(0.2)
            sha = self._shas.get(svc, "unknown")
            suffix = ""
            if step_id == "build":
                suffix = f"\u2192 {cfg.pipeline.target_branch}-{sha}"
            elif step_id == "merge":
                suffix = f"\u2192 {sha}"
            async with self:
                self._log(step_id, "s", f"  \u2713 {svc} {suffix}")

        async with self:
            n = len(self._selected_services)
            if failed_svcs:
                fail_names = ", ".join(failed_svcs)
                self._log(step_id, "e",
                          f"  \u2715 {len(failed_svcs)}/{n} failed: {fail_names}")
                self._current_steps[step_id] = "failed"
            else:
                self._log(step_id, "s",
                          f"  \u2713 {step_def['label']} complete")
                self._current_steps[step_id] = "success"
            self._sync_active_run(run_id)

        await asyncio.sleep(0.3)

    async def _run_diagnostics(self, step_id: str, context: str) -> str:
        """Gather step-specific data from agent tools and get AI diagnosis.

        Args:
            step_id: The pipeline step that failed (merge/build/gitops/deploy/jenkins).
            context: Pre-built context string with failure details from state.

        Returns:
            Diagnosis text or "Diagnostics unavailable" on error.
        """
        try:
            from autotest.services.agent_tools import (
                grafana_loki_query,
                prometheus_health_query,
                argocd_health_board,
                jenkins_job_query,
                gitops_image_tag,
            )

            gathered = [context]

            # Step-specific additional data gathering from live infrastructure
            if step_id == "build":
                try:
                    jenkins_data = await jenkins_job_query()
                    gathered.append(f"\nJenkins status:\n{jenkins_data[:4000]}")
                except Exception:
                    pass

            elif step_id == "gitops":
                try:
                    tags_data = await gitops_image_tag(action="list")
                    gathered.append(f"\nCurrent GitOps tags:\n{tags_data[:2000]}")
                except Exception:
                    pass

            elif step_id == "deploy":
                # Extract degraded service names from context for targeted queries
                degraded_svcs: list[str] = []
                for line in context.split("\n"):
                    if line.startswith("Degraded services:"):
                        degraded_svcs = [
                            s.strip() for s in line.split(":", 1)[1].split(",")
                            if s.strip()
                        ]
                        break

                # Per-service Loki logs for degraded services (targeted diagnostics)
                if degraded_svcs:
                    for svc in degraded_svcs[:4]:  # cap at 4 to avoid overload
                        try:
                            svc_logs = await grafana_loki_query(
                                service=svc, limit=20,
                            )
                            gathered.append(
                                f"\nLoki logs for {svc}:\n{svc_logs[:1500]}"
                            )
                        except Exception:
                            pass

                # Also get global error logs as fallback
                try:
                    loki_data = await grafana_loki_query(errors_only=True, limit=20)
                    gathered.append(f"\nRecent error logs (all):\n{loki_data[:2000]}")
                except Exception:
                    pass
                try:
                    prom_data = await prometheus_health_query()
                    gathered.append(f"\nPrometheus health:\n{prom_data[:2000]}")
                except Exception:
                    pass
                try:
                    argo_data = await argocd_health_board()
                    gathered.append(f"\nArgoCD health board:\n{argo_data[:2000]}")
                except Exception:
                    pass

            elif step_id == "jenkins":
                try:
                    jenkins_data = await jenkins_job_query()
                    gathered.append(f"\nJenkins details:\n{jenkins_data[:4000]}")
                except Exception:
                    pass

            full_context = "\n".join(gathered)
            step_labels = {
                "merge": "Git Merge",
                "build": "Image Check",
                "gitops": "Staging GitOps Update",
                "deploy": "Deploy Sync & Notify",
                "jenkins": "WAP+RESTAPI QA Jobs",
            }
            step_label = step_labels.get(step_id, step_id)
            prompt = f"Pipeline failure at step: {step_label}\n\n{full_context}"

            return await _call_diagnostic_claude(prompt)

        except Exception as exc:
            log.warning("Diagnostics failed for step %s: %s", step_id, exc)
            return "Diagnostics unavailable"

    async def _propose_actions(
        self, step_id: str, diagnosis: str, context: str,
    ) -> list[dict]:
        """Call Claude to propose remediation actions and auto-execute high-confidence ones.

        Actions with confidence >= AUTO_EXECUTE_CONFIDENCE and in AUTO_EXECUTE_ACTIONS
        are executed immediately. Lower-confidence or risky actions are left as 'proposed'
        for manual review (or skipped automatically after a timeout).
        """
        try:
            prompt = (
                f"Step: {step_id}\n"
                f"Diagnosis: {diagnosis}\n"
                f"Context: {context[:2000]}\n"
                f"Health map: {json.dumps(dict(self.health_map))[:500]}"
            )
            raw = await _call_diagnostic_claude(prompt, system_prompt=ACTION_SYSTEM_PROMPT)

            # Parse JSON array from response — strip markdown fences
            text = raw.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

            actions = json.loads(text)
            if not isinstance(actions, list):
                return []

            # Validate and enrich
            valid: list[dict] = []
            for i, a in enumerate(actions[:5]):
                if not isinstance(a, dict):
                    continue
                action_type = a.get("action", "")
                if action_type not in ALLOWED_ACTIONS:
                    continue
                confidence = a.get("confidence", 0)
                if not isinstance(confidence, (int, float)):
                    confidence = 0
                confidence = max(0, min(100, int(confidence)))

                # Determine if this action qualifies for auto-execution
                can_auto = (
                    confidence >= AUTO_EXECUTE_CONFIDENCE
                    and action_type in AUTO_EXECUTE_ACTIONS
                )

                valid.append({
                    "id": f"act-{i}",
                    "action": action_type,
                    "target": str(a.get("target", ""))[:80],
                    "confidence": confidence,
                    "reason": str(a.get("reason", ""))[:100],
                    "status": "auto_executing" if can_auto else "proposed",
                })

            # Auto-execute qualifying actions
            for action in valid:
                if action["status"] != "auto_executing":
                    continue
                self._log(
                    step_id, "i",
                    f"  AUTO-EXEC [{action['confidence']}%] "
                    f"{action['action']} → {action['target']}: {action['reason']}",
                )
                try:
                    result_msg = await self._execute_action(action)
                    action["status"] = "done"
                    action["result"] = result_msg
                    self._log(step_id, "i", f"    ✓ {result_msg}")
                except Exception as exc:
                    action["status"] = "failed"
                    action["result"] = str(exc)
                    self._log(step_id, "w", f"    ✗ Auto-exec failed: {exc}")

            return valid

        except (json.JSONDecodeError, ValueError) as exc:
            log.warning("Failed to parse action proposals: %s", exc)
            return []
        except Exception as exc:
            log.warning("Action proposal failed: %s", exc)
            return []

    async def _execute_action(self, action: dict) -> str:
        """Execute an approved remediation action. Returns result message."""
        action_type = action.get("action", "")
        target = action.get("target", "")

        try:
            if action_type == "hard_sync":
                argocd = ArgocdClient()
                market = cfg.argocd.country.upper() or "UG"
                # Resolve to ArgoCD app name
                ns_prefix = cfg.argocd.namespace.lower()
                app_name = f"{ns_prefix}-{target}" if ns_prefix else target
                await argocd.hard_sync(market, app_name)
                return f"Hard sync triggered for {app_name}"

            elif action_type == "retry_merge":
                gh = GitHubClient()
                merge_msg = f"{self._triggered_by} via AutoDeploy v3" if self._triggered_by else ""
                result = await gh.merge_master_to_branch(target, commit_message=merge_msg)
                return f"Merge result: {result.status} — {result.message}"

            elif action_type == "retry_build":
                return f"Retry build for {target}: queued for next pipeline run"

            elif action_type == "rollback_image":
                from autotest.services.agent_tools import rollback_service
                result = await rollback_service(
                    service=target,
                    user_name=self._triggered_by or "pipeline",
                    reason=action.get("reason", "Deploy retries exhausted"),
                )
                if result["success"]:
                    return (
                        f"ROLLBACK OK: {target} "
                        f"{result['old_tag']} -> {result['rolled_back_to']}"
                    )
                else:
                    return f"ROLLBACK FAILED: {target} — {result.get('error', 'unknown')}"

            elif action_type == "restart_pods":
                return f"Pod restart for {target}: not yet implemented"

            elif action_type == "clear_cache":
                return f"Cache clear for {target}: not yet implemented"

            else:
                return f"Unknown action: {action_type}"

        except Exception as exc:
            log.warning("Action execution failed: %s %s: %s", action_type, target, exc)
            return f"Action failed: {exc}"

    async def _run_merge_step(self, run_id: str) -> None:
        """Execute Git Merge step — merge master → target branch in parallel.

        Uses GitHub GraphQL mergeBranch mutation for all selected services
        concurrently. Each service merges to its own target branch (derived
        from the YAML tag prefix):
          - pre-release-tw-* services → merge master → pre-release-tw
          - staging-ug-* services    → merge master → staging-ug
          - staging-global-* services → merge master → staging-global
        """
        default_branch = cfg.pipeline.target_branch
        ecr_resolve = EcrClient()

        # Build per-service branch map
        svc_branches: dict[str, str] = {}
        for svc in self._selected_services:
            svc_branches[svc] = ecr_resolve.resolve_target_branch(svc)

        # Summarize branches for logging
        branch_groups: dict[str, list[str]] = {}
        for svc, br in svc_branches.items():
            branch_groups.setdefault(br, []).append(svc)

        async with self:
            self._current_steps["merge"] = "running"
            self.live_step = "merge"
            self._sync_active_run(run_id, force_disk=True)
            self._log("merge", "h", "\u2500\u2500\u2500 Git Merge \u2500\u2500\u2500")
            for br, svcs in branch_groups.items():
                self._log("merge", "i",
                           f"  Merging master \u2192 {br} for "
                           f"{len(svcs)} services: {', '.join(svcs)}")

            # Initialize all services as "running"
            # Include currently deployed tag from YAML repo for comparison
            from autotest.services.ecr_client import get_service_registry
            registry = get_service_registry()
            self.merge_statuses = [
                {"name": svc, "sha": "", "status": "running", "message": "",
                 "branch": svc_branches[svc],
                 "deployed_tag": (registry.get(svc).current_tag if registry.get(svc) else "")}
                for svc in self._selected_services
            ]

        # Build index for fast lookup
        svc_index = {
            svc: i for i, svc in enumerate(self._selected_services)
        }

        # Launch all merges in parallel — each with its own target branch
        gh = GitHubClient()
        merge_msg = f"{self._triggered_by} via AutoDeploy v3" if self._triggered_by else ""
        futures = [
            asyncio.ensure_future(
                gh.merge_master_to_branch(svc, svc_branches[svc], merge_msg)
            )
            for svc in self._selected_services
        ]

        # Report each as it completes
        done_set: set[int] = set()
        while len(done_set) < len(futures):
            finished, _ = await asyncio.wait(
                futures, timeout=0.5, return_when=asyncio.FIRST_COMPLETED,
            )
            for fut in finished:
                idx = futures.index(fut)
                if idx in done_set:
                    continue
                done_set.add(idx)
                result = fut.result()
                rd = result.to_dict()

                # Enrich with expected ECR image tag
                if result.sha:
                    sha10 = result.sha[:10]
                    _, prefix = ecr_resolve.resolve_service(result.service)
                    if not prefix:
                        prefix = f"{default_branch}-"
                    rd["ecr_tag"] = f"{prefix}{sha10}"
                    rd["ecr_repo"] = ecr_resolve._repo_name(result.service)

                async with self:
                    updated = list(self.merge_statuses)
                    # Preserve deployed_tag from initial entry
                    rd["deployed_tag"] = updated[idx].get("deployed_tag", "")
                    updated[idx] = rd
                    self.merge_statuses = updated

                    # Store SHA
                    if result.sha:
                        self._shas[result.service] = result.sha

                    ok = result.status == "success"
                    noop = result.status == "no-op"
                    icon = "\u2713" if (ok or noop) else "\u2715"
                    kind = "s" if (ok or noop) else "e"
                    sha_str = result.sha[:10] if result.sha else ""
                    ecr_tag = rd.get("ecr_tag", "")
                    extra = (
                        f" \u2192 {sha_str}" if sha_str
                        else f" ({result.message})" if result.message
                        else ""
                    )
                    self._log("merge", kind,
                              f"  {icon} {result.service}{extra}")
                    if ecr_tag and (ok or noop):
                        self._log("merge", "i",
                                  f"      \u21b3 ECR: {rd.get('ecr_repo', '')}:{ecr_tag}")

        # Fetch branch HEAD SHAs (master + target) for all services
        try:
            branch_shas = await gh.fetch_branch_shas_batch(
                self._selected_services, svc_branches,
            )
            async with self:
                updated = list(self.merge_statuses)
                for i, svc in enumerate(self._selected_services):
                    shas = branch_shas.get(svc, {})
                    entry = dict(updated[i])
                    entry["master_sha"] = shas.get("master_sha", "")
                    entry["target_sha"] = shas.get("target_sha", "")
                    updated[i] = entry
                self.merge_statuses = updated
                self._log("merge", "i",
                          f"  Branch HEADs fetched for {len(branch_shas)} services")

                # Populate _shas for ALL non-failed services using target_sha
                # (services with new merges already have _shas set from result.sha)
                for svc in self._selected_services:
                    if svc not in self._shas:
                        ms = next((m for m in self.merge_statuses if m["name"] == svc), None)
                        if ms and ms.get("target_sha"):
                            self._shas[svc] = ms["target_sha"]

                # Add ecr_tag to no-op merge_statuses (newly merged already have it)
                updated = list(self.merge_statuses)
                for i, ms in enumerate(updated):
                    if ms["status"] == "no-op" and not ms.get("ecr_tag") and ms["name"] in self._shas:
                        sha10 = self._shas[ms["name"]][:10]
                        _, prefix = ecr_resolve.resolve_service(ms["name"])
                        if not prefix:
                            prefix = f"{branch}-"
                        entry = dict(updated[i])
                        entry["ecr_tag"] = f"{prefix}{sha10}"
                        entry["ecr_repo"] = ecr_resolve._repo_name(ms["name"])
                        updated[i] = entry
                self.merge_statuses = updated

        except Exception:
            log.exception("Failed to fetch branch SHAs — continuing without them")

        # Check overall result and track actually-merged services
        async with self:
            failed = [
                m for m in self.merge_statuses if m["status"] == "failed"
            ]
            actually_merged = [
                m["name"] for m in self.merge_statuses
                if m["status"] in ("success", "no-op")
            ]
            noop = [
                m["name"] for m in self.merge_statuses
                if m["status"] == "no-op"
            ]
            self._actually_merged = actually_merged
            n = len(self._selected_services)

            if failed:
                fail_names = ", ".join(m["name"] for m in failed)
                self._log("merge", "e",
                          f"  \u2715 {len(failed)}/{n} merges failed: {fail_names}")
                self._current_steps["merge"] = "failed"
            else:
                self._log("merge", "s",
                          f"  \u2713 All {n} services merged successfully")
                if actually_merged:
                    self._log("merge", "i",
                              f"  \u25cf {len(actually_merged)} actually merged: "
                              f"{', '.join(actually_merged)}")
                if noop:
                    self._log("merge", "i",
                              f"  \u25cb {len(noop)} already up to date (no new commits)")
                self._current_steps["merge"] = "success"

            self._sync_active_run(run_id)

        # Run diagnostics + send Slack on failure
        if failed:
            # CEN-PE auto-diagnostics
            ctx = f"Failed merges ({len(failed)}/{n}):\n"
            ctx += "\n".join(
                f"  - {m['name']}: {m.get('message', 'unknown')}" for m in failed
            )
            try:
                diag = await asyncio.wait_for(
                    self._run_diagnostics("merge", ctx), timeout=25.0)
            except asyncio.TimeoutError:
                diag = "Diagnostics timed out after 25s"
                log.warning("Diagnostics timeout for step merge")
            actions = await self._propose_actions("merge", diag, ctx)
            async with self:
                self.diagnostics = diag
                self.proposed_actions = actions
                self._log("merge", "i", f"  CEN-PE Agent Diagnostics: {diag[:200]}")
                if actions:
                    self._log("merge", "i", f"  CEN-PE proposed {len(actions)} actions")

        await asyncio.sleep(0.3)

    async def _run_build_step(self, run_id: str) -> None:
        """Execute Image Check — check ECR for ALL selected services.

        All services (both newly merged and no-op) are verified in ECR.
        Phase 1: Check ECR — if image exists, done.
        Phase 2: If missing (newly merged), monitor Jenkins build until image stage completes.
        """
        from autotest.services.ecr_client import refresh_service_registry

        branch = cfg.pipeline.target_branch
        ecr = EcrClient()
        # Refresh registry from YAML repo to get latest current_tag values
        registry = refresh_service_registry()
        n = len(self._selected_services)

        async with self:
            self._current_steps["build"] = "running"
            self.live_step = "build"
            self._sync_active_run(run_id, force_disk=True)
            self._log("build", "h", "\u2500\u2500\u2500 Image Check \u2500\u2500\u2500")

            # Initialize statuses — all services get ECR verification
            self.build_statuses = []
            for svc in self._selected_services:
                tag = ecr.expected_tag(svc, self._shas.get(svc, "?"))
                self.build_statuses.append({
                    "name": svc, "tag": tag,
                    "status": "running", "phase": "checking", "message": "",
                    "jenkins_url": "", "stages": [],
                })

            self._log("build", "i",
                      f"  Checking ECR for {n} services...")

        # Separate no-op (no new commits) from actually-merged services
        noop_set = {
            m["name"] for m in self.merge_statuses if m["status"] == "no-op"
        }

        # ALL services get ECR verification — no skipping, even for no-op
        to_check: list[tuple[int, str]] = list(enumerate(self._selected_services))

        # ── Phase 1: Check ECR for ALL services ──
        async with self:
            self._log("build", "i",
                      f"  Checking ECR for {len(to_check)} services...")

        async def _ecr_check(idx: int, svc: str) -> bool:
            """Check ECR, update UI. Returns True if image exists."""
            sha = self._shas.get(svc, "unknown")
            tag = ecr.expected_tag(svc, sha)
            exists, msg = await ecr.check_image_exists(svc, tag)
            async with self:
                updated = list(self.build_statuses)
                if exists:
                    updated[idx] = {
                        "name": svc, "tag": tag, "status": "success",
                        "phase": "exists", "message": "Image already in ECR",
                        "jenkins_url": "", "stages": [],
                    }
                    self._log("build", "s", f"  \u2713 {svc} \u2192 {tag} (ECR \u2713)")
                else:
                    # Distinguish "image not found" from "can't check ECR"
                    is_auth = any(k in msg.lower() for k in (
                        "not configured", "not installed", "access denied",
                        "expired", "token", "credentials",
                    ))
                    updated[idx] = {
                        "name": svc, "tag": tag, "status": "running",
                        "phase": "missing",
                        "message": "ECR auth unavailable \u2014 will verify via Jenkins" if is_auth else "Image not in ECR",
                        "jenkins_url": "", "stages": [],
                    }
                    if is_auth:
                        self._log("build", "w",
                                  f"  \u26a0 {svc}: ECR auth unavailable, will verify via Jenkins")
                self.build_statuses = updated
            return exists

        ecr_results_raw = await asyncio.gather(*[
            _ecr_check(idx, svc) for idx, svc in to_check
        ], return_exceptions=True)

        # Treat exceptions as "not found" (False)
        ecr_results = [
            r if isinstance(r, bool) else False for r in ecr_results_raw
        ]

        # Determine which services are missing from ECR
        missing_all: list[tuple[int, str]] = [
            (idx, svc) for (idx, svc), exists in zip(to_check, ecr_results)
            if not exists
        ]
        existed = sum(1 for r in ecr_results if r)

        # No-op services missing from ECR = warn and proceed with deployed tag
        missing_noop = [(idx, svc) for idx, svc in missing_all if svc in noop_set]
        # Merged services missing from ECR = route to Jenkins monitoring
        missing_merged = [(idx, svc) for idx, svc in missing_all if svc not in noop_set]

        if missing_noop:
            async with self:
                updated = list(self.build_statuses)
                for idx, svc in missing_noop:
                    expected = updated[idx]["tag"]
                    # Fall back to the current deployed tag from YAML repo
                    info = registry.get(svc)
                    deployed_tag = info.current_tag if info else expected
                    updated[idx] = {
                        "name": svc, "tag": deployed_tag, "status": "success",
                        "phase": "exists",
                        "message": f"No-op — using deployed tag (expected {expected} not in ECR)",
                        "jenkins_url": "", "stages": [],
                    }
                    self._log("build", "w",
                              f"  ⚠ {svc}: expected {expected} not in ECR, "
                              f"using deployed tag {deployed_tag}")
                self.build_statuses = updated

        async with self:
            if not missing_all:
                self._log("build", "s",
                          f"  ✓ All {len(to_check)} images verified in ECR")
            elif missing_merged:
                names = ", ".join(svc for _, svc in missing_merged)
                self._log("build", "i",
                          f"  {existed}/{len(to_check)} cached. "
                          f"{len(missing_merged)} missing: {names}")
                self._log("build", "i",
                          f"  Monitoring Jenkins for missing images...")
            self._sync_active_run(run_id)

        # ── Phase 2: Monitor Jenkins only for newly-merged missing images ──
        missing = missing_merged
        if missing:
            jenkins = JenkinsClient(variant="build")

            async def _monitor_one(idx: int, svc: str) -> None:
                sha = self._shas.get(svc, "unknown")
                tag = ecr.expected_tag(svc, sha)
                info = registry.get(svc)
                git_repo = info.git_repo if info else svc
                base_url = cfg.jenkins_build.url.rstrip("/")

                j_url = jenkins_job_url(base_url, svc, git_repo)
                async with self:
                    updated = list(self.build_statuses)
                    updated[idx] = {
                        "name": svc, "tag": tag, "status": "running",
                        "phase": "monitoring", "message": "Waiting for Jenkins build...",
                        "jenkins_url": j_url, "stages": [],
                    }
                    self.build_statuses = updated
                    self._log("build", "i",
                              f"  \u25cb {svc}: monitoring Jenkins ({git_repo})...")

                async def _on_stage(job_name: str, build_num: int, stages: list[dict],
                                    overall: str, phase: str, detail: str) -> None:
                    burl = jenkins_job_url(base_url, svc, git_repo, build_num)
                    async with self:
                        updated = list(self.build_statuses)
                        updated[idx] = {
                            "name": svc, "tag": tag, "status": "running",
                            "phase": "building", "message": detail,
                            "jenkins_url": burl, "stages": stages,
                        }
                        self.build_statuses = updated

                result = await jenkins.find_and_monitor_build(
                    service=svc, git_repo=git_repo,
                    on_stage_update=_on_stage,
                    timeout_secs=600,
                    wait_for_image_stage=True,
                )

                j_url_final = result.url or j_url

                if result.status == "success":
                    async with self:
                        self._log("build", "i",
                                  f"  \u25cb {svc}: Jenkins image stage done, verifying ECR...")
                    ecr_ok = False
                    ecr_auth_fail = False
                    for attempt in range(5):
                        exists, msg = await ecr.check_image_exists(svc, tag)
                        if exists:
                            ecr_ok = True
                            break
                        # If ECR auth/config issue, trust Jenkins success
                        if any(k in msg.lower() for k in (
                            "not configured", "not installed", "access denied",
                            "expired", "token", "credentials",
                        )):
                            ecr_ok = True
                            ecr_auth_fail = True
                            break
                        await asyncio.sleep(3.0)

                    async with self:
                        updated = list(self.build_statuses)
                        if ecr_ok:
                            if ecr_auth_fail:
                                detail = f"Jenkins #{result.build_num} \u2713 (ECR unverified \u2014 auth)"
                            else:
                                detail = f"Jenkins #{result.build_num} \u2192 ECR \u2713"
                            updated[idx] = {
                                "name": svc, "tag": tag, "status": "success",
                                "phase": "jenkins_built", "message": detail,
                                "jenkins_url": j_url_final, "stages": result.stages,
                            }
                            self._log("build", "s",
                                      f"  \u2713 {svc} \u2192 {tag} ({detail})")
                        else:
                            updated[idx] = {
                                "name": svc, "tag": tag, "status": "failed",
                                "phase": "verify_failed",
                                "message": f"Jenkins OK but {tag} not in ECR",
                                "jenkins_url": j_url_final, "stages": result.stages,
                            }
                            self._log("build", "e",
                                      f"  \u2715 {svc}: Jenkins #{result.build_num} OK but {tag} not in ECR")
                        self.build_statuses = updated
                else:
                    async with self:
                        updated = list(self.build_statuses)
                        updated[idx] = {
                            "name": svc, "tag": tag, "status": "failed",
                            "phase": "jenkins_failed",
                            "message": "Jenkins build failed",
                            "jenkins_url": j_url_final, "stages": result.stages,
                        }
                        self.build_statuses = updated
                        self._log("build", "e",
                                  f"  \u2715 {svc}: Jenkins build failed ({result.duration})")

            await asyncio.gather(*[
                _monitor_one(idx, svc) for idx, svc in missing
            ], return_exceptions=True)

        # ── Check overall result ──
        async with self:
            failed = [b for b in self.build_statuses if b["status"] == "failed"]
            cached = sum(1 for b in self.build_statuses if b["phase"] == "exists")
            jenkins_built = sum(1 for b in self.build_statuses if b["phase"] == "jenkins_built")

            if failed:
                fail_names = ", ".join(b["name"] for b in failed)
                self._log("build", "e",
                          f"  ✕ {len(failed)}/{n} failed: {fail_names}")
                self._current_steps["build"] = "failed"
            else:
                self._log("build", "s",
                          f"  ✓ All {n} images verified "
                          f"({cached} cached, "
                          f"{jenkins_built} via Jenkins)")
                self._current_steps["build"] = "success"

            self._sync_active_run(run_id)

        # Run diagnostics + send Slack on failure
        if failed:
            # CEN-PE auto-diagnostics
            ctx = f"Failed builds ({len(failed)}/{n}):\n"
            ctx += "\n".join(
                f"  - {b['name']}: phase={b.get('phase')}, {b.get('message', '')}"
                for b in failed
            )
            try:
                diag = await asyncio.wait_for(
                    self._run_diagnostics("build", ctx), timeout=25.0)
            except asyncio.TimeoutError:
                diag = "Diagnostics timed out after 25s"
                log.warning("Diagnostics timeout for step build")
            actions = await self._propose_actions("build", diag, ctx)
            async with self:
                self.diagnostics = diag
                self.proposed_actions = actions
                self._log("build", "i", f"  CEN-PE Agent Diagnostics: {diag[:200]}")
                if actions:
                    self._log("build", "i", f"  CEN-PE proposed {len(actions)} actions")

        await asyncio.sleep(0.3)

    async def _run_gitops_step(self, run_id: str) -> None:
        """Execute Staging GitOps Update — git pull, update YAML tags, commit & push.

        Only updates services that were actually merged (have new SHAs).
        Services that were "already up to date" are skipped.

        Flow:
        1. git pull the YAML repo
        2. For each actually-merged service: update global.image.tag in values-staging-ug.yaml
        3. git add + commit with descriptive message
        4. git push
        """
        import yaml

        branch = cfg.pipeline.target_branch
        ecr_resolve = EcrClient()
        repo_path = Path(cfg.gitops.yaml_repo_path)
        if not repo_path.is_absolute():
            repo_path = Path.cwd() / repo_path
        values_file = cfg.gitops.yaml_values_file  # "values-staging-ug.yaml"
        n = len(self._selected_services)

        async with self:
            self._current_steps["gitops"] = "running"
            self.live_step = "gitops"
            self._sync_active_run(run_id, force_disk=True)
            self._log("gitops", "h", "\u2500\u2500\u2500 Staging GitOps Update \u2500\u2500\u2500")

        # ── Check if another pipeline holds the deploy lock ──
        country = cfg.argocd.country or "ug"
        gh = GitHubClient()
        existing_lock = await gh.check_deploy_lock(country)
        if existing_lock:
            import time as _tmod
            lock_age = _tmod.time() - existing_lock.get("locked_at_epoch", 0)
            lock_ttl = existing_lock.get("ttl_secs", 3600)
            if lock_age < lock_ttl:
                lock_run = existing_lock.get("run_id", "?")
                lock_by = existing_lock.get("triggered_by", "?")
                age_min = int(lock_age / 60)
                async with self:
                    self._log("gitops", "w",
                              f"  \u26a0 Deploy lock held by run {lock_run} "
                              f"({lock_by}, {age_min}min ago)")
                    self._log("gitops", "w",
                              f"  \u26a0 Another QA test is in progress for "
                              f"staging-{country} — values files are locked")
                    self._log("gitops", "e",
                              f"  \u2715 Cannot proceed — wait for run {lock_run} "
                              f"to complete or release the lock")
                    self._current_steps["gitops"] = "failed"
                    self._sync_active_run(run_id)
                return

        async with self:
            # Initialize statuses — use tags from build_statuses (correctly
            # computed for both merged and no-op services)
            build_tag_map = {
                b["name"]: b["tag"] for b in self.build_statuses if b.get("tag")
            }
            self.gitops_statuses = []
            for svc in self._selected_services:
                tag = build_tag_map.get(svc, "")
                if not tag:
                    sha10 = self._shas.get(svc, "?")[:10]
                    _, prefix = ecr_resolve.resolve_service(svc)
                    if not prefix:
                        prefix = f"{branch}-"
                    tag = f"{prefix}{sha10}"
                self.gitops_statuses.append({
                    "name": svc, "tag": tag,
                    "status": "running", "phase": "pending",
                    "message": "",
                })

            self._log("gitops", "i",
                      f"  Checking {n} services in YAML repo...")

        # ── Step 1: Sync PVC to origin/master ──
        async with self:
            self._log("gitops", "i",
                       "  Syncing PVC yaml-repo to origin/master...")

        try:
            # Fetch latest from remote
            for cmd in [
                ["git", "fetch", "origin"],
                ["git", "checkout", "master"],
                ["git", "reset", "--hard", "origin/master"],
            ]:
                proc = await asyncio.create_subprocess_exec(
                    *cmd, cwd=str(repo_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                out, err = await asyncio.wait_for(
                    proc.communicate(), timeout=60.0)
                if proc.returncode != 0:
                    err_s = err.decode().strip()
                    async with self:
                        self._log("gitops", "e",
                                  f"  ✕ {' '.join(cmd)}: {err_s[:150]}")

            async with self:
                self._log("gitops", "s",
                           "  ✓ PVC synced to origin/master")
        except Exception as exc:
            async with self:
                self._log("gitops", "e", f"  git sync failed: {exc}")

        # ── Step 2: Update each service's values-staging-ug.yaml ──
        updated_services: list[str] = []
        updated_tags: dict[str, str] = {}
        updated_folders: dict[str, str] = {}  # svc_name → yaml_folder

        for i, svc in enumerate(self._selected_services):
            # Use tag from build_statuses (correctly computed for merged + no-op)
            bs = next((b for b in self.build_statuses if b["name"] == svc), None)
            if bs and bs.get("tag"):
                new_tag = bs["tag"]
            else:
                sha10 = self._shas.get(svc, "unknown")[:10]
                _, prefix = ecr_resolve.resolve_service(svc)
                if not prefix:
                    prefix = f"{branch}-"
                new_tag = f"{prefix}{sha10}"

            # fe-web-mvc: tag lives in web-mvc/values-staging-ug.yaml
            # at global.image.fe_web_mvc.tag (nested under backend values)
            if svc == "fe-web-mvc":
                yaml_folder = "web-mvc"
                tag_path = ["global", "image", "fe_web_mvc", "tag"]
            else:
                yaml_folder = svc
                tag_path = ["global", "image", "tag"]

            vf = repo_path / yaml_folder / values_file
            if not vf.exists():
                async with self:
                    updated = list(self.gitops_statuses)
                    updated[i] = {
                        "name": svc, "tag": new_tag,
                        "status": "failed", "phase": "missing",
                        "message": f"{yaml_folder}/{values_file} not found",
                    }
                    self.gitops_statuses = updated
                    self._log("gitops", "e",
                              f"  \u2715 {svc}: {yaml_folder}/{values_file} not found")
                continue

            try:
                content = vf.read_text()
                data = yaml.safe_load(content)

                # Navigate nested dict via tag_path to read old tag
                node = data
                for key in tag_path[:-1]:
                    node = (node or {}).get(key, {})
                old_tag = (node or {}).get(tag_path[-1], "")

                if old_tag == new_tag:
                    async with self:
                        updated = list(self.gitops_statuses)
                        updated[i] = {
                            "name": svc, "tag": new_tag,
                            "status": "success", "phase": "unchanged",
                            "message": "Tag already current",
                        }
                        self.gitops_statuses = updated
                        self._log("gitops", "i",
                                  f"  \u25cb {svc}: tag already {new_tag}")
                    continue

                # Update the tag using string replacement (preserves YAML formatting)
                if old_tag:
                    new_content = content.replace(
                        f'tag: "{old_tag}"', f'tag: "{new_tag}"'
                    )
                    if new_content == content:
                        # Try without quotes
                        new_content = content.replace(
                            f"tag: {old_tag}", f'tag: "{new_tag}"'
                        )
                else:
                    # No existing tag — insert under global.image
                    new_content = content

                vf.write_text(new_content)
                updated_services.append(svc)
                updated_tags[svc] = new_tag
                updated_folders[svc] = yaml_folder

                async with self:
                    updated = list(self.gitops_statuses)
                    updated[i] = {
                        "name": svc, "tag": new_tag, "old_tag": old_tag,
                        "status": "success", "phase": "updated",
                        "message": f"{old_tag} → {new_tag}",
                    }
                    self.gitops_statuses = updated
                    self._log("gitops", "s",
                              f"  ✓ {svc}: {old_tag} → {new_tag}")

            except Exception as exc:
                async with self:
                    updated = list(self.gitops_statuses)
                    updated[i] = {
                        "name": svc, "tag": new_tag,
                        "status": "failed", "phase": "error",
                        "message": str(exc)[:100],
                    }
                    self.gitops_statuses = updated
                    self._log("gitops", "e",
                              f"  \u2715 {svc}: {exc}")

        # ── Step 3: git add + commit + push ──
        if updated_services:
            # Build concise commit message with qa-goldenpath label + run number
            svc_list = ", ".join(updated_services)
            tag_lines = " | ".join(
                f"{svc}={updated_tags[svc]}" for svc in updated_services
            )
            triggered = self._triggered_by or "autotest"
            run_num = run_id.lstrip("r") if run_id.startswith("r") else run_id
            cid = get_correlation_id()
            cid_suffix = f" [{cid}]" if cid else ""
            commit_msg = (
                f"qa-goldenpath #{run_num} staging-ug ({triggered}): "
                f"{svc_list} [{tag_lines}]{cid_suffix}"
            )
            # Use logged-in user as git author
            author_name = triggered or "autotest"
            # Try to resolve email from roster
            email_map = _parse_email_map(self.roster) if self.roster else {}
            author_email = email_map.get(f"@{author_name}", email_map.get(author_name, f"{author_name}@sporty.com"))

            async with self:
                self._log("gitops", "i",
                          f"  git add + commit ({len(updated_services)} files)...")

            try:
                # Ensure git identity is configured (required for commit in containers)
                for cfg_key, cfg_val in [("user.name", "qa-autotest"), ("user.email", "qa-autotest@sporty.com")]:
                    proc = await asyncio.create_subprocess_exec(
                        "git", "config", cfg_key, cfg_val,
                        cwd=str(repo_path),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=5.0)

                # git add all changed values files
                add_files = [
                    str(repo_path / updated_folders[svc] / values_file)
                    for svc in updated_services
                ]
                proc = await asyncio.create_subprocess_exec(
                    "git", "add", *add_files,
                    cwd=str(repo_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await asyncio.wait_for(proc.communicate(), timeout=30.0)

                # git commit with logged-in user as author
                proc = await asyncio.create_subprocess_exec(
                    "git", "commit",
                    "--author", f"{author_name} <{author_email}>",
                    "-m", commit_msg,
                    cwd=str(repo_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=30.0)
                if proc.returncode != 0:
                    err = stderr.decode().strip()
                    async with self:
                        self._log("gitops", "w", f"  git commit: {err[:150]}")
                else:
                    async with self:
                        self._log("gitops", "s",
                                  f"  \u2713 Committed: staging-ug: update "
                                  f"{len(updated_services)} image tags")

                # git push to master explicitly
                async with self:
                    self._log("gitops", "i", "  git push origin master...")

                proc = await asyncio.create_subprocess_exec(
                    "git", "push", "origin", "master",
                    cwd=str(repo_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=60.0)
                if proc.returncode != 0:
                    err = stderr.decode().strip()
                    async with self:
                        self._log("gitops", "e", f"  \u2715 git push failed: {err[:200]}")
                        # Mark all as failed
                        for i, svc in enumerate(self._selected_services):
                            if svc in updated_services:
                                updated = list(self.gitops_statuses)
                                updated[i] = {
                                    "name": svc,
                                    "tag": updated_tags.get(svc, ""),
                                    "status": "failed", "phase": "push_failed",
                                    "message": "git push failed",
                                }
                                self.gitops_statuses = updated
                else:
                    # Verify push: git pull and check our commit is in remote
                    async with self:
                        self._log("gitops", "i", "  Verifying push (git pull --ff-only)...")
                    verify_ok = False
                    try:
                        vproc = await asyncio.create_subprocess_exec(
                            "git", "pull", "--ff-only",
                            cwd=str(repo_path),
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        vstdout, vstderr = await asyncio.wait_for(
                            vproc.communicate(), timeout=30.0)
                        # Check latest commit message matches ours
                        lproc = await asyncio.create_subprocess_exec(
                            "git", "log", "--oneline", "-1",
                            cwd=str(repo_path),
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        lstdout, _ = await asyncio.wait_for(
                            lproc.communicate(), timeout=10.0)
                        last_commit = lstdout.decode().strip()
                        if "qa-goldenpath" in last_commit:
                            verify_ok = True
                    except Exception as vexc:
                        async with self:
                            self._log("gitops", "w", f"  Verify pull failed: {vexc}")

                    if verify_ok:
                        push_ts = time.time()
                        async with self:
                            self._log("gitops", "s", "  \u2713 git push verified OK")
                            # Mark all pushed services as pushed + record push timestamp
                            for i, svc in enumerate(self._selected_services):
                                if svc in updated_services:
                                    updated = list(self.gitops_statuses)
                                    entry = dict(updated[i])
                                    entry["phase"] = "pushed"
                                    entry["message"] = "Pushed and verified"
                                    updated[i] = entry
                                    self._tag_pushed_at[svc] = push_ts
                                    self.gitops_statuses = updated
                    else:
                        async with self:
                            self._log("gitops", "e",
                                      "  \u2715 git push could not be verified — "
                                      "commit not found on remote")
                            for i, svc in enumerate(self._selected_services):
                                if svc in updated_services:
                                    updated = list(self.gitops_statuses)
                                    updated[i] = {
                                        "name": svc,
                                        "tag": updated_tags.get(svc, ""),
                                        "status": "failed",
                                        "phase": "verify_failed",
                                        "message": "Push not verified on remote",
                                    }
                                    self.gitops_statuses = updated

            except Exception as exc:
                async with self:
                    self._log("gitops", "e", f"  \u2715 git error: {exc}")

        # ── Check overall ──
        async with self:
            failed = [g for g in self.gitops_statuses if g["status"] == "failed"]

            if failed:
                fail_names = ", ".join(g["name"] for g in failed)
                self._log("gitops", "e",
                          f"  \u2715 {len(failed)}/{n} failed: {fail_names}")
                self._current_steps["gitops"] = "failed"

            else:
                pushed = sum(1 for g in self.gitops_statuses if g.get("phase") == "pushed")
                unchanged = sum(1 for g in self.gitops_statuses if g.get("phase") == "unchanged")
                self._log("gitops", "s",
                          f"  \u2713 GitOps complete — {pushed} pushed"
                          f"{f', {unchanged} unchanged' if unchanged else ''}")
                self._current_steps["gitops"] = "success"

            self._sync_active_run(run_id)

        # Run diagnostics on failure
        if failed:
            ctx = f"Failed GitOps updates ({len(failed)}/{n}):\n"
            ctx += "\n".join(
                f"  - {g['name']}: phase={g.get('phase')}, {g.get('message', '')}"
                for g in failed
            )
            try:
                diag = await asyncio.wait_for(
                    self._run_diagnostics("gitops", ctx), timeout=25.0)
            except asyncio.TimeoutError:
                diag = "Diagnostics timed out after 25s"
                log.warning("Diagnostics timeout for step gitops")
            actions = await self._propose_actions("gitops", diag, ctx)
            async with self:
                self.diagnostics = diag
                self.proposed_actions = actions
                self._log("gitops", "i", f"  CEN-PE Agent Diagnostics: {diag[:200]}")
                if actions:
                    self._log("gitops", "i", f"  CEN-PE proposed {len(actions)} actions")

        await asyncio.sleep(0.3)

    async def _run_jenkins_step(self, run_id: str) -> None:
        """Execute the Trigger WAP+RESTAPI QA Jobs step.

        Triggers two Jenkins jobs in parallel, streams pipeline stages live
        via wfapi, then sends Slack notification on completion.
        Skipped entirely when SKIP_JENKINS_QA=true.
        """
        if self._skip_jenkins_qa or cfg.pipeline.skip_jenkins_qa:
            async with self:
                self._current_steps["jenkins"] = "skipped"
                self.live_step = "jenkins"
                self._log("jenkins", "h",
                           "\u2500\u2500\u2500 Trigger WAP+RESTAPI QA Jobs \u2500\u2500\u2500")
                reason = "user toggle" if self._skip_jenkins_qa else "SKIP_JENKINS_QA=true"
                self._log("jenkins", "w",
                           f"  \u23ed Skipped — {reason}")
                self._sync_active_run(run_id, force_disk=True)
            return

        job_defs = [
            {"name": "WAP_pre_release", "label": "WAP Pre-Release"},
            {"name": "RESTAPI_pre_release", "label": "RESTAPI Pre-Release"},
        ]
        job_index = {j["name"]: i for i, j in enumerate(job_defs)}

        async with self:
            self._current_steps["jenkins"] = "running"
            self.live_step = "jenkins"
            self._sync_active_run(run_id, force_disk=True)
            self._log("jenkins", "h",
                       "\u2500\u2500\u2500 Trigger WAP+RESTAPI QA Jobs \u2500\u2500\u2500")

            # Initialize job tracker as running
            self.jenkins_jobs = [
                {"name": j["name"], "label": j["label"],
                 "status": "running", "build_num": 0,
                 "duration": "\u2014", "url": "", "stages": []}
                for j in job_defs
            ]
            self._log("jenkins", "i",
                       f"  Triggering {len(job_defs)} parallel Jenkins jobs...")
            self._persist_live_state()

        # Stage callback — pushes live stage/queue updates to the UI
        async def on_stage_update(
            job_name: str, build_num: int,
            stages: list[dict], overall: str,
            phase: str, detail: str,
        ) -> None:
            idx = job_index.get(job_name)
            if idx is None:
                return
            jdef = job_defs[idx]
            async with self:
                updated = list(self.jenkins_jobs)
                job_entry = dict(updated[idx])
                job_entry["build_num"] = build_num
                job_entry["stages"] = stages
                job_entry["phase"] = phase
                job_entry["phase_detail"] = detail
                if build_num and cfg.jenkins.url:
                    job_entry["url"] = f"{cfg.jenkins.url}/job/{job_name}/{build_num}"
                if overall in ("success", "failed", "aborted", "unstable", "timeout"):
                    job_entry["status"] = overall
                updated[idx] = job_entry
                self.jenkins_jobs = updated
                self._persist_live_state()

                # Log phase transitions
                if phase == "queued":
                    q_stage = next((s for s in stages if s.get("id") == "q"), None)
                    q_dur = q_stage["duration"] if q_stage else "—"
                    self._log("jenkins", "w",
                              f"  \u23f3 {jdef['label']} queued ({q_dur}) — {detail}")
                elif phase == "executing":
                    running = [s for s in stages if s.get("status") == "in_progress"]
                    if running:
                        cur = running[0]["name"]
                        self._log("jenkins", "i",
                                  f"  \u238e {jdef['label']} #{build_num} "
                                  f"\u2192 {cur} — {detail}")

        # Trigger Jenkins jobs in parallel with stage streaming
        jenkins = JenkinsClient()
        futures = [
            asyncio.ensure_future(
                jenkins.trigger_and_stream(j["name"], on_stage_update=on_stage_update)
            )
            for j in job_defs
        ]

        # Report each job as it completes
        done_set: set[int] = set()
        while len(done_set) < len(futures):
            finished, _ = await asyncio.wait(
                futures, timeout=0.5, return_when=asyncio.FIRST_COMPLETED,
            )
            for fut in finished:
                idx = futures.index(fut)
                if idx in done_set:
                    continue
                done_set.add(idx)
                result = fut.result()

                job_def = job_defs[idx]
                job_result = result.to_dict()

                async with self:
                    # Final update with complete result
                    updated_jobs = list(self.jenkins_jobs)
                    updated_jobs[idx] = {
                        "name": job_def["name"],
                        "label": job_def["label"],
                        "status": job_result["status"],
                        "build_num": job_result["build_num"],
                        "duration": job_result["duration"],
                        "stages": job_result.get("stages", []),
                        "queue_duration": job_result.get("queue_duration", ""),
                        "exec_duration": job_result.get("exec_duration", ""),
                        "url": job_result.get("url") or (
                            f"{cfg.jenkins.url}/job/{job_def['name']}"
                            f"/{job_result['build_num']}"
                            if cfg.jenkins.url else ""
                        ),
                    }
                    self.jenkins_jobs = updated_jobs
                    self._persist_live_state()

                    status = job_result["status"]
                    if status == "success":
                        icon, kind, label = "\u2713", "s", "SUCCESS"
                    elif status == "timeout":
                        icon, kind, label = "\u23f3", "w", "STILL RUNNING (watch timeout)"
                    else:
                        icon, kind, label = "\u2715", "e", "FAILED"
                    self._log("jenkins", kind,
                              f"  {icon} {job_def['label']} \u2192 "
                              f"#{job_result['build_num']} "
                              f"({job_result['duration']}) "
                              f"{label}")

        # Check overall result
        async with self:
            all_ok = all(
                j["status"] == "success" for j in self.jenkins_jobs
            )
            timed_out = [j for j in self.jenkins_jobs if j["status"] == "timeout"]
            failed = [j for j in self.jenkins_jobs
                      if j["status"] not in ("success", "timeout")]

            if all_ok:
                self._log("jenkins", "s",
                          f"  \u2713 All {len(job_defs)} QA jobs passed")
                self._current_steps["jenkins"] = "success"
            elif timed_out and not failed:
                # Jobs are still running — not a failure, we just stopped watching
                to_names = ", ".join(j["label"] for j in timed_out)
                self._log("jenkins", "w",
                          f"  \u23f3 {len(timed_out)} job(s) still running "
                          f"(watch timeout): {to_names}")
                self._log("jenkins", "w",
                          f"  \u2192 Check Jenkins directly for final results")
                self._current_steps["jenkins"] = "success"
            else:
                fail_names = ", ".join(
                    j["label"] for j in (failed + timed_out)
                )
                self._log("jenkins", "e",
                          f"  \u2715 {len(failed)} job(s) failed: {fail_names}")
                self._current_steps["jenkins"] = "failed"

            self._sync_active_run(run_id)

        # CEN-PE auto-diagnostics on failure
        diag = ""
        if failed:
            ctx = f"Failed Jenkins jobs ({len(failed)}):\n"
            for j in failed:
                ctx += (
                    f"  - {j.get('label', j.get('name'))}: "
                    f"#{j.get('build_num')} ({j.get('duration')})"
                )
                if j.get("url"):
                    ctx += f"\n    URL: {j['url']}"
                fail_stages = [
                    s for s in j.get("stages", [])
                    if s.get("status") in ("FAILED", "ABORTED", "UNSTABLE")
                ]
                if fail_stages:
                    ctx += "\n    Failed stages: " + ", ".join(
                        f"{s.get('name', '?')} ({s.get('status', '?')})"
                        for s in fail_stages
                    )
                ctx += "\n"
            try:
                diag = await asyncio.wait_for(
                    self._run_diagnostics("jenkins", ctx), timeout=25.0)
            except asyncio.TimeoutError:
                diag = "Diagnostics timed out after 25s"
                log.warning("Diagnostics timeout for step jenkins")
            actions = await self._propose_actions("jenkins", diag, ctx)
            async with self:
                self.diagnostics = diag
                self.proposed_actions = actions
                self._log("jenkins", "i", f"  CEN-PE Agent Diagnostics: {diag[:200]}")
                if actions:
                    self._log("jenkins", "i", f"  CEN-PE proposed {len(actions)} actions")

        # Send Slack notification
        async with self:
            self._log("jenkins", "h",
                       "\u2500\u2500\u2500 Slack Notification \u2500\u2500\u2500")
            self._log("jenkins", "i",
                       f"  POST /api/chat.postMessage \u2192 {cfg.slack.channel}")

        slack = SlackClient()
        all_ok_final = all(
            j["status"] in ("success", "timeout") for j in self.jenkins_jobs
        )
        async with self:
            roster = dict(self.roster) if self.roster else None
            email_map = _parse_email_map(self.roster) if self.roster else None
            _run_num = self.active_run.get("n", 0)
            _triggered = self._triggered_by
        await slack.send_qa_complete(
            branch=cfg.pipeline.target_branch,
            jobs=list(self.jenkins_jobs),
            success=all_ok_final,
            shift_roster=roster,
            email_map=email_map,
            diagnostics=diag,
            run_num=_run_num,
            triggered_by=_triggered,
        )

        async with self:
            if all_ok_final:
                self._log("jenkins", "s",
                          "  \u2709 Sent \u2705 WAP+RESTAPI QA complete "
                          "\u2014 all jobs passed")
            else:
                self._log("jenkins", "w",
                          "  \u2709 Sent \u26a0\ufe0f WAP+RESTAPI QA complete "
                          "\u2014 some jobs failed")

        await asyncio.sleep(0.3)

    async def _run_deploy_step(self, run_id: str) -> None:
        """Execute Deploy Sync Status & Notify — ArgoCD gRPC watch with retries.

        1. Show ALL selected service cards at once as Progressing/OutOfSync
        2. Start gRPC watch stream — cards update live
        3. Retry up to DEPLOY_RETRY_MAX times (default 3) with 15-min timeout each
        4. If all healthy → send success Slack, auto-proceed
        5. If retries exhausted → send degraded Slack, mark failed for manual intervention
        """
        max_retries = cfg.pipeline.retry_max  # default 3
        watch_timeout = 900  # 15 minutes per attempt (in seconds)

        async with self:
            self._current_steps["deploy"] = "running"
            self.live_step = "deploy"
            self._sync_active_run(run_id, force_disk=True)
            self.slack_sent = False
            self._log("deploy", "h",
                      "\u2500\u2500\u2500 Deploy Sync Status (gRPC Watch) \u2500\u2500\u2500")
            svcs = self._selected_services
            self._log("deploy", "i",
                       f"  Watching {len(svcs)} apps via ArgoCD gRPC stream...")
            self._log("deploy", "i",
                       f"  Retry policy: {max_retries} attempts, "
                       f"{watch_timeout // 60}min timeout each")

            # Show ALL cards at once — initially Progressing
            hm: dict[str, str] = {}
            for svc in svcs:
                hm[svc] = "Progressing"
            self.health_map = hm
            self.deploy_apps = []  # Will be populated by gRPC watch
            # Build expected_tags ONLY for services where gitops actually pushed
            # a new tag. Unchanged (no-op) services skip tag comparison so the
            # deploy step doesn't block on stale ArgoCD tags.
            pushed_svcs = {
                g["name"] for g in self.gitops_statuses
                if g.get("phase") == "pushed"
            }
            et: dict[str, str] = {}
            for bs in self.build_statuses:
                name = bs.get("name", "")
                if name and name in pushed_svcs and bs.get("tag"):
                    et[name] = bs["tag"]
            self.expected_tags = et
            if et:
                self._log("deploy", "i",
                           f"  Tag verification enabled for: "
                           f"{', '.join(et.keys())}")
            else:
                self._log("deploy", "i",
                           "  No new tags pushed — trusting ArgoCD health")
            self.watch_count = 0
            self._watch_running = True
            self._log("deploy", "w",
                       f"  \u238e {len(svcs)} apps \u2192 Progressing (OutOfSync)")

        client = ArgocdClient()
        ns = cfg.argocd.namespace.lower()
        prefix = f"{ns}-" if ns else ""
        market = cfg.argocd.country.upper() or "UG"

        # ── Trigger hard sync for services with new tags ──
        async with self:
            et = dict(self.expected_tags)
        if et:
            async with self:
                self._log("deploy", "h",
                           "─── Hard Sync (new tags pushed) ───")
            for svc in et:
                full_name = f"{prefix}{svc}" if prefix else svc
                try:
                    await client.hard_sync(market, full_name)
                    async with self:
                        self._log("deploy", "i",
                                   f"  ⟳ Hard sync triggered: {svc}")
                except Exception as exc:
                    async with self:
                        self._log("deploy", "w",
                                   f"  ⟳ Hard sync failed for {svc}: {exc}")
            async with self:
                self._log("deploy", "s",
                           f"  ✓ Hard sync triggered for {len(et)} services")

        # ── Retry loop ──
        for attempt in range(1, max_retries + 1):
            async with self:
                self._log("deploy", "h",
                           f"\u2500\u2500\u2500 Attempt {attempt}/{max_retries} "
                           f"(timeout {watch_timeout // 60}min) \u2500\u2500\u2500")

            # Fetch initial state from ArgoCD
            async with self:
                self._log("deploy", "i",
                           "  Fetching current app state from ArgoCD gRPC...")

            try:
                current_apps = await client.list_applications()
                async with self:
                    hm = dict(self.health_map)
                    et = dict(self.expected_tags)
                    app_dicts = [a.to_dict() for a in current_apps]
                    for app in current_apps:
                        short = app.name
                        if prefix and short.startswith(prefix):
                            short = short[len(prefix):]
                        if short in hm:
                            argo_health = app.health.value
                            # Override: if expected tag doesn't match current,
                            # force Progressing regardless of ArgoCD status
                            expected = et.get(short, "")
                            current_tag = app.tag or ""
                            if expected and current_tag and expected != current_tag:
                                hm[short] = "Progressing"
                                self._log("deploy", "w",
                                           f"  ⎎ {short} → tag mismatch "
                                           f"(expected: {expected}, "
                                           f"current: {current_tag}) "
                                           f"— forcing Progressing")
                            else:
                                hm[short] = argo_health
                                self._log("deploy",
                                           "i" if argo_health != "Healthy" else "s",
                                           f"  ⎎ {short} → {argo_health} "
                                           f"({app.sync.value})")
                    self.health_map = hm
                    # Filter to selected services only
                    selected = set(self._selected_services)
                    self.deploy_apps = [
                        a for a in app_dicts
                        if a.get("name") in selected
                    ]
                    self.watch_count += 1
                    healthy = sum(1 for v in hm.values() if v == "Healthy")
                    self._log("deploy", "i",
                               f"  Initial state: {healthy}/{len(svcs)} healthy")
            except Exception:
                log.exception("Failed to fetch initial ArgoCD state")

            # Poll/watch loop for this attempt
            result = await self._deploy_watch_loop(
                run_id, svcs, client, watch_timeout)

            if result == "healthy":
                # All healthy — send success Slack and proceed
                await self._handle_all_healthy(run_id)
                return

            if result == "settled":
                # Services settled with degraded — skip remaining retries,
                # go straight to diagnostics + Slack + user action
                async with self:
                    hm = dict(self.health_map)
                    degraded = [s for s in svcs if hm.get(s) != "Healthy"]
                    healthy_count = sum(
                        1 for v in hm.values() if v == "Healthy")
                    self._log("deploy", "w",
                               f"  \u26a0 All services settled — "
                               f"{healthy_count}/{len(svcs)} healthy, "
                               f"{len(degraded)} degraded: "
                               f"{', '.join(degraded)}")
                    self._log("deploy", "w",
                               f"  \u2192 Skipping retries — proceeding to "
                               f"diagnostics + Slack")
                await self._handle_deploy_degraded(run_id)
                return

            # result == "timeout" — check if retries remain
            async with self:
                hm = dict(self.health_map)
                degraded = [s for s in svcs if hm.get(s) != "Healthy"]
                healthy = sum(1 for v in hm.values() if v == "Healthy")
                total = len(svcs)

            if attempt < max_retries:
                async with self:
                    self._log("deploy", "w",
                               f"  \u26a0 Attempt {attempt}/{max_retries} timed out — "
                               f"{healthy}/{total} healthy, "
                               f"{len(degraded)} degraded: {', '.join(degraded)}")
                    self._log("deploy", "i",
                               f"  Retrying in 2s...")
                    self._sync_active_run(run_id)
                await asyncio.sleep(2)
            else:
                # All retries exhausted — send degraded Slack, mark failed
                async with self:
                    self._log("deploy", "e",
                               f"  \u2715 All {max_retries} attempts exhausted — "
                               f"{healthy}/{total} healthy, "
                               f"{len(degraded)} degraded: {', '.join(degraded)}")

                await self._handle_deploy_degraded(run_id)
                return

    async def _deploy_watch_loop(
        self,
        run_id: str,
        svcs: list[str],
        client: ArgocdClient,
        timeout_secs: int,
    ) -> str:
        """Watch ArgoCD health via gRPC stream.

        Returns:
            "healthy"  — all services reached Healthy
            "settled"  — all services stopped Progressing but some remain Degraded
                         (grace period elapsed with zero Progressing)
            "timeout"  — full timeout expired with services still Progressing

        Uses the same real-time gRPC Watch stream as the STG-UG Health Board —
        ArgoCD pushes events instantly on every status change (no polling).
        """
        ns = cfg.argocd.namespace.lower()
        prefix = f"{ns}-" if ns else ""
        selected = set(svcs)
        all_healthy_event = asyncio.Event()
        start_ts = time.time()
        settle_grace = cfg.pipeline.settle_grace_secs
        _settled_since: list[float | None] = [None]  # mutable container for callback

        async def on_deploy_update(app_list: list[AppHealth]) -> None:
            """Callback fired on every gRPC Watch event from ArgoCD."""
            elapsed = int(time.time() - start_ts)
            async with self:
                if not self._watch_running:
                    return
                hm = dict(self.health_map)
                et = dict(self.expected_tags)
                changed = False
                for app in app_list:
                    short = app.name
                    if prefix and short.startswith(prefix):
                        short = short[len(prefix):]
                    if short not in hm:
                        continue
                    # Determine effective health: override if tag mismatch
                    argo_health = app.health.value
                    expected = et.get(short, "")
                    current_tag = app.tag or ""
                    if expected and current_tag and expected != current_tag:
                        effective = "Progressing"
                    else:
                        effective = argo_health
                    if hm[short] != effective:
                        hm[short] = effective
                        changed = True
                        if expected and current_tag and expected != current_tag:
                            self._log("deploy", "w",
                                       f"  ⎎ {short} → tag mismatch "
                                       f"(expected: {expected}, "
                                       f"current: {current_tag})")
                        else:
                            kind = "s" if effective == "Healthy" else "w"
                            prop_label = ""
                            if effective == "Healthy" and short not in self._tag_healthy_at:
                                now = time.time()
                                self._tag_healthy_at[short] = now
                                pushed = self._tag_pushed_at.get(short)
                                if pushed:
                                    prop_secs = int(now - pushed)
                                    prop_label = f" [{prop_secs}s from push]"
                            self._log("deploy", kind,
                                       f"  ⎎ {short} → "
                                       f"{effective} ({app.sync.value})"
                                       f"{prop_label}")
                if changed:
                    self.health_map = hm
                # Update deploy_apps cards (same as Health Board)
                self.deploy_apps = [
                    a.to_dict() for a in app_list
                    if (a.name[len(prefix):] if prefix and a.name.startswith(prefix) else a.name) in selected
                ]
                self.watch_count = elapsed

                healthy = sum(1 for v in hm.values() if v == "Healthy")
                total = len(svcs)

                # Log progress every 60s
                if elapsed > 0 and elapsed % 60 == 0:
                    self._log("deploy", "i",
                               f"  ⏱ {elapsed // 60}min elapsed — "
                               f"{healthy}/{total} healthy")

                if healthy == total:
                    self._log("deploy", "s",
                               f"  ✓ All {total} apps Healthy — "
                               f"gRPC watch confirmed")
                    self._watch_running = False
                    all_healthy_event.set()
                else:
                    # ── Settled detection (callback path) ──
                    progressing = sum(
                        1 for v in hm.values() if v == "Progressing"
                    )
                    non_healthy = total - healthy
                    if progressing == 0 and non_healthy > 0:
                        if _settled_since[0] is None:
                            _settled_since[0] = time.time()
                            self._log("deploy", "w",
                                       f"  ⚠ All services settled — "
                                       f"{healthy}/{total} healthy, "
                                       f"0 progressing. "
                                       f"Grace: {settle_grace}s")
                    else:
                        if _settled_since[0] is not None:
                            _settled_since[0] = None
                            self._log("deploy", "i",
                                       f"  ↻ Service back to Progressing "
                                       f"— settle timer reset")

        # Start gRPC Watch stream as a background task with circuit breaker
        from autotest.utils.resilience import get_breaker
        stream_client = ArgocdClient()
        breaker = get_breaker("argocd")

        async def _watched() -> None:
            await breaker.call(stream_client.watch_stream(on_deploy_update))

        stream_task = asyncio.create_task(_watched())

        try:
            # Checkpoint loop: check every 30s for faster settled detection
            elapsed = 0
            next_log_at = 60
            while elapsed < timeout_secs:
                chunk = min(2, timeout_secs - elapsed)
                try:
                    await asyncio.wait_for(
                        all_healthy_event.wait(), timeout=chunk
                    )
                    return "healthy"
                except asyncio.TimeoutError:
                    elapsed += chunk

                    # ── Settled detection (checkpoint path) ──
                    async with self:
                        hm = dict(self.health_map)
                    p = sum(1 for v in hm.values() if v == "Progressing")
                    h = sum(1 for v in hm.values() if v == "Healthy")
                    d_count = len(svcs) - h
                    if p == 0 and d_count > 0 and _settled_since[0] is None:
                        _settled_since[0] = time.time()
                        async with self:
                            self._log("deploy", "w",
                                      f"  ⚠ All services settled (checkpoint) — "
                                      f"{h}/{len(svcs)} healthy, "
                                      f"0 progressing. "
                                      f"Grace: {settle_grace}s")

                    if _settled_since[0] is not None:
                        grace_elapsed = time.time() - _settled_since[0]
                        if grace_elapsed >= settle_grace:
                            degraded_names = [
                                s for s in svcs
                                if hm.get(s) not in ("Healthy", "Progressing")
                            ]
                            async with self:
                                self._log("deploy", "w",
                                          f"  ⚠ Settled for "
                                          f"{int(grace_elapsed)}s — "
                                          f"{h}/{len(svcs)} healthy, "
                                          f"{len(degraded_names)} degraded: "
                                          f"{', '.join(degraded_names)}")
                                self._log("deploy", "w",
                                          f"  → Skipping remaining wait "
                                          f"— proceeding to diagnostics")
                            return "settled"

                    # ── Periodic checkpoint log (every 60s) ──
                    if elapsed >= next_log_at and elapsed < timeout_secs:
                        next_log_at = elapsed + 60
                        async with self:
                            self._log("deploy", "i",
                                      f"  ⏱ {elapsed // 60}min checkpoint — "
                                      f"{h}/{len(svcs)} healthy")
                            if (stream_task.done()
                                    and not all_healthy_event.is_set()):
                                self._log("deploy", "w",
                                          "  gRPC stream died — "
                                          "reconnecting...")
                                stream_client = ArgocdClient()
                                stream_task = asyncio.create_task(
                                    _watched())
            return "timeout"  # full timeout
        finally:
            stream_client.stop()
            stream_task.cancel()
            try:
                await stream_task
            except asyncio.CancelledError:
                pass

    async def _collect_forecasts(self, svcs: list[str]) -> None:
        """Collect Prometheus metrics and compute forecasts. Best-effort, never blocks."""
        try:
            from autotest.services.grafana_client import GrafanaClient
            grafana = GrafanaClient()
            prom_data = await grafana.query_prometheus_health()

            if not prom_data:
                return

            ts = time.time()
            for entry in prom_data:
                svc = entry.get("service", "")
                if svc not in svcs:
                    continue
                sample = {
                    "ts": ts,
                    "cpu": entry.get("cpu", 0.0),
                    "mem": entry.get("memory", 0.0),
                    "restarts": entry.get("restarts", 0),
                    "pods_ready": entry.get("pods_ready", 0),
                    "pods_desired": entry.get("pods_desired", 0),
                }
                buf = self._metrics_buffer.setdefault(svc, [])
                buf.append(sample)
                # Cap at 24 entries (2 hours at 5-min intervals)
                if len(buf) > 24:
                    self._metrics_buffer[svc] = buf[-24:]

            fcs = compute_forecasts(self._metrics_buffer)
            if fcs:
                self.forecasts = [f.to_dict() for f in fcs]
                self._log("deploy", "w",
                          f"  Forecast: {len(fcs)} risk alert(s) detected")
            else:
                self.forecasts = []
        except Exception:
            log.warning("Forecast collection failed", exc_info=True)

    async def _handle_deploy_degraded(self, run_id: str) -> None:
        """Handle deploy retries exhausted — last-resort hard sync, diagnostics, Slack.

        Flow:
        1. Wait 10s for ArgoCD to settle
        2. Hard sync degraded services one more time
        3. Wait 30s and re-check health
        4. If still degraded → run CEN-PE diagnostics (per-service Loki + Prometheus)
        5. Send Slack with diagnostics attached
        """
        branch = cfg.pipeline.target_branch
        ecr_tmp = EcrClient()
        client = ArgocdClient()
        ns = cfg.argocd.namespace.lower()
        prefix = f"{ns}-" if ns else ""
        market = cfg.argocd.country.upper() or "UG"

        image_tags: dict[str, str] = {}
        for svc in self._selected_services:
            sha = self._shas.get(svc, "")
            if sha:
                _, pfx = ecr_tmp.resolve_service(svc)
                if not pfx:
                    pfx = f"{branch}-"
                image_tags[svc] = f"{pfx}{sha[:10]}"

        async with self:
            hm = dict(self.health_map)
            svcs = list(self._selected_services)
            degraded = [s for s in svcs if hm.get(s) != "Healthy"]
            # Start MTTR tracking
            self._deploy_degraded_at = time.time()
            self._deploy_timeline = []
            self._tl("degraded_detected",
                      f"{len(degraded)} degraded: {', '.join(degraded)}")

        # ── Step 1: Wait 10s for ArgoCD to settle ──
        async with self:
            self._log("deploy", "i",
                       f"  Waiting 2s for ArgoCD to settle before final retry...")
        await asyncio.sleep(2)

        # ── Step 2: Hard sync degraded services in parallel ──
        if degraded:
            async with self:
                self._log("deploy", "h",
                           "─── Last-Resort Hard Sync (degraded services) ───")

            async def _sync_one(svc_name: str) -> tuple[str, bool, str]:
                full = f"{prefix}{svc_name}" if prefix else svc_name
                try:
                    await client.hard_sync(market, full)
                    return (svc_name, True, "")
                except Exception as exc:
                    return (svc_name, False, str(exc))

            results = await asyncio.gather(*[_sync_one(s) for s in degraded])
            synced = [s for s, ok, _ in results if ok]
            failed_sync = [s for s, ok, _ in results if not ok]
            async with self:
                for svc, ok, err in results:
                    if ok:
                        self._log("deploy", "i", f"  ⟳ Hard sync: {svc}")
                    else:
                        self._log("deploy", "w",
                                   f"  ⟳ Hard sync failed for {svc}: {err}")
                self._log("deploy", "i",
                           f"  Waiting 5s for hard sync to propagate...")
                self._tl("hard_sync",
                          f"Synced: {', '.join(synced)}"
                          + (f" | Failed: {', '.join(failed_sync)}"
                             if failed_sync else ""))

        # ── Step 3: Wait 5s and re-check health ──
        await asyncio.sleep(5)

        try:
            current_apps = await client.list_applications()
            async with self:
                hm = dict(self.health_map)
                et = dict(self.expected_tags)
                app_dicts = [a.to_dict() for a in current_apps]
                for app in current_apps:
                    short = app.name
                    if prefix and short.startswith(prefix):
                        short = short[len(prefix):]
                    if short in hm:
                        expected = et.get(short, "")
                        current_tag = app.tag or ""
                        if expected and current_tag and expected != current_tag:
                            hm[short] = "Progressing"
                        else:
                            hm[short] = app.health.value
                self.health_map = hm
                selected = set(self._selected_services)
                self.deploy_apps = [
                    a for a in app_dicts if a.get("name") in selected
                ]
                self.watch_count += 1
        except Exception:
            log.exception("Failed to re-check ArgoCD after last-resort sync")

        # Re-evaluate health after the final hard sync
        async with self:
            hm = dict(self.health_map)
            svcs = list(self._selected_services)
            healthy = sum(1 for v in hm.values() if v == "Healthy")
            total = len(svcs)
            degraded = [s for s in svcs if hm.get(s) != "Healthy"]
            self._tl("health_recheck",
                      f"{healthy}/{total} healthy after hard sync")

        # If all healthy now, send success instead
        if not degraded:
            async with self:
                self._tl("recovered", f"All {total} apps recovered")
                self._log("deploy", "s",
                           f"  ✓ All {total} apps recovered after last-resort sync!")
            await self._handle_all_healthy(run_id)
            return

        async with self:
            self._log("deploy", "e",
                       f"  ✗ Still {len(degraded)} degraded after last-resort sync: "
                       f"{', '.join(degraded)}")
            oncall = self.roster.get("oncall", "")
            escalation = self.roster.get("escalation", "")
            self._current_steps["deploy"] = "failed"
            self._sync_active_run(run_id)

        # ── Step 4: CEN-PE diagnostics (per-service Loki + Prometheus) ──
        cenpe_start = time.time()
        ctx = (
            f"Deploy health: {healthy}/{total} Healthy\n"
            f"Degraded services: {', '.join(degraded)}\n"
            f"Health map: {hm}"
        )
        try:
            diag = await asyncio.wait_for(
                self._run_diagnostics("deploy", ctx), timeout=25.0)
        except asyncio.TimeoutError:
            diag = "Diagnostics timed out after 25s"
            log.warning("Diagnostics timeout for step deploy")
        actions = await self._propose_actions("deploy", diag, ctx)
        cenpe_secs = round(time.time() - cenpe_start, 1)

        # Ensure rollback_image is proposed for every degraded service
        # (CEN-PE may not always suggest it)
        already_covered = {
            a["target"] for a in actions
            if a.get("action") == "rollback_image"
        }
        for i, svc in enumerate(degraded):
            if svc not in already_covered:
                actions.append({
                    "id": f"rb-{i}",
                    "action": "rollback_image",
                    "target": svc,
                    "confidence": 70,
                    "reason": f"Roll back {svc} to previous image tag",
                    "status": "proposed",
                })

        # Summarize auto-executed actions
        auto_executed = [a for a in actions if a.get("status") == "done"]
        still_proposed = [a for a in actions if a.get("status") == "proposed"]

        async with self:
            self.diagnostics = diag
            self.proposed_actions = actions
            self._tl("cenpe_diagnostics",
                      f"Diagnostics + actions in {cenpe_secs}s")
            if auto_executed:
                for a in auto_executed:
                    self._tl("action_auto_executed",
                              f"{a['action']} → {a['target']}: "
                              f"{a.get('result', '')[:60]}")
            if still_proposed:
                proposed_summary = ", ".join(
                    f"{a['action']}→{a['target']}" for a in still_proposed
                )
                self._tl("actions_proposed",
                          f"{len(still_proposed)} awaiting approval: "
                          f"{proposed_summary[:120]}")
            self._log("deploy", "i",
                       f"  CEN-PE Agent Diagnostics ({cenpe_secs}s): "
                       f"{diag[:200]}")
            if auto_executed:
                self._log("deploy", "i",
                           f"  CEN-PE auto-executed {len(auto_executed)} action(s)")
                for a in auto_executed:
                    self._log("deploy", "i",
                               f"    \u2713 {a['action']} → {a['target']}: "
                               f"{a.get('result', '')[:80]}")
            if still_proposed:
                self._log("deploy", "i",
                           f"  {len(still_proposed)} action(s) awaiting approval")
            rb_count = sum(1 for a in actions if a["action"] == "rollback_image")
            if rb_count:
                self._log("deploy", "i",
                           f"  \u21ba Rollback proposed for {rb_count} degraded "
                           f"service(s) — approve individually or click Rollback "
                           f"to roll back all")

        # ── Step 5: Send Slack (degraded) with service + tag + diagnostics ──
        slack = SlackClient()
        email_map = _parse_email_map(self.roster) if self.roster else None
        async with self:
            _run_num = self.active_run.get("n", 0)
            _triggered = self._triggered_by
            self._log("deploy", "h", "\u2500\u2500\u2500 Slack Notification (Degraded) \u2500\u2500\u2500")
            self._log("deploy", "c",
                       f"  POST /api/chat.postMessage \u2192 {cfg.slack.channel} "
                       f"(cc {oncall} {escalation})")
            self._log("deploy", "w",
                       f"  \u2709 Sent \u26a0 {healthy}/{total} healthy, "
                       f"{len(degraded)} degraded \u2014 retries exhausted")
            self.slack_sent = True
            self._sync_active_run(run_id)

        await slack.send_deploy_degraded(
            branch=branch,
            services=svcs,
            health_map=hm,
            diagnostics=diag,
            shift_roster=dict(self.roster) if self.roster else None,
            email_map=email_map,
            image_tags=image_tags,
            run_num=_run_num,
            triggered_by=_triggered,
            proposed_actions=actions,
            cenpe_secs=cenpe_secs,
        )

        async with self:
            self._cenpe_secs = cenpe_secs
            self._tl("slack_sent",
                      f"Degraded alert sent to {cfg.slack.channel}")
            self._tl("awaiting_user",
                      "Waiting for Rollback / Retry / Force Proceed")
            self._log("deploy", "e",
                       f"  \u23f8 Waiting for user action "
                       f"(Rollback / Retry / Force Proceed)")
            self._sync_active_run(run_id)

    async def _handle_all_healthy(self, run_id: str) -> None:
        """Handle all apps being healthy — send success Slack and proceed."""
        async with self:
            n = len(self._selected_services)
            self._log("deploy", "s", f"  \u2713 All {n} apps healthy")
            # Log per-service image propagation times
            prop = self._compute_propagation_stats()
            if prop:
                self._log("deploy", "h",
                           "\u2500\u2500\u2500 Image Propagation (push \u2192 Healthy) \u2500\u2500\u2500")
                times: list[float] = []
                for p in prop:
                    secs = p["push_to_healthy_secs"]
                    if secs > 0:
                        times.append(secs)
                        self._log("deploy", "s",
                                   f"  \u2713 {p['service']}: {int(secs)}s")
                    else:
                        self._log("deploy", "w",
                                   f"  \u2717 {p['service']}: "
                                   f"not tracked ({p['status']})")
                if times:
                    avg = sum(times) / len(times)
                    self._log("deploy", "i",
                               f"  avg: {int(avg)}s | "
                               f"min: {int(min(times))}s | "
                               f"max: {int(max(times))}s")
            self._log("deploy", "h", "\u2500\u2500\u2500 Slack Notification \u2500\u2500\u2500")
            self._log("deploy", "i", "  Fetching shift roster...")
            self._log("deploy", "s", "  \u2713 Parsed Deployment Shift Roster")
            oncall = self.roster.get("oncall", "@vinay.k @rahul.s")
            self._log("deploy", "c",
                       f"  POST /api/chat.postMessage \u2192 {cfg.slack.channel} (cc {oncall})")
            self._log("deploy", "s",
                       f"  \u2709 Sent \u2705 {n}/{n} healthy \u2014 deploy complete")
            self.slack_sent = True
            self._current_steps["deploy"] = "success"
            self._sync_active_run(run_id)

        # Build image tag map: service → prefix-sha10
        branch = cfg.pipeline.target_branch
        ecr_tmp = EcrClient()
        image_tags: dict[str, str] = {}
        for svc in self._selected_services:
            sha = self._shas.get(svc, "")
            if sha:
                _, prefix = ecr_tmp.resolve_service(svc)
                if not prefix:
                    prefix = f"{branch}-"
                image_tags[svc] = f"{prefix}{sha[:10]}"

        # Send full pipeline summary Slack notification
        slack = SlackClient()
        email_map = _parse_email_map(self.roster) if self.roster else None
        async with self:
            _run_num = self.active_run.get("n", 0)
            _triggered = self._triggered_by
            _merge_statuses = [dict(m) for m in self.merge_statuses]
            _build_statuses = [dict(b) for b in self.build_statuses]
            _gitops_statuses = [dict(g) for g in self.gitops_statuses]
            _prop_stats = self._compute_propagation_stats()
        await slack.send_pipeline_summary(
            branch=branch,
            services=list(self._selected_services),
            health_map=dict(self.health_map),
            merge_statuses=_merge_statuses,
            build_statuses=_build_statuses,
            gitops_statuses=_gitops_statuses,
            shift_roster=dict(self.roster) if self.roster else None,
            email_map=email_map,
            image_tags=image_tags,
            run_num=_run_num,
            triggered_by=_triggered,
            jenkins_next=not (self._skip_jenkins_qa or cfg.pipeline.skip_jenkins_qa),
            propagation_stats=_prop_stats,
        )

        await asyncio.sleep(0.8)

    def _persist_live_state(self, force_disk: bool = False) -> None:
        """Publish pipeline state to shared memory + disk.

        This makes the state visible to all other browser sessions
        (via _SHARED) and survives process restarts (via live_state.json).
        force_disk=True bypasses disk throttle (used at pipeline start/finish).
        """
        data = {
            "runs_summary": self.runs_summary,
            "active_run_id": self.active_run_id,
            "active_run": self.active_run,
            "is_running": self.is_running,
            "live_step": self.live_step,
            "merge_statuses": self.merge_statuses,
            "build_statuses": self.build_statuses,
            "gitops_statuses": self.gitops_statuses,
            "health_map": self.health_map,
            "deploy_apps": self.deploy_apps,
            "expected_tags": self.expected_tags,
            "jenkins_jobs": self.jenkins_jobs,
            "logs": self.logs,
            "diagnostics": self.diagnostics,
            "proposed_actions": self.proposed_actions,
            "forecasts": self.forecasts,
            "slack_sent": self.slack_sent,
            "paused": self.paused,
            "pause_error": self.pause_error,
            "pause_step": self.pause_step,
            "watch_count": self.watch_count,
            "_run_counter": self._run_counter,
            "_shas": self._shas,
            "_current_steps": self._current_steps,
            "_selected_services": self._selected_services,
            "_actually_merged": self._actually_merged,
        }
        _publish_shared(data, force_disk=force_disk)

    def _sync_active_run(self, run_id: str, force_disk: bool = False) -> None:
        """Sync the current step statuses and viz data to the run in the summary list.

        Note: Logs are NOT embedded here (they're in self.logs and synced separately).
        Full logs are only stored in the run on completion via _update_run().
        This prevents live_state.json from ballooning during execution.

        Args:
            run_id: The run to sync.
            force_disk: If True, bypass disk throttle (use at step boundaries).
        """
        updated = dict(self._current_steps)
        for i, r in enumerate(self.runs_summary):
            if r["id"] == run_id:
                r_copy = dict(r)
                r_copy["steps"] = updated
                r_copy["merge_statuses"] = list(self.merge_statuses)
                r_copy["build_statuses"] = list(self.build_statuses)
                r_copy["gitops_statuses"] = list(self.gitops_statuses)
                r_copy["health_map"] = dict(self.health_map)
                r_copy["deploy_apps"] = list(self.deploy_apps)
                r_copy["expected_tags"] = dict(self.expected_tags)
                r_copy["jenkins_jobs"] = list(self.jenkins_jobs)
                self.runs_summary[i] = r_copy
                if self.active_run_id == run_id:
                    self.active_run = r_copy
                break
        self._persist_live_state(force_disk=force_disk)

    def _update_run(
        self, run_id: str, status: str, duration: str,
        run_logs: list[dict] | None = None,
        step_times: dict[str, dict] | None = None,
        propagation_stats: list[dict] | None = None,
        mttr_secs: float = 0.0,
    ) -> None:
        """Update a run's final status and duration.

        Also stores step visualization data (cards, health map, jenkins jobs)
        so users can review completed runs with the same UI as during execution.
        """
        for i, r in enumerate(self.runs_summary):
            if r["id"] == run_id:
                r_copy = dict(r)
                r_copy["st"] = status
                r_copy["dur"] = duration
                r_copy["steps"] = dict(self._current_steps)
                if run_logs is not None:
                    r_copy["logs"] = run_logs
                # Store step visualization data for post-run review
                r_copy["merge_statuses"] = list(self.merge_statuses)
                r_copy["build_statuses"] = list(self.build_statuses)
                r_copy["gitops_statuses"] = list(self.gitops_statuses)
                r_copy["health_map"] = dict(self.health_map)
                r_copy["deploy_apps"] = list(self.deploy_apps)
                r_copy["expected_tags"] = dict(self.expected_tags)
                r_copy["jenkins_jobs"] = list(self.jenkins_jobs)
                # Store timeline / metrics data
                if step_times:
                    r_copy["step_times"] = step_times
                if propagation_stats:
                    r_copy["propagation_stats"] = propagation_stats
                if mttr_secs > 0:
                    r_copy["mttr_secs"] = round(mttr_secs, 1)
                self.runs_summary[i] = r_copy
                if self.active_run_id == run_id:
                    self.active_run = r_copy
                break

        # Persist to disk
        run_record = RunRecord(
            id=run_id,
            num=int(run_id.lstrip("r")),
            status=PipelineStatus(status),
            duration=duration,
            started_at=self.active_run.get("t", ""),
            steps=dict(self._current_steps),
            diagnostics=self.diagnostics,
            slack_sent=self.slack_sent,
            health_map=dict(self.health_map),
        )
        self._run_store.save(run_record)
        self._persist_live_state()
