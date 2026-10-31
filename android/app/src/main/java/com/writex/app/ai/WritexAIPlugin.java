package com.writex.app.ai;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.os.StatFs;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Writex AI: on-device language model (llama.cpp) for the Writex app.
 * Downloads model files into app storage, loads one model at a time, and streams
 * generated text to the web layer. Nothing is sent anywhere except the model download.
 */
@CapacitorPlugin(name = "WritexAI")
public class WritexAIPlugin extends Plugin {
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private volatile long handle = 0;
    private volatile String loadedFile = null;
    private volatile boolean cancelDownload = false;
    private volatile String downloadingId = null;
    private volatile boolean generating = false;

    private File modelsDir() {
        File d = new File(getContext().getFilesDir(), "models");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private ActivityManager.MemoryInfo memory() {
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(mi);
        return mi;
    }

    private static int threadsFor(int cores) {
        // Leave cores free for the interface and keep heat and battery use reasonable
        return Math.max(2, Math.min(4, cores - 2));
    }

    @PluginMethod
    public void device(PluginCall call) {
        ActivityManager.MemoryInfo mi = memory();
        StatFs fs = new StatFs(getContext().getFilesDir().getAbsolutePath());
        JSObject r = new JSObject();
        r.put("totalMem", mi.totalMem);
        r.put("availMem", mi.availMem);
        r.put("lowMemory", mi.lowMemory);
        r.put("cores", Runtime.getRuntime().availableProcessors());
        r.put("threads", threadsFor(Runtime.getRuntime().availableProcessors()));
        r.put("abi", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "");
        r.put("freeStorage", fs.getAvailableBytes());
        r.put("engine", LlamaBridge.available());
        r.put("engineError", LlamaBridge.loadError());
        r.put("loadedFile", loadedFile);
        r.put("generating", generating);
        r.put("downloading", downloadingId);
        JSArray files = new JSArray();
        File[] list = modelsDir().listFiles();
        if (list != null) for (File f : list) {
            JSObject o = new JSObject();
            o.put("file", f.getName());
            o.put("size", f.length());
            files.put(o);
        }
        r.put("files", files);
        call.resolve(r);
    }

    /** Downloads a model file with resume support and real byte progress ("download" events). */
    @PluginMethod
    public void download(PluginCall call) {
        final String id = call.getString("id");
        final String url = call.getString("url");
        final String file = call.getString("file");
        final long expected = call.getLong("size", 0L);
        if (id == null || url == null || file == null || !url.startsWith("https://") || file.contains("/")) { call.reject("bad_request"); return; }
        if (downloadingId != null) { call.reject("busy"); return; }
        StatFs fs = new StatFs(getContext().getFilesDir().getAbsolutePath());
        final File part = new File(modelsDir(), file + ".part");
        long have = part.exists() ? part.length() : 0;
        if (expected > 0 && fs.getAvailableBytes() < (expected - have) + 200L * 1024 * 1024) { call.reject("no_storage"); return; }
        cancelDownload = false;
        downloadingId = id;
        downloads.execute(() -> {
            HttpURLConnection conn = null;
            try {
                long done = part.exists() ? part.length() : 0;
                String location = url;
                for (int hop = 0; hop < 6; hop++) { // follow redirects (Hugging Face → CDN)
                    conn = (HttpURLConnection) new URL(location).openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", "Writex-Android");
                    if (done > 0) conn.setRequestProperty("Range", "bytes=" + done + "-");
                    int code = conn.getResponseCode();
                    if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null) {
                        location = new URL(new URL(location), conn.getHeaderField("Location")).toString();
                        conn.disconnect();
                        continue;
                    }
                    break;
                }
                int code = conn.getResponseCode();
                if (code == 416 && expected > 0 && done == expected) { /* already complete */ }
                else if (code != 200 && code != 206) throw new Exception("http_" + code);
                if (code == 200) done = 0; // server ignored the range: start over
                long total = expected > 0 ? expected : (done + Math.max(0, conn.getContentLengthLong()));
                if (code != 416) {
                    try (InputStream in = conn.getInputStream(); RandomAccessFile out = new RandomAccessFile(part, "rw")) {
                        out.setLength(done);
                        out.seek(done);
                        byte[] buf = new byte[1 << 16];
                        long lastEmit = 0;
                        int r;
                        while ((r = in.read(buf)) != -1) {
                            if (cancelDownload) throw new Exception("cancelled");
                            out.write(buf, 0, r);
                            done += r;
                            long now = System.currentTimeMillis();
                            if (now - lastEmit > 400) {
                                lastEmit = now;
                                JSObject ev = new JSObject();
                                ev.put("id", id); ev.put("received", done); ev.put("total", total); ev.put("state", "downloading");
                                notifyListeners("download", ev);
                            }
                        }
                    }
                }
                if (expected > 0 && part.length() != expected) throw new Exception("incomplete");
                // Every GGUF file starts with the bytes "GGUF"
                byte[] magic = new byte[4];
                try (FileInputStream fin = new FileInputStream(part)) { if (fin.read(magic) != 4) throw new Exception("not_a_model"); }
                if (!"GGUF".equals(new String(magic, StandardCharsets.US_ASCII))) { part.delete(); throw new Exception("not_a_model"); }
                File target = new File(modelsDir(), file);
                if (target.exists()) target.delete();
                if (!part.renameTo(target)) throw new Exception("rename_failed");
                JSObject ev = new JSObject();
                ev.put("id", id); ev.put("received", target.length()); ev.put("total", target.length()); ev.put("state", "installed");
                notifyListeners("download", ev);
                JSObject res = new JSObject(); res.put("file", file); res.put("size", target.length());
                call.resolve(res);
            } catch (Exception ex) {
                String msg = String.valueOf(ex.getMessage());
                JSObject ev = new JSObject();
                ev.put("id", id); ev.put("state", "cancelled".equals(msg) ? "cancelled" : "failed"); ev.put("error", msg);
                ev.put("received", part.exists() ? part.length() : 0);
                notifyListeners("download", ev);
                call.reject(msg.startsWith("http_") || msg.contains("Unable to resolve") || msg.contains("timeout") ? "network" : msg);
            } finally {
                if (conn != null) conn.disconnect();
                downloadingId = null;
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) { cancelDownload = true; call.resolve(); }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        final String file = call.getString("file");
        if (file == null || file.contains("/")) { call.reject("bad_request"); return; }
        inference.execute(() -> {
            if (file.equals(loadedFile)) freeModel();
            new File(modelsDir(), file).delete();
            new File(modelsDir(), file + ".part").delete();
            call.resolve();
        });
    }

    private void freeModel() {
        if (handle != 0) { LlamaBridge.nFree(handle); handle = 0; }
        loadedFile = null;
    }

    /** Loads a model into memory (refuses when the phone does not have enough free memory). */
    @PluginMethod
    public void load(PluginCall call) {
        final String file = call.getString("file");
        final int maxCtx = call.getInt("maxCtx", 8192);
        if (!LlamaBridge.available()) { call.reject("engine_unavailable", LlamaBridge.loadError()); return; }
        final File f = new File(modelsDir(), file == null ? "" : file);
        if (file == null || !f.exists()) { call.reject("not_installed"); return; }
        inference.execute(() -> {
            try {
                if (file.equals(loadedFile) && handle != 0) { call.resolve(statsObj(0)); return; }
                freeModel();
                ActivityManager.MemoryInfo mi = memory();
                // Weights are memory-mapped; the working set still needs about the file size plus the context
                long needed = (long) (f.length() * 1.15) + 256L * 1024 * 1024;
                if (mi.availMem + (mi.totalMem / 6) < needed) { call.reject("low_memory"); return; }
                long t0 = System.currentTimeMillis();
                handle = LlamaBridge.nLoad(f.getAbsolutePath(), maxCtx, threadsFor(Runtime.getRuntime().availableProcessors()));
                loadedFile = file;
                call.resolve(statsObj(System.currentTimeMillis() - t0));
            } catch (Throwable t) {
                freeModel();
                call.reject(String.valueOf(t.getMessage()));
            }
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        if (generating) LlamaBridge.nStop(handle);
        inference.execute(() -> { freeModel(); call.resolve(); });
    }

    private JSObject statsObj(long loadMs) {
        JSObject r = new JSObject();
        r.put("loadedFile", loadedFile);
        r.put("loadMs", loadMs);
        if (handle != 0) {
            int[] s = LlamaBridge.nLastStats(handle);
            r.put("maxCtx", s[4]);
        }
        return r;
    }

    /** Streams "token" events {requestId, text}; resolves with the full text and timings. */
    @PluginMethod
    public void generate(PluginCall call) {
        final String requestId = call.getString("requestId", "");
        final JSONArray msgs = call.getArray("messages");
        final int maxTokens = call.getInt("maxTokens", 512);
        final float temperature = call.getFloat("temperature", 0.7f);
        final String grammar = call.getString("grammar");
        if (handle == 0) { call.reject("not_loaded"); return; }
        inference.execute(() -> {
            if (handle == 0) { call.reject("not_loaded"); return; }
            try {
                int n = msgs.length();
                String[] roles = new String[n];
                byte[][] contents = new byte[n][];
                for (int i = 0; i < n; i++) {
                    JSONObject m = msgs.getJSONObject(i);
                    roles[i] = m.getString("role");
                    contents[i] = m.getString("content").getBytes(StandardCharsets.UTF_8);
                }
                generating = true;
                byte[] out = LlamaBridge.nGenerate(handle, roles, contents, maxTokens, temperature,
                    grammar == null ? null : grammar.getBytes(StandardCharsets.UTF_8),
                    bytes -> {
                        JSObject ev = new JSObject();
                        ev.put("requestId", requestId);
                        ev.put("text", new String(bytes, StandardCharsets.UTF_8));
                        notifyListeners("token", ev);
                    });
                int[] s = LlamaBridge.nLastStats(handle);
                JSObject r = new JSObject();
                r.put("text", new String(out, StandardCharsets.UTF_8));
                r.put("promptTokens", s[0]);
                r.put("outputTokens", s[1]);
                r.put("promptMs", s[2]);
                r.put("genMs", s[3]);
                call.resolve(r);
            } catch (Throwable t) {
                call.reject(String.valueOf(t.getMessage()));
            } finally {
                generating = false;
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (handle != 0) LlamaBridge.nStop(handle);
        call.resolve();
    }

    @PluginMethod
    public void countTokens(PluginCall call) {
        final String text = call.getString("text", "");
        inference.execute(() -> {
            if (handle == 0) { call.reject("not_loaded"); return; }
            JSObject r = new JSObject();
            r.put("tokens", LlamaBridge.nCountTokens(handle, text.getBytes(StandardCharsets.UTF_8)));
            call.resolve(r);
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (handle != 0) LlamaBridge.nStop(handle);
        inference.execute(this::freeModel);
        super.handleOnDestroy();
    }
}
