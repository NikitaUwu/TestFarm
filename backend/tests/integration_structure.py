"""Live structure regression on an existing Reviewer fixture; does not save a new version."""
import json
import os
import httpx


if __name__ == '__main__':
    with httpx.Client(base_url=os.getenv('TEST_API_URL', 'http://api:8000'), timeout=180,
                      headers={'X-Farm-Request': '1'}) as client:
        client.post('/auth/login', json={'identifier': 'demo', 'password': os.environ['REVIEWER_PASSWORD']}).raise_for_status()
        path = '/ideas/' + os.environ['TEST_IDEA_ID']
        before = client.get(path)
        before.raise_for_status()
        response = client.post(path + '/structure')
        response.raise_for_status()
        content = response.json()['content']
        assert content['transcript'] == before.json()['content']['transcript']
        assert content['problem'].strip() and content['audience'].strip()
        after = client.get(path)
        after.raise_for_status()
        assert after.json()['current_version'] == before.json()['current_version']
        print(json.dumps({'checks': ['problem_and_audience', 'original_transcript', 'no_unsolicited_version'],
                          'provider_calls': 1, 'provenance': 'technical_fixture'}))
