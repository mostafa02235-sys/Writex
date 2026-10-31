// Stand-in used by the single-file web/artifact build, where there is no native layer.
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
export const App = null;
export const StatusBar = null;
export const Style = {};
export const SplashScreen = null;
export const Filesystem = null;
export const Directory = {};
export const Share = null;
export const Keyboard = null;
