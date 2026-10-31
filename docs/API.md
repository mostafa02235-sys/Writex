# Writex AI HTTP API (v1)

Base URL: your server, e.g. `https://writex-ai.example.com`. Every request and response body is JSON, except the event stream.

Authenticated endpoints need the header `Authorization: Bearer <device token>`.

Errors look like this:

```json
{ "error": { "code": "rate_limited", "message": "Too many requests. Wait a moment and try again." } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `unauthorized` | 401 | Missing or invalid device token |
| `invite_required` | 403 | The server is private and needs an invite code |
| `not_found` | 404 | The job or file doesn't exist for this device |
| `conflict` | 409 | The job is still running |
| `too_large` | 413 | The upload is bigger than `WRITEX_MAX_UPLOAD_MB` |
| `rate_limited` | 429 | Too many requests (a `Retry-After` header is sent) |
| `quota` | 429 | This device's daily allowance is used up |
| `no_provider` | 503 | No model provider is configured on the server |
| `bad_request` | 400 | The request is malformed |

## Health

`GET /v1/health` (no authentication)

```json
{ "ok": true, "service": "writex-ai", "version": "1.0.0", "ready": true, "uptime": 3600 }
```

`ready` is `false` when no model provider is configured.

## Devices

`POST /v1/devices` (no authentication; send `X-Writex-Invite` if the server needs an invite code)

Request:

```json
{ "platform": "android", "appVersion": "1.1.20" }
```

Response:

```json
{ "deviceId": "dev_…", "token": "dev_….signature" }
```

## Status and usage

`GET /v1/status`

```json
{
  "ready": true,
  "models": [
    { "tier": "fast",   "provider": "gemini", "model": "gemini-2.0-flash", "available": true },
    { "tier": "smart",  "provider": "openai", "model": "gpt-4o",           "available": true },
    { "tier": "vision", "provider": "openai", "model": "gpt-4o-mini",      "available": true }
  ],
  "tasks": ["prompt", "chat", "write", "…"],
  "limits": { "dailyChars": 3000000, "jobsPerMinute": 12, "concurrentJobs": 2, "maxUploadMB": 25 },
  "usage": { "today": { "inputChars": 12034, "outputChars": 3311, "modelCalls": 7 } }
}
```

`GET /v1/usage` returns the last 30 days per day (`{ day, input, output, calls }`), job counts by status, and the daily limit.

## Files

`POST /v1/files` uploads a document's extracted text, or an image.

Text:

```json
{ "name": "Biology.pdf", "kind": "text", "text": "…", "mime": "application/pdf" }
```

Image:

```json
{ "name": "board.jpg", "kind": "image", "data": "data:image/jpeg;base64,…" }
```

Response:

```json
{ "id": "file_…", "name": "Biology.pdf", "kind": "text", "size": 165432 }
```

`DELETE /v1/files/:id` removes a file.

## Jobs

`POST /v1/jobs`

```json
{ "type": "summarize", "title": "Summarise: Biology", "input": { "fileIds": ["file_…"], "length": "detailed", "lang": "auto" } }
```

The response contains `{ "job": Job }` with `status: "waiting"`.

Input by type:

| Type | Input fields |
|---|---|
| `prompt` | `prompt` (required), `json` (bool), `system`, `quality` (`"best"` forces the smart tier) |
| `chat` | `messages` (`[{ role: "user" \| "assistant", content }]`, last one from the user), `fileIds` |
| `write` | `brief`, `length`, `tone`, `lang` |
| `continue`, `organize` | `text`, `paragraphs` |
| `summarize` | `fileIds` or `documents`, `length` (`short` \| `medium` \| `detailed`) |
| `analyze` | `fileIds`, `question` |
| `compare` | `fileIds` (at least 2), `focus` |
| `inconsistencies`, `extract` (`what`), `study_guide`, `chapters`, `explain` (`topic`) | `fileIds` or `documents` |
| `quiz` | `difficulty`, `count`. The result `data` is `{ title, questions: [{ type, q, options, answer, explanation, quote }] }` |
| `flashcards` | `count`. The result `data` is `{ cards: [{ front, back, quote }] }` |
| `revision_plan` | `days`, `examDate` |
| `research_outline` | `topic`, optional `fileIds` |
| `sources_review` | `fileIds` |

`documents: [{ name, text }]` can be sent instead of uploading files first. `lang` can be `auto`, `ar` or `en`.

### Job object

```json
{
  "id": "job_…", "type": "summarize", "title": "…",
  "status": "analyzing",
  "stage": "reading",
  "progress": { "done": 4, "total": 11 },
  "result": "…", "data": null,
  "error": null, "errorCode": null,
  "model": "gemini:gemini-2.0-flash", "attempt": 1, "parentId": null,
  "createdAt": 1793470000000, "startedAt": 1793470000100, "finishedAt": null
}
```

`status` is one of `waiting`, `processing`, `analyzing`, `generating`, `completed`, `failed`, `cancelled`. `progress` counts real units of work (document parts) and is `null` when there's nothing to count.

### Other job endpoints

| Endpoint | Purpose |
|---|---|
| `GET /v1/jobs?limit=50` | This device's jobs, newest first |
| `GET /v1/jobs/:id` | One job, including its result |
| `POST /v1/jobs/:id/cancel` | Cancel a waiting or running job |
| `POST /v1/jobs/:id/retry` | Start a new job with the same input (`parentId` points to the old one) |

### Live events

`GET /v1/jobs/:id/events` returns `text/event-stream`. Each event is `data: <json>`:

| Event | Meaning |
|---|---|
| `{ "type": "snapshot", "job": Job, "text": "…" }` | Always first: the current state and the text so far |
| `{ "type": "state", "job": Job }` | Status, stage or progress changed |
| `{ "type": "delta", "text": "…" }` | New streamed text; append it |
| `{ "type": "reset", "text": "…" }` | Replace the text after an automatic retry |
| `{ "type": "done", "job": Job }` | Final state; the stream closes |

A comment line `: ping` is sent every 15 seconds. If the connection drops, open the stream again: the snapshot restores the text.
