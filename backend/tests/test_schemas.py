import unittest
from pydantic import ValidationError
from farm.schemas import DatasetInput,IdeaCreate,StepResult


class SchemaTests(unittest.TestCase):
    def test_priority_is_one_of_three(self):
        with self.assertRaises(ValidationError): IdeaCreate(title='Test',transcript='Test',priority=4)

    def test_duplicate_tasks_rejected(self):
        row={'task_id':'same','input':'input','expected_label':'a'}
        with self.assertRaises(ValidationError):DatasetInput(name='test',source='test',period='test',labels=['a','b'],rows=[row,row])

    def test_step_missing_evidence_is_invalid(self):
        with self.assertRaises(ValidationError):StepResult(idea_id='i',run_id='r',step_id='s',input_version='1',status='completed',conclusion='done')


if __name__=='__main__':unittest.main()
