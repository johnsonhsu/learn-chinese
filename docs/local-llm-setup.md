# Local LLM setup for dev scripts

These developer scripts use a local Ollama runtime instead of cloud AI. This setup is optional; it only affects sentence generation and testing workflows.

## Install Ollama

- macOS: `brew install ollama`
- Linux/Windows: https://ollama.com/download

Start the service:

```bash
ollama serve
```

Keep that terminal window open, or run it as a background service if your OS supports it.

## Pull the required models

```bash
ollama pull qwen2.5:7b
ollama pull kenneth85/llama-3-taiwan
```

Confirm they are installed:

```bash
ollama list
```

You should see both models listed.

## Smoke test the API

```bash
curl http://localhost:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:7b","prompt":"hi","stream":false}'
```

A successful response returns JSON with a `response` field.

## Which script uses which model

- `modules/writing-challenge/scripts/generate-sentences.ts` — `qwen2.5:7b`
- `scripts/build-sentence-pool.ts` — `kenneth85/llama-3-taiwan`
- `scripts/test-sentence-gen.ts` — `kenneth85/llama-3-taiwan`

## Configuration

Today these settings are hardcoded as constants at the top of each script:

- `OLLAMA_URL = 'http://localhost:11434/api/generate'`
- `MODEL = '...'`

There is no environment-variable override. If you need a different endpoint or model, edit those constants in the script you are using.

## Why local / why these models

- Generation stays offline and private; no API keys or cloud costs.
- `kenneth85/llama-3-taiwan` is chosen for more natural Traditional Chinese output in sentence corpus work.
- `qwen2.5:7b` is used for structured HSK sentence generation; it can leak Simplified characters or English, so prompts reinforce Traditional-only output.

## Verify it works with a repo script

```bash
npx tsx scripts/test-sentence-gen.ts
```

If the script returns generated sentences instead of a connection error, the local runtime is wired correctly.

## Notes

- Do not commit any model weights to the repo; use `ollama pull` to fetch them locally.
- The cloud AI path in `platform/server/content-admin.ts` uses separate providers and is not covered by this doc.
