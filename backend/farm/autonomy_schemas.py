from typing import Literal
from pydantic import Field, model_validator
from .schemas import StrictModel, IdeaContent
from .programs import ProgramField


class Intake(StrictModel):
    description: str = Field(min_length=3, max_length=20000)
    idempotency_key: str = Field(min_length=8, max_length=100)
    priority: Literal[0, 1, 2] = 1


class ContinueIdea(StrictModel):
    description: str = Field(min_length=3, max_length=16000)
    idempotency_key: str = Field(min_length=8, max_length=100)
    expected_version: int = Field(ge=1)


class Understanding(StrictModel):
    card: IdeaContent
    can_research: bool
    questions: list[str] = Field(max_length=3)
    assumptions: list[str] = Field(max_length=15)

    @model_validator(mode='after')
    def question_for_stop(self):
        if not self.can_research and not self.questions:
            raise ValueError('Остановка требует конкретного вопроса')
        return self


class Candidate(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    approach: str = Field(min_length=1, max_length=1500)
    prompt: str = Field(min_length=1, max_length=4000)


class TrialCase(StrictModel):
    task_id: str = Field(min_length=1, max_length=80)
    input: str = Field(min_length=1, max_length=8000)
    purpose: str = Field(min_length=1, max_length=700)


class ExperimentPlan(StrictModel):
    scenario: str = Field(min_length=1, max_length=2000)
    task_type: Literal['extraction', 'summarization', 'drafting', 'recommendation', 'classification', 'planning', 'not_executable']
    execution_limitations: list[str] = Field(max_length=12)
    candidates: list[Candidate] = Field(min_length=2, max_length=3)
    output_fields: list[ProgramField] = Field(min_length=1, max_length=8)
    cases: list[TrialCase] = Field(min_length=2, max_length=3)
    success_criteria: list[str] = Field(min_length=1, max_length=10)
    mvp_acceptance: list[str] = Field(min_length=1, max_length=10)
    questions: list[str] = Field(max_length=3)
    next_action: str = Field(min_length=1, max_length=1500)

    @model_validator(mode='after')
    def unique_identifiers(self):
        if len({v.name for v in self.output_fields}) != len(self.output_fields):
            raise ValueError('Поля результата должны быть уникальны')
        if len({v.task_id for v in self.cases}) != len(self.cases):
            raise ValueError('Примеры должны быть уникальны')
        if len({v.prompt for v in self.candidates}) != len(self.candidates):
            raise ValueError('Варианты должны различаться')
        return self
