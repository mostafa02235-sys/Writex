// Real Capacitor plugins, bundled into the Android/iOS app build (scripts/build.mjs).
import { registerPlugin } from '@capacitor/core';
export { Capacitor } from '@capacitor/core';
// On-device Writex AI (android/app/src/main/java/com/writex/app/ai/WritexAIPlugin.java)
export const WritexAI = registerPlugin('WritexAI');
export { App } from '@capacitor/app';
export { StatusBar, Style } from '@capacitor/status-bar';
export { SplashScreen } from '@capacitor/splash-screen';
export { Filesystem, Directory } from '@capacitor/filesystem';
export { Share } from '@capacitor/share';
export { Keyboard } from '@capacitor/keyboard';
