package com.writex.app.ai;

/** Thin JNI wrapper around the llama.cpp engine in src/main/cpp/writex_llama.cpp. */
public final class LlamaBridge {
    public interface TokenCallback { void onToken(byte[] utf8); }

    private static Throwable loadError;
    static {
        try { System.loadLibrary("writex_llama"); } catch (Throwable t) { loadError = t; }
    }
    public static boolean available() { return loadError == null; }
    public static String loadError() { return loadError == null ? null : String.valueOf(loadError.getMessage()); }

    static native long nLoad(String path, int maxCtx, int threads);
    static native void nFree(long handle);
    static native void nStop(long handle);
    static native int nCountTokens(long handle, byte[] text);
    static native int[] nLastStats(long handle);
    static native byte[] nGenerate(long handle, String[] roles, byte[][] contents, int maxTokens, float temperature, byte[] grammar, TokenCallback cb);

    private LlamaBridge() {}
}
