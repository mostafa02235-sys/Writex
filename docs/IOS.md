# Building Writex for iOS (future)

The app code is shared by all platforms. Only the native project is missing. Everything iOS-specific is already in place:

- `@capacitor/ios` is in `devDependencies`, and `capacitor.config.json` has an `ios` block with a black background.
- All plugins used (App, Filesystem, Share, Status Bar, Splash Screen, Keyboard) support iOS.
- `src/platform.js` checks `platform === 'android'` only for Android-only calls, such as the status bar colour. Everything else runs on iOS unchanged.
- Safe areas use `env(safe-area-inset-*)`, so the notch and home indicator are handled.
- The app icon is in `assets/icon-source.png` (1254 × 1254), large enough for the 1024 × 1024 App Store icon.

## What you need

- A Mac with **Xcode 16** or newer, plus CocoaPods (`sudo gem install cocoapods`), or use Swift Package Manager with Capacitor 7.
- An **Apple Developer account** ($99/year) to install on devices outside development and to publish on the App Store.

## Steps

```bash
npm ci
npm run build
npx cap add ios        # creates ios/
npx cap sync ios
npx cap open ios       # opens Xcode
```

In Xcode:

1. **Signing & Capabilities**: pick your team. The bundle identifier is `com.writex.app`.
2. **App icon**: drag a 1024 × 1024 export of `assets/icon-source.png` into `Assets.xcassets › AppIcon`.
3. **Launch screen**: set the background to black and add the icon.
4. **Info.plist**: add `UISupportsDocumentBrowser` and `LSSupportsOpeningDocumentsInPlace` set to `YES`, so exported files show up in the Files app under *On My iPhone › Writex*.
5. Build and run on a device or simulator.

## Differences to check on iOS

- **Saving**: `Directory.Documents` on iOS is the app's own Documents folder. It appears in the Files app once the two Info.plist keys above are set.
- **Back button**: iOS has no system back button. The app's on-screen back buttons and swipe-down sheets already cover this.
- **Voice typing** depends on WKWebView speech support. The keyboard's dictation key always works.
