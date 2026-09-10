import unittest
from unittest.mock import patch
from farm.evidence import public_target,assess,ReadableHTML


class EvidenceTests(unittest.TestCase):
    def test_source_nul_is_normalized_for_postgres(self):
        parser=ReadableHTML();parser.feed('<title>A\x00B</title><p>C\x00D</p>')
        self.assertNotIn('\x00',''.join(parser.title+parser.parts))
        self.assertIn('C\ufffdD',parser.parts)
    def test_private_and_mixed_dns_rejected(self):
        for addresses in [[('127.0.0.1',443)],[('8.8.8.8',443),('10.0.0.1',443)]]:
            with patch('socket.getaddrinfo',return_value=[(2,1,6,'',a) for a in addresses]):
                with self.assertRaises(ValueError):public_target('https://example.org/')

    def test_credentials_scheme_and_ports_rejected(self):
        for url in ['http://example.org','https://user:pass@example.org','https://example.org:8080/','file:///tmp/data']:
            with self.assertRaises(ValueError):public_target(url)

    def assess(self,blockers=(),provenance='measured'):
        material={'personas':[{}]*3,'alternatives':[{}]*3,'hypotheses':[{}]*3,'trends':{},'gaps':[]}
        calculation={'variants':[{'solution_id':'a','sample_size':6,'quality':1,'manual_review_rate':0,'provenance':provenance,'statistical':{'point_estimate':5,'lower_bound':3}}]}
        sources=[{'availability':'available','organization':str(i)} for i in range(5)]
        thresholds={'minimum_quality':.9,'maximum_error':.1,'maximum_manual_review':.2,'minimum_effect_seconds':1}
        profile={'weights':{'problem':18,'market':10,'trends':7,'value':17,'efficiency':23,'feasibility':18,'decision':7}}
        policy={'minimum_sources':5,'minimum_sample':5,'minimum_alternatives':3}
        return assess(material,calculation,sources,thresholds,profile,policy,blockers)

    def test_blocker_dominates_score(self):
        result=self.assess(['Запрещено внедрение'])
        self.assertEqual(result['recommendation'],'Отклонить')
        self.assertFalse(result['checks'][0]['passed'])

    def test_demo_never_proves_effect(self):
        self.assertEqual(self.assess(provenance='demo')['recommendation'],'Недостаточно данных')


if __name__=='__main__': unittest.main()
