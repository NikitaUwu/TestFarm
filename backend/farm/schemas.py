from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class IdeaContent(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    transcript: str = Field(default='', max_length=20000)
    problem: str = Field(default='', max_length=4000)
    audience: str = Field(default='', max_length=2000)
    value: str = Field(default='', max_length=2000)
    current_process: str = Field(default='', max_length=4000)
    expected_effect: str = Field(default='', max_length=2000)
    knowledge: dict[str, Literal['known', 'assumed', 'needs_clarification']] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list, max_length=30)
    constraints: list[str] = Field(default_factory=list, max_length=30)


class IdeaCreate(IdeaContent):
    priority: Literal[0, 1, 2] = 1


class IdeaUpdate(IdeaContent):
    expected_version: int = Field(ge=1)


class TaskRow(StrictModel):
    task_id: str = Field(min_length=1, max_length=100)
    input: str = Field(min_length=1, max_length=10000)
    expected_label: str = Field(min_length=1, max_length=100)
    baseline_seconds: float | None = Field(default=None, ge=0, le=86400)
    baseline_correct: bool | None = None
    manual_review_seconds: float = Field(default=0, ge=0, le=86400)
    error_correction_seconds: float = Field(default=0, ge=0, le=86400)


class DatasetInput(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=2000)
    period: str = Field(min_length=1, max_length=200)
    provenance: Literal['measured', 'demo'] = 'measured'
    labels: list[str] = Field(min_length=2, max_length=20)
    rows: list[TaskRow] = Field(min_length=2, max_length=100)

    @model_validator(mode='after')
    def unique_tasks(self):
        if len({r.task_id for r in self.rows}) != len(self.rows):
            raise ValueError('task_id должен быть уникальным')
        if len(set(self.labels)) != len(self.labels):
            raise ValueError('Метки должны быть уникальными')
        if any(r.expected_label not in self.labels for r in self.rows):
            raise ValueError('expected_label должен входить в labels')
        return self


class Thresholds(StrictModel):
    minimum_effect_seconds: float = Field(default=1, ge=0)
    minimum_quality: float = Field(default=.9, ge=0, le=1)
    maximum_manual_review: float = Field(default=.2, ge=0, le=1)
    maximum_error: float = Field(default=.1, ge=0, le=1)


class StartRun(StrictModel):
    idempotency_key: str = Field(min_length=8, max_length=100)
    dataset_version_id: str
    thresholds: Thresholds
    variant_prompts: list[str] = Field(min_length=2, max_length=3)
    source_urls: list[HttpUrl] = Field(default_factory=list, max_length=15)
    hard_blockers: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def bounded_prompts(self):
        if any(not p.strip() or len(p) > 4000 for p in self.variant_prompts):
            raise ValueError('Каждый промпт должен содержать 1–4000 символов')
        return self


class StepDefinition(StrictModel):
    id: str
    version: int
    role: list[str]
    goal: str
    trigger: str
    input_schema: dict
    output_schema: dict
    tools: list[str]
    permissions: list[str]
    dependencies: list[str]
    entry_conditions: list[str]
    completion_conditions: list[str]
    validation: list[str]
    timeout: int
    retries: int
    call_limit: int
    token_computation_limit: dict
    next_step_rules: dict


class StepResult(StrictModel):
    idea_id: str
    run_id: str
    step_id: str
    input_version: str
    status: Literal['completed', 'waiting_for_data', 'waiting_for_user', 'paused', 'error', 'cancelled']
    conclusion: str
    evidence: list[dict]
    assumptions: list[str]
    errors: list[dict]
    duration_ms: int = Field(ge=0)
    call_count: int = Field(ge=0)
    measured_metrics: list[dict]
    artifact_refs: list[str]
    data: dict[str, Any] = Field(default_factory=dict)


class Classification(StrictModel):
    label: str = Field(max_length=100)
    rationale: str = Field(max_length=3000)
    needs_review: bool


class SourceClaim(StrictModel):
    claim: str = Field(max_length=3000)
    source_url: str
    provenance: Literal['external_fact', 'assumption', 'forecast', 'synthetic_check']


class Persona(StrictModel):
    role: str
    job: str
    frequency: str
    pain: str
    consequences: str
    alternative: str
    objections: list[str]


class Hypothesis(StrictModel):
    audience: str
    claim: str
    experiment: str
    metric: str
    success_threshold: str
    falsification: str


class Alternative(StrictModel):
    name: str
    type: str
    applicability: str
    source_url: str
    limitations: list[str]


class ForecastScenario(StrictModel):
    description: str
    assumptions: list[str]
    change_signals: list[str]


class Trends(StrictModel):
    drivers: list[str]
    horizon: str
    adverse: ForecastScenario
    base: ForecastScenario
    favorable: ForecastScenario


class ResearchOutput(StrictModel):
    summary: str
    personas: list[Persona] = Field(min_length=3, max_length=6)
    alternatives: list[Alternative] = Field(max_length=10)
    hypotheses: list[Hypothesis] = Field(min_length=3, max_length=10)
    claims: list[SourceClaim]
    trends: Trends
    objections: list[str]
    assumptions: list[str]
    gaps: list[str]
    next_experiment: str


class RunnerOutput(StrictModel):
    request_id: str
    success: bool
    label: str
    needs_review: bool
    duration_ms: int = Field(ge=0)
    ai_ms: int = Field(ge=0)
    rules_ms: int = Field(ge=0)
    inputs: dict
    outputs: dict
    usage: dict
    model: str
    component_versions: dict
    timings: dict = Field(default_factory=dict)
    replayed: bool = False


class RoleAnalysis(StrictModel):
    development_options: list[str] = Field(min_length=2,max_length=3)
    process_fit: str = Field(max_length=700)
    adoption_constraints: list[str] = Field(max_length=5)
    positioning: str = Field(max_length=700)
    ux_scenarios: list[str] = Field(min_length=1,max_length=4)
    ux_states: list[str] = Field(min_length=3,max_length=7)


class DetailedResearchOutput(ResearchOutput):
    role_analysis: RoleAnalysis


class ObservationInput(StrictModel):
    metric: str = Field(min_length=1, max_length=100)
    target: float
    actual: float
    unit: str = Field(min_length=1, max_length=30)
    source: str = Field(min_length=1, max_length=1000)
    monthly_volume: float | None = Field(default=None, ge=0, le=1e8)
    quality: float | None = Field(default=None, ge=0, le=1)
    manual_review_rate: float | None = Field(default=None, ge=0, le=1)
