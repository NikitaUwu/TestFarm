FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY requirements.txt requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
RUN useradd --uid 10001 --create-home farm
RUN mkdir -p /models /state && chown farm:farm /models /state
COPY . .
USER farm
CMD ["uvicorn", "farm.api:app", "--host", "0.0.0.0", "--port", "8000"]
