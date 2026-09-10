import json
import os
from pathlib import Path
from .db import Jsonb

CONFIG_ROOT = Path(os.getenv('CONFIG_ROOT', str(Path(__file__).resolve().parents[2] / 'config')))


def load_configuration():
    policies = json.loads((CONFIG_ROOT / 'policies.json').read_text(encoding='utf-8'))
    policies['PromptSet'] = json.loads((CONFIG_ROOT / 'prompts.json').read_text(encoding='utf-8'))
    provider_name=policies['ProviderProfile']['provider']
    model = os.getenv({'openai':'OPENAI_MODEL','ollama':'OLLAMA_MODEL','openrouter':'OPENROUTER_MODEL','groq':'GROQ_MODEL'}[provider_name])
    if model:
        policies['ProviderProfile']['model'] = model
    if os.getenv('STT_MODEL'): policies['ProviderProfile']['transcription_model']=os.environ['STT_MODEL']
    return policies


def snapshot(conn):
    import hashlib
    config = load_configuration()
    for kind, value in config.items():
        # Environment-dependent variants have a distinct immutable ID.
        identifier = value['id'] + '-' + hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()[:12]
        conn.execute('INSERT INTO configurations(kind,id,version,content) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                     (kind, identifier, value['version'], Jsonb(value)))
        value['snapshot_id'] = identifier
    return config
