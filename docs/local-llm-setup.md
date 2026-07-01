# Local LLM setup for dev scripts

Some dev-only scripts in this repo generate sentences through a **local Ollama**
runtime, not the app's cloud AI path. This doc covers just that local runtime:
install it, pull the models it needs, and verify it works. No model weights are
stored in this repo.

## Install Ollama

- macOS: `brew install ollama`
- Other platforms: https://ollama.com/download

Start the daemon before running any script that hits the API:

```bash
ollama serve
```

The API endpoint is `http://localhost:11434/api/generate`.

## Pull the required models

```bash
ollama pull qwen2.5:7b
ollama pull kenneth85/llama-3-taiwan
```

Which script uses which model:

- `modules/writing-challenge/scripts/generate-sentences.ts` — `qwen2.5:7b`
- `scripts/build-sentence-pool.ts` — `kenneth85/llama-3-taiwan`
- `scripts/test-sentence-gen.ts` — `kenneth85/llama-3-taiwan`

## Configure the endpoint/model

Each script currently uses a **hardcoded constant**:

- `const OLLAMA_URL = 'http://localhost:11434/api/generate'`
- `const MODEL = '...'`

There are **no env-var overrides today**. To change the model or endpoint, edit
the constants in the script directly.

## Verify it works

```bash
ollama list

curl http://localhost:11434/api/generate \
  -H 'content-type: application/json' \
  -d '{"model":"qwen2.5:7b","prompt":"hi","stream":false}'
```

Then run one of the tsx scripts, for example:

```bash
npx tsx scripts/test-sentence-gen.ts
```

## Why local / why two models

- **Local + offline**: generation is free and private.
- **`kenneth85/llama-3-taiwan`** is preferred for natural Taiwan Traditional
  output in sentence-pool generation.
- **`qwen2.5:7b`** is used by the writing-challenge sentence generator; it can
  occasionally leak Simplified characters or English, so the choice is deliberate.

## Out of scope

- Cloud AI paths in this repo, e.g. `platform/server/content-admin.ts` and
  Pages Functions that call Gemini / Cloudflare Workers AI.
- Committing model weights into the repo.
- The **#74** QA harness itself. This doc is its shared prerequisite.
