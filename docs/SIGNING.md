# Signing Writex for release

## What the builds use today

| Build | Signed with | Use it for |
|---|---|---|
| `Writex-debug.apk` (and `Writex.apk` when no release key is set) | The shared debug key in `android/app/debug.keystore` | Installing on your own phones. Every build uses the same key, so updates install over the old version and keep your documents. |
| `Writex.apk` + `Writex.aab` (release) | **Your private release key** | Google Play and public distribution |

The debug key is committed **on purpose and is not secret**. It is Android's standard debug key with the password `android`. Never use it for Google Play.

## Setting up the release key (once)

1. Create a keystore on your computer (JDK `keytool`):
   ```bash
   keytool -genkeypair -v -keystore writex-release.jks -alias writex \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   Choose a strong password and **back the file up somewhere safe**. If you lose it, you can't publish updates to the same Play listing.
2. Turn it into text for GitHub:
   ```bash
   base64 -w0 writex-release.jks > writex-release.b64     # macOS: base64 -i writex-release.jks
   ```
3. In the GitHub repository, go to **Settings › Secrets and variables › Actions › New repository secret** and add:

   | Secret | Value |
   |---|---|
   | `WRITEX_KEYSTORE_BASE64` | the contents of `writex-release.b64` |
   | `WRITEX_KEYSTORE_PASSWORD` | the keystore password |
   | `WRITEX_KEY_ALIAS` | `writex` (or the alias you chose) |
   | `WRITEX_KEY_PASSWORD` | the key password (often the same) |

4. Push any change, or run the workflow from the Actions tab. The build then also produces a signed `Writex.apk` and `Writex.aab`.

The workflow decodes the keystore into a temporary file and deletes it after the build. The secrets never appear in the repository or in the logs.

## Signing on your own computer

Create `android/keystore.properties`. Git ignores this file, so never commit it:

```properties
storeFile=/absolute/path/to/writex-release.jks
storePassword=…
keyAlias=writex
keyPassword=…
```

Then run `npm run android:release`. The APK is written to `android/app/build/outputs/apk/release/` and the AAB to `android/app/build/outputs/bundle/release/`.

## Switching from the debug build to the release build

Android only installs an update when it is signed with the same key as the installed app. The first time you move from the debug-signed app to the release-signed one:

1. Export your documents to Word or PDF.
2. Uninstall the debug build.
3. Install the release build.

From then on, every release installs as a normal update.
