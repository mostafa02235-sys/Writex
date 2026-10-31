// JNI bridge between the Writex Android app and llama.cpp.
// One loaded model at a time; each request gets a fresh context sized to the
// prompt, so memory is released as soon as the answer is complete.
#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <string>
#include <vector>
#include "llama.h"

#define TAG "WritexAI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

struct Engine {
  llama_model * model = nullptr;
  const llama_vocab * vocab = nullptr;
  int max_ctx = 4096;
  int threads = 4;
  std::atomic<bool> stop{false};
  int last_prompt_tokens = 0;
  int last_output_tokens = 0;
  double last_prompt_ms = 0;
  double last_gen_ms = 0;
};

static void throwJava(JNIEnv * env, const char * msg) {
  jclass cls = env->FindClass("java/lang/RuntimeException");
  env->ThrowNew(cls, msg);
}

static std::string jstr(JNIEnv * env, jstring s) {
  if (!s) return "";
  const jsize len = env->GetStringUTFLength(s);
  const char * c = env->GetStringUTFChars(s, nullptr);
  std::string out(c, len);
  env->ReleaseStringUTFChars(s, c);
  return out;
}

// Java's "modified UTF-8" differs for some characters; pass plain UTF-8 through byte arrays instead.
static std::string jbytes(JNIEnv * env, jbyteArray a) {
  if (!a) return "";
  const jsize n = env->GetArrayLength(a);
  std::string out(n, '\0');
  env->GetByteArrayRegion(a, 0, n, reinterpret_cast<jbyte *>(&out[0]));
  return out;
}
static jbyteArray tobytes(JNIEnv * env, const std::string & s) {
  jbyteArray a = env->NewByteArray((jsize) s.size());
  env->SetByteArrayRegion(a, 0, (jsize) s.size(), reinterpret_cast<const jbyte *>(s.data()));
  return a;
}

// Number of bytes at the end of `s` that form an incomplete UTF-8 character
static size_t incompleteTail(const std::string & s) {
  size_t n = s.size();
  for (size_t back = 1; back <= 4 && back <= n; back++) {
    unsigned char c = (unsigned char) s[n - back];
    if ((c & 0xC0) == 0x80) continue;          // continuation byte
    size_t need = (c & 0x80) == 0 ? 1 : (c & 0xE0) == 0xC0 ? 2 : (c & 0xF0) == 0xE0 ? 3 : (c & 0xF8) == 0xF0 ? 4 : 1;
    return need > back ? back : 0;
  }
  return 0;
}

static bool g_backend = false;

extern "C" JNIEXPORT jlong JNICALL
Java_com_writex_app_ai_LlamaBridge_nLoad(JNIEnv * env, jclass, jstring jpath, jint maxCtx, jint threads) {
  if (!g_backend) {
    llama_log_set([](enum ggml_log_level level, const char * text, void *) {
      if (level >= GGML_LOG_LEVEL_WARN) __android_log_print(ANDROID_LOG_WARN, TAG, "%s", text);
    }, nullptr);
    llama_backend_init();
    g_backend = true;
  }
  const std::string path = jstr(env, jpath);
  llama_model_params mp = llama_model_default_params();
  mp.n_gpu_layers = 0;   // CPU inference (GPU backends vary too much between phones)
  mp.use_mmap = true;    // weights are paged from storage instead of copied into RAM
  llama_model * model = llama_model_load_from_file(path.c_str(), mp);
  if (!model) { throwJava(env, "model_load_failed"); return 0; }
  auto * e = new Engine();
  e->model = model;
  e->vocab = llama_model_get_vocab(model);
  const int train = llama_model_n_ctx_train(model);
  e->max_ctx = train > 0 && train < maxCtx ? train : maxCtx;
  e->threads = threads > 0 ? threads : 4;
  LOGI("model loaded: ctx %d, threads %d", e->max_ctx, e->threads);
  return reinterpret_cast<jlong>(e);
}

extern "C" JNIEXPORT void JNICALL
Java_com_writex_app_ai_LlamaBridge_nFree(JNIEnv *, jclass, jlong h) {
  auto * e = reinterpret_cast<Engine *>(h);
  if (!e) return;
  if (e->model) llama_model_free(e->model);
  delete e;
}

extern "C" JNIEXPORT void JNICALL
Java_com_writex_app_ai_LlamaBridge_nStop(JNIEnv *, jclass, jlong h) {
  auto * e = reinterpret_cast<Engine *>(h);
  if (e) e->stop.store(true);
}

extern "C" JNIEXPORT jint JNICALL
Java_com_writex_app_ai_LlamaBridge_nCountTokens(JNIEnv * env, jclass, jlong h, jbyteArray jtext) {
  auto * e = reinterpret_cast<Engine *>(h);
  if (!e) return -1;
  const std::string text = jbytes(env, jtext);
  return -llama_tokenize(e->vocab, text.c_str(), (int32_t) text.size(), nullptr, 0, false, true);
}

extern "C" JNIEXPORT jintArray JNICALL
Java_com_writex_app_ai_LlamaBridge_nLastStats(JNIEnv * env, jclass, jlong h) {
  auto * e = reinterpret_cast<Engine *>(h);
  jint vals[5] = {0, 0, 0, 0, 0};
  if (e) { vals[0] = e->last_prompt_tokens; vals[1] = e->last_output_tokens; vals[2] = (jint) e->last_prompt_ms; vals[3] = (jint) e->last_gen_ms; vals[4] = e->max_ctx; }
  jintArray out = env->NewIntArray(5);
  env->SetIntArrayRegion(out, 0, 5, vals);
  return out;
}

// roles/contents: the conversation. grammar: GBNF text or null. Streams through callback.onToken(byte[]).
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_writex_app_ai_LlamaBridge_nGenerate(JNIEnv * env, jclass, jlong h, jobjectArray jroles, jobjectArray jcontents,
                                             jint maxTokens, jfloat temperature, jbyteArray jgrammar, jobject callback) {
  auto * e = reinterpret_cast<Engine *>(h);
  if (!e || !e->model) { throwJava(env, "model_not_loaded"); return nullptr; }
  e->stop.store(false);

  // 1. Chat template (Qwen and most GGUF models carry their own)
  const jsize n = env->GetArrayLength(jroles);
  std::vector<std::string> roles(n), contents(n);
  std::vector<llama_chat_message> msgs(n);
  for (jsize i = 0; i < n; i++) {
    roles[i] = jstr(env, (jstring) env->GetObjectArrayElement(jroles, i));
    contents[i] = jbytes(env, (jbyteArray) env->GetObjectArrayElement(jcontents, i));
  }
  for (jsize i = 0; i < n; i++) msgs[i] = { roles[i].c_str(), contents[i].c_str() };
  const char * tmpl = llama_model_chat_template(e->model, nullptr);
  std::string prompt;
  int len = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, nullptr, 0);
  if (len > 0) {
    std::vector<char> buf(len + 1);
    llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, buf.data(), (int32_t) buf.size());
    prompt.assign(buf.data(), len);
  } else {  // ChatML fallback
    for (jsize i = 0; i < n; i++) prompt += "<|im_start|>" + roles[i] + "\n" + contents[i] + "<|im_end|>\n";
    prompt += "<|im_start|>assistant\n";
  }

  // 2. Tokenise
  const int n_prompt = -llama_tokenize(e->vocab, prompt.c_str(), (int32_t) prompt.size(), nullptr, 0, true, true);
  std::vector<llama_token> tokens(n_prompt);
  if (llama_tokenize(e->vocab, prompt.c_str(), (int32_t) prompt.size(), tokens.data(), n_prompt, true, true) < 0) {
    throwJava(env, "tokenize_failed"); return nullptr;
  }
  int max_new = maxTokens > 0 ? maxTokens : 512;
  if (n_prompt + 16 > e->max_ctx) { throwJava(env, "too_long"); return nullptr; }
  if (n_prompt + max_new > e->max_ctx) max_new = e->max_ctx - n_prompt;

  // 3. A context just big enough for this request
  llama_context_params cp = llama_context_default_params();
  int need = n_prompt + max_new + 8;
  cp.n_ctx = (uint32_t) ((need + 255) / 256 * 256);
  if ((int) cp.n_ctx > e->max_ctx) cp.n_ctx = e->max_ctx;
  cp.n_batch = 512;
  cp.n_ubatch = 512;
  cp.n_threads = e->threads;
  cp.n_threads_batch = e->threads;
  cp.no_perf = true;
  llama_context * ctx = llama_init_from_model(e->model, cp);
  if (!ctx) { throwJava(env, "context_failed"); return nullptr; }

  // 4. Sampler chain
  llama_sampler * smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
  const std::string grammar = jbytes(env, jgrammar);
  if (!grammar.empty()) {
    llama_sampler * g = llama_sampler_init_grammar(e->vocab, grammar.c_str(), "root");
    if (g) llama_sampler_chain_add(smpl, g);
  }
  llama_sampler_chain_add(smpl, llama_sampler_init_penalties(64, 1.1f, 0.0f, 0.0f));
  if (temperature <= 0.0f) {
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
  } else {
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(0.9f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(temperature));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));
  }

  jclass cbClass = env->GetObjectClass(callback);
  jmethodID onToken = env->GetMethodID(cbClass, "onToken", "([B)V");

  auto t0 = std::chrono::steady_clock::now();
  std::string out, pending;
  bool failed = false;
  // 5. Read the prompt in batches (stoppable between batches)
  for (int i = 0; i < n_prompt && !failed; i += (int) cp.n_batch) {
    if (e->stop.load()) break;
    const int nb = std::min((int) cp.n_batch, n_prompt - i);
    if (llama_decode(ctx, llama_batch_get_one(tokens.data() + i, nb)) != 0) failed = true;
  }
  auto t1 = std::chrono::steady_clock::now();
  int produced = 0;
  // 6. Generate
  while (!failed && !e->stop.load() && produced < max_new) {
    llama_token tok = llama_sampler_sample(smpl, ctx, -1);
    if (llama_vocab_is_eog(e->vocab, tok)) break;
    char buf[256];
    const int m = llama_token_to_piece(e->vocab, tok, buf, sizeof(buf), 0, false);
    if (m > 0) {
      pending.append(buf, m);
      const size_t tail = incompleteTail(pending);
      if (pending.size() > tail) {
        const std::string ready = pending.substr(0, pending.size() - tail);
        pending.erase(0, pending.size() - tail);
        out += ready;
        jbyteArray arr = tobytes(env, ready);
        env->CallVoidMethod(callback, onToken, arr);
        env->DeleteLocalRef(arr);
        if (env->ExceptionCheck()) { env->ExceptionClear(); }
      }
    }
    produced++;
    if (llama_decode(ctx, llama_batch_get_one(&tok, 1)) != 0) { failed = true; break; }
  }
  auto t2 = std::chrono::steady_clock::now();
  if (!pending.empty()) out += pending;

  e->last_prompt_tokens = n_prompt;
  e->last_output_tokens = produced;
  e->last_prompt_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
  e->last_gen_ms = std::chrono::duration<double, std::milli>(t2 - t1).count();
  llama_sampler_free(smpl);
  llama_free(ctx);
  if (failed && out.empty()) { throwJava(env, "decode_failed"); return nullptr; }
  return tobytes(env, out);
}
