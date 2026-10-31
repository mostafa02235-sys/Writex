# Writex AI: architecture and deployment

Writex AI is the app's own AI service. The app never calls OpenAI or Google directly and never holds a provider key. It sends **tasks** to the Writex AI server, which:

- runs each task as a job;
- chooses a suitable model;
- reads long documents in stages;
- streams the answer back.

Writex does not train its own model. The server is Writex's own platform: task catalogue, document pipeline, job queue, routing, limits and usage tracking. It sits in front of the model providers you connect (OpenAI, Gemini or self-hosted open-source models).

```
 Android app (Writex)                     Writex AI server (server/)                  Model providers
 ┌──────────────────────┐   HTTPS + SSE   ┌────────────────────────────────┐  HTTPS   ┌─────────────────┐
 │ Writing assistant    │ ──────────────▶ │ Auth (device tokens)           │ ───────▶ │ OpenAI          │
 │ Studio · Learn       │                 │ Rate limits · daily allowance  │          │ Gemini          │
 │ Document companion   │ ◀────────────── │ Job queue (SQLite, resumable)  │ ◀─────── │ Self-hosted     │
 │ Writex AI chat/tasks │   live progress │ Document pipeline (chunk → map │          │ (Ollama, vLLM…) │
 └──────────────────────┘   + streaming   │   → condense → generate)       │          └─────────────────┘
                                          │ Model router (fast/smart/vision)│
                                          │ Usage log                      │
                                          └────────────────────────────────┘
```

## What happens when you ask Writex AI something

1. **Waiting.** The job is saved in the database and queued. The server limits how many jobs run at once in total and per device.
2. **Processing.** Attached files are loaded. The app extracts text from PDFs and Word files on the phone, using pdf.js and mammoth, then uploads the text with real progress.
3. **Analysing.** Sources longer than about 60,000 characters are split into parts of about 20,000 characters on paragraph boundaries. A fast model writes compact notes about each part for the task's goal. The app shows the real count, for example "Analysing part 4 of 11". Notes that are still too long are condensed again.
4. **Generating.** The final answer is written from the full text or the notes, streamed word by word to the app.
5. **Completed, Failed or Cancelled.** The result is stored on the server and on the device.

### Errors, timeouts and closed apps

- **Temporary provider errors** (rate limits, 5xx responses, network problems) are retried 3 times with back-off.
- **Timeouts:** each model request has its own time limit (`WRITEX_REQUEST_TIMEOUT_SECONDS`), and so does the whole job (`WRITEX_JOB_TIMEOUT_SECONDS`).
- **Cancelling** in the app stops the model request on the server. Any text already written is kept.
- **Retry** creates a new job linked to the old one.
- **Closing the app** does not stop a job. When the app opens again, it reconnects and shows the result. If the connection drops, the app reconnects automatically.
- **Server restarts:** jobs that were running are queued again and run from the start.

## Tasks

| Type | What it does | Model tier |
|---|---|---|
| `prompt` | The app's built-in tools: writing assistant (improve, rewrite, grammar, spelling, translate, expand, shorten, titles, tone, continue, organise, explain), Studio (slides, mind maps, charts…), Learn (flashcards, quizzes), companion | fast (smart for long or "best" requests) |
| `chat` | Writex AI conversation with history and attachments (documents, PDFs, images) | fast/smart, vision for images |
| `write`, `continue`, `organize` | Write a complete document, continue text, reorganise paragraphs | smart/fast |
| `summarize`, `analyze`, `extract` | Summaries, questions about documents, key information and tables | fast/smart |
| `compare`, `inconsistencies` | Compare two or more documents and find contradictions | smart |
| `study_guide`, `quiz`, `flashcards`, `revision_plan`, `chapters`, `explain` | Study tools built only from the supplied material | smart/fast |
| `research_outline`, `sources_review` | Research outlines and source reviews | smart |

The prompts are in `server/src/ai/tasks.js`. Changing them doesn't require a new app release.

## Model routing

Each task asks for a **tier**:

| Tier | Used for |
|---|---|
| **fast** | Short tasks and the notes made while reading long documents |
| **smart** | Long or demanding tasks |
| **vision** | Images |

You decide which model serves each tier:

```env
WRITEX_MODEL_FAST=gemini:gemini-2.0-flash
WRITEX_MODEL_SMART=openai:gpt-4o
WRITEX_MODEL_VISION=openai:gpt-4o-mini
```

If these are not set, the defaults of the first configured provider are used (see `server/src/ai/registry.js`). If a tier is unavailable, smart falls back to fast and vision falls back to smart. Users never see or choose a model.

## Deploying the server

The server needs **Node.js 22.13 or newer**. It has no npm dependencies: it uses the built-in HTTP, SQLite and fetch modules.

### 1. Pick a model provider

You need at least one of the following:

| Provider | What to set | Notes |
|---|---|---|
| **Gemini** | `GEMINI_API_KEY` from Google AI Studio | Has a free tier with limits |
| **OpenAI** | `OPENAI_API_KEY` | Paid per use |
| **Self-hosted** | `SELFHOSTED_BASE_URL`, e.g. `http://my-gpu-box:11434/v1` for Ollama, plus the model names in `WRITEX_MODEL_*` | Free, but needs a machine strong enough to run the model |

### 2. Run it

**Docker** (any VPS, Fly.io, Railway, Render):

```bash
cd server
docker build -t writex-ai .
docker run -d -p 8787:8787 -v writex-data:/data \
  -e WRITEX_TOKEN_SECRET=$(openssl rand -hex 32) \
  -e GEMINI_API_KEY=your-key \
  writex-ai
```

**Render or Railway without Docker:**

- **Root directory:** `server`
- **Start command:** `npm start`
- **Persistent disk:** mount one at `/data` and set `WRITEX_DB_PATH=/data/writex.db`.
- **Variables:** add the keys from `server/.env.example`.

The server must be reachable over **HTTPS**. Hosting platforms provide this automatically; on your own VPS, put Caddy or nginx in front of it. Check it with:

```
https://your-server/v1/health  →  {"ok":true,"ready":true,…}
```

### 3. Connect the app

In GitHub, open **Settings › Secrets and variables › Actions › Variables** and add `WRITEX_AI_URL` with your server's address, for example `https://writex-ai.onrender.com`. The next build includes it, and every copy of the app connects automatically. People can also enter a server address by hand in **Settings › Writex AI › Server address**.

## Security

- Provider keys exist only in the server's environment. They are never sent to the app or included in API responses.
- Each device gets a random ID and an HMAC-signed token from `WRITEX_TOKEN_SECRET`. The server collects no names or accounts.
- Limits per device:
  - jobs per minute and jobs running at once;
  - a daily character allowance;
  - registrations per network per hour.
- `WRITEX_INVITE_CODE` can make a server private, for a beta.
- CORS allows only the app's own origins plus any you add in `WRITEX_ALLOWED_ORIGINS`.
- Every request is logged in the `usage` table (characters and tokens per provider and model) for monitoring and cost control.
- The Android app allows plain HTTP only to `localhost` (`network_security_config.xml`). Everything else must use HTTPS.

## Database

SQLite, with numbered migrations in `server/src/db/migrations/`. They are applied automatically on start-up, or with `npm run migrate`.

| Table | Contents |
|---|---|
| `devices` | Registered devices |
| `files` | Uploaded document text and images |
| `jobs` | Every task, its state, result and error |
| `usage` | Model calls with character and token counts |
| `rate_events` | Rate-limit windows |

## Testing

`cd server && npm test` runs the API tests:

- device registration and authentication;
- streaming, and a 165,000-character document read in parts with exact progress counts;
- quizzes as JSON;
- chat with attachments;
- cancelling, retrying and automatic retry after provider failures;
- separation of data between devices;
- rate limits, and resuming jobs after a restart;
- the OpenAI streaming adapter against a local fake server.

These tests use a deterministic **test model**. It is enabled only with `WRITEX_ENABLE_TEST_PROVIDER=1` and refused when `NODE_ENV=production`. It returns labelled text such as "[TEST MODEL] …", so the pipeline can be tested without paid calls. The Android emulator test in GitHub Actions also connects the real app to such a server. It checks the connection, streaming, cancelling, document summaries and inserting results into a document.

See [API.md](API.md) for the HTTP API.
