import os
import unittest
from unittest.mock import patch
from farm.openrouter_provider import OpenRouterAdapter
from farm.providers import ProviderError,provider
from farm.groq_provider import GroqAdapter


class FreePolicyTests(unittest.TestCase):
    def test_search_uses_tool_sources_and_transcript_fallback(self):
        adapter=GroqAdapter({'search_model':'groq/compound-mini','search_system_version':'2025-07-23','search_prompt':'Search the web for:'})
        fixture={'choices':[{'finish_reason':'stop','message':{'content':'https://invented.invalid/',
            'executed_tools':[{'type':'search','output':'Title: Reference\nURL: https://example.org/source\nContent: evidence'}]}}]}
        with patch.object(adapter,'_request',return_value=fixture) as request:
            result=adapter.search({'title':'test','problem':'','transcript':'support ticket routing'},5)
        self.assertEqual(result['urls'],['https://example.org/source'])
        self.assertIn('support ticket routing',request.call_args.kwargs['json']['messages'][0]['content'])
        self.assertEqual(result['system_version'],'2025-07-23')

    def test_model_only_links_never_become_search_evidence(self):
        adapter=GroqAdapter({'search_model':'groq/compound-mini'})
        fixture={'choices':[{'finish_reason':'stop','message':{'content':'https://invented.invalid/'}}]}
        with patch.object(adapter,'_request',return_value=fixture),self.assertRaises(ProviderError):
            adapter.search({'problem':'routing'},5)

    def test_previous_provider_disabled_after_switch(self):
        with patch.dict(os.environ,{'ACTIVE_PROVIDER':'groq'}):
            for name in ('openrouter','openai','ollama'):
                with self.assertRaises(ProviderError): provider({'provider':name})

    def test_groq_rejects_unapproved_model_and_tools(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'unit-test-placeholder'}), patch('farm.groq_provider.httpx.Client') as network:
            adapter=GroqAdapter({})
            for body in ({'model':'groq/compound'}, {'model':adapter.model,'tools':[]},
                         {'model':adapter.model,'service_tier':'flex'}):
                with self.assertRaises(ProviderError): adapter._request('chat/completions',json=body)
            with self.assertRaises(ProviderError): adapter.search({},5)
            with self.assertRaises(ProviderError): adapter.embed(['test'])
            network.assert_not_called()

    def test_paid_models_and_plugins_rejected_before_network(self):
        with patch.dict(os.environ,{'FREE_MODE_ONLY':'1','OPENROUTER_API_KEY':'unit-test-placeholder'}):
            adapter=OpenRouterAdapter({'model':'openrouter/free'})
            for body in ({'model':'openai/gpt-4.1-mini'},{'model':'openrouter/free','plugins':[{'id':'web'}]}):
                with self.assertRaises(ProviderError):adapter._request('chat/completions',body)

    def test_old_paid_profile_cannot_resume_in_free_mode(self):
        with patch.dict(os.environ,{'FREE_MODE_ONLY':'1'}):
            with self.assertRaises(ProviderError):provider({'provider':'openai','model':'gpt-4.1-mini'})

    def test_search_rejected_before_network(self):
        with patch.dict(os.environ,{'FREE_MODE_ONLY':'1'}):
            with self.assertRaises(ProviderError):OpenRouterAdapter({'model':'openrouter/free'}).search({'title':'test'},5)
