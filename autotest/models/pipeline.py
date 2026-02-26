"""Pipeline execution data models."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class PipelineStatus(str, Enum):
    """Status of a pipeline run or step."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    DEGRADED = "degraded"
    INTERRUPTED = "interrupted"


STEP_DEFINITIONS = [
    {"id": "merge", "label": "Git Merge", "desc": "GH GraphQL · master -> pre-release-tw", "icon": "\u2442"},
    {"id": "build", "label": "Image Check", "desc": "ECR verify + Jenkins monitor if missing", "icon": "\u2699"},
    {"id": "gitops", "label": "Staging GitOps Update", "desc": "Update image tags in YAML repo", "icon": "\u27f2"},
    {"id": "deploy", "label": "Deploy Sync Status & Notify", "desc": "ArgoCD gRPC-Web watch + Slack alert", "icon": "\u238e"},
    {"id": "jenkins", "label": "Trigger WAP+RESTAPI QA Jobs", "desc": "Smoke + integration", "icon": "\u26a1"},
]

STEP_IDS = [s["id"] for s in STEP_DEFINITIONS]


class StepResult(BaseModel):
    """Result of a single pipeline step."""

    step_id: str
    status: PipelineStatus = PipelineStatus.PENDING
    started_at: str = ""
    finished_at: str = ""
    logs: list[dict[str, str]] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunRecord(BaseModel):
    """Persisted pipeline run record."""

    id: str
    num: int
    status: PipelineStatus = PipelineStatus.PENDING
    duration: str = "\u2014"
    started_at: str = ""
    finished_at: str = ""
    steps: dict[str, str] = Field(default_factory=dict)
    logs: list[dict[str, str]] = Field(default_factory=list)
    diagnostics: str = ""
    slack_sent: bool = False
    health_map: dict[str, str] = Field(default_factory=dict)

    def to_summary(self) -> dict[str, Any]:
        """Return summary dict for the UI runs list."""
        return {
            "id": self.id,
            "n": self.num,
            "st": self.status.value,
            "dur": self.duration,
            "t": self.started_at,
            "steps": dict(self.steps),
        }
