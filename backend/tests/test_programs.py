import unittest
from farm.programs import transform,GeneratedProgram,test_program


class ProgramTests(unittest.TestCase):
    def test_code_processes_different_inputs(self):
        code='function transform(input, ai) { return {total: input.quantity * ai.price}; }'
        self.assertEqual(transform(code,{'quantity':2},{'price':3}),{'total':6})
        self.assertEqual(transform(code,{'quantity':5},{'price':4}),{'total':20})

    def test_no_host_capabilities(self):
        code='function transform() { return {process:typeof process,fetch:typeof fetch,require:typeof require,read:typeof readFile}; }'
        self.assertEqual(set(transform(code,{},{}).values()),{'undefined'})

    def test_infinite_loop_interrupted(self):
        with self.assertRaises(Exception):transform('function transform(){while(true){}}',{}, {})

    def test_input_is_data_not_code(self):
        value='\"); while(true){} //'
        self.assertEqual(transform('function transform(input){return input;}',{'text':value},{}),{'text':value})
