# Updating Writex

## Everyday changes

1. Edit files in `src/` (screens are in `src/components/`) or `styles/app.css`.
2. If you add or change interface text, wrap it in `tr('…')` and add the Arabic translation to `src/locales/ar.js`. For counted phrases, use `trn(n, '{0} item', '{0} items')` and add the Arabic forms to `AR_PLURALS`.
3. Run `npm run i18n:check`. It lists anything that still needs translating.
4. Commit and push to `main`. GitHub Actions builds, tests and publishes a new `Writex.apk` within about 20 minutes.

The version number is `1.0.<build number>`. To change the first two parts, edit `version` in `package.json`.

## Changing the icon

Replace `assets/icon-source.png` (square, at least 1024 px), then run:

```bash
npm run icons          # regenerates launcher, adaptive, round and splash icons
npm run android:apply  # copies them into android/
```

## Updating libraries

- **Libraries**: versions are pinned in `package.json`. Writex loads them as browser scripts, which `scripts/build.mjs` copies from `node_modules` into `www/vendor/`. If an update moves a file, add the new path to the `VENDOR` list.
- **Capacitor**: update all `@capacitor/*` packages together, run `npx cap sync android`, then build.

## Data and storage

- Documents live in the app's IndexedDB database, which is named `qalam-docs` for compatibility with the first version. Do not rename it: renaming would hide existing documents.
- Settings are stored in `localStorage` under keys starting with `writex.`.
- Uninstalling the app deletes its data. Exported files in `Documents/Writex` stay on the phone.

## When a build fails

- If a build fails, open the run in the **Actions** tab to see the failed step.
- The workflow also pushes the logs to the `ci-results` branch: `npm.txt`, `web.txt`, `gradle-debug.txt` and the others.
- Device-test screenshots and `logcat.txt` are in the same branch.
