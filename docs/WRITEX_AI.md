# Writex AI: the on-device engine

Writex AI runs **inside the Android app, on the phone**. There are no AI providers, no API keys and no servers: documents, prompts and conversations never leave the device. The internet is only used once, to download a model file.

## How it is built

```
React app (WebView)                     Android (Java)                       Native (C++)
┌─────────────────────────┐  Capacitor  ┌─────────────────────────────┐ JNI ┌──────────────────────────┐
│ aiEngine.js  tasks,     │ ──────────▶ │ WritexAIPlugin              │ ──▶ │ writex_llama.cpp         │
│   stages, progress,     │             │  device / download / load / │     │  llama.cpp (b4600)       │
│   task history          │ ◀────────── │  generate / stop / unload   │ ◀── │  GGUF model, mmap,       │
│ localAI.js  models,     │  "token"    │  memory check, threads      │     │  sampler, JSON grammar   │
│   loading, streaming    │   events    │                             │     │                          │
└─────────────────────────┘             └─────────────────────────────┘     └──────────────────────────┘
```

| Layer | Files | What it does |
|---|---|---|
| Engine | `android/app/src/main/cpp/` | [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT) compiled for `arm64-v8a` (phones) and `x86_64` (emulators, Chromebooks), plus a small JNI bridge. CPU inference; weights are memory-mapped, not copied into RAM. |
| Plugin | `android/app/src/main/java/com/writex/app/ai/` | Downloads models with resume support and real byte progress, checks free memory and storage, runs inference on a background thread, and streams tokens to the app. |
| App side | `src/localAI.js`, `src/aiEngine.js` | Model catalogue and device fit, load and unload, streaming, task runner, long-document pipeline and task history. |

## Models

The models are Qwen2.5 Instruct, quantised to 4 bits (GGUF). They are multilingual and handle Arabic and English well. They are downloaded from Hugging Face into the app's private storage and are **never committed to this repository**.

| Tier | Model | Download | Phone memory needed | Licence |
|---|---|---|---|---|
| Lightweight | Qwen2.5 0.5B Instruct Q4_K_M | 491 MB | 3 GB | Apache 2.0 |
| Standard | Qwen2.5 1.5B Instruct Q4_K_M | 1.1 GB | 4 GB | Apache 2.0 |
| Advanced | Qwen2.5 3B Instruct Q4_K_M | 2.1 GB | 6 GB | Qwen Research License (personal and research use) |

- **Choosing a model.** Settings › Writex AI recommends the strongest model the phone can run. It does not allow installing a model that needs more memory than the phone has.
- **Before loading.** The plugin checks free memory again before it loads a model.
- **Changing models.** Models can be downloaded, switched and removed at any time. An interrupted download continues where it stopped.

### Installing a model by hand

You can copy a model file instead of downloading it in the app. Put the `.gguf` file, with exactly the file name above, into the app's storage at `/data/data/com.writex.app/files/models/`, for example with Android Studio's Device Explorer.

## Memory, speed and battery

| Area | How it works |
|---|---|
| Model memory | One model in memory at a time. It unloads after 4 idle minutes, when the app goes to the background, or from Settings. |
| Context memory | Each request gets a context just large enough for its prompt and answer, freed straight after (up to 8,192 tokens). |
| Threads | Between 2 and 4, leaving cores free for the interface. |
| Responsiveness | Generation runs on a background thread, so you can keep editing. Cancel stops it between tokens. |
| Speed | Measured on real answers and shown in Settings. |

## Long documents and tasks (`src/aiEngine.js`)

A request becomes a task with real states:

**waiting → processing (loading the model) → analysing part k of n → generating → completed / failed / cancelled**

- Task history is stored on the phone, and can be deleted in Settings.
- **Short sources** go to the model directly.
- **Long sources** are split on paragraph boundaries (about 9,000 characters per part). The model writes notes on each part, the notes are condensed again if they are still too long, and the final answer is written from them.
- **Questions about long documents** first use keyword search (plain code, no model) to pick the most relevant parts.
- **Structured results** (quizzes, flashcards, slides, mind maps) use llama.cpp's JSON grammar, so the model can only produce valid JSON.
- **Deterministic work is done with normal code**, not the model: PDF and Word text extraction (pdf.js, mammoth), splitting, search, formatting and exports.

## Building

The llama.cpp source is downloaded at build time and is not committed:

```bash
bash scripts/fetch-llama.sh        # pinned release b4600 → android/app/src/main/cpp/llama.cpp
npm run android:debug
```

You need the Android NDK and CMake 3.22 (Android Studio › SDK Manager › SDK Tools). GitHub Actions does all of this automatically.

## Testing

The emulator job in GitHub Actions tests the real APK:

- installs the lightweight model through the Settings screen (a real download);
- switches the network **off**;
- chats in English and Arabic;
- runs a writing-assistant task;
- creates a PDF on the phone, extracts its text with pdf.js and answers a question about it;
- reads a long document in parts with real progress;
- produces JSON flashcards;
- cancels a task;
- unloads the model to free memory.

## Limitations

- **Small models are not as strong as large cloud models.** The Advanced model gives the best results; the Lightweight one suits short tasks.
- **Speed depends on the phone.** Mid-range phones write roughly 5–20 words per second with the Standard model. Reading a long PDF takes several minutes.
- **The models read text only.** Images are not understood.
- **Inference uses the CPU,** which is the most reliable option across Android phones. GPU acceleration may come later.
