"""Bounded CPU-only speech recognition; this process receives no API credentials."""
import io
import json
import os
import subprocess
import sys
import threading
from .providers import ProviderError

gate=threading.BoundedSemaphore(1)


def transcribe(audio,model='base'):
    if model not in ('tiny','base','small'): raise ProviderError('Локальная STT: неизвестная модель','not_configured')
    if not gate.acquire(blocking=False): raise ProviderError('Локальная STT занята; повторите после завершения записи','unavailable')
    try:
        env={'PATH':os.environ.get('PATH',''),'HF_HOME':'/models/hf','HF_HUB_DISABLE_TELEMETRY':'1','HF_HUB_DISABLE_XET':'1','PYTHONPATH':'/app'}
        result=subprocess.run([sys.executable,'-m','farm.local_stt',model],input=audio,capture_output=True,timeout=150,env=env)
        if result.returncode: raise ProviderError('Локальная STT: модель не готова или распознавание завершилось ошибкой','error')
        text=json.loads(result.stdout)['text']
        if not text.strip(): raise ProviderError('Речь не распознана. Проверьте запись.','error')
        return text
    except subprocess.TimeoutExpired: raise ProviderError('Локальная STT: превышен лимит 150 секунд; аудио сохранено','error') from None
    finally:gate.release()


def main():
    from faster_whisper import WhisperModel
    model_name=sys.argv[1] if len(sys.argv)>1 else 'base'
    model=WhisperModel(model_name,device='cpu',compute_type='int8',cpu_threads=2,download_root='/models/whisper')
    if '--prepare' in sys.argv:
        print(json.dumps({'status':'ready','model':model_name}));return
    segments,_=model.transcribe(io.BytesIO(sys.stdin.buffer.read()),language='ru',beam_size=5,condition_on_previous_text=False)
    print(json.dumps({'text':' '.join(s.text.strip() for s in segments)},ensure_ascii=False))


if __name__=='__main__':main()
