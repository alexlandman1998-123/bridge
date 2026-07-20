# MVP release asset verification

Run this only after the controlled pilot release has deployed:

```bash
npm run verify:release-assets -- --url=https://app.arch9.co.za
```

The check must pass before clearing the pilot creation hold. It verifies that:

1. `index.html` has the `arch9-release` marker.
2. `release-manifest.json` has the same release id.
3. The listing-detail chunk is included in the release manifest.
4. Every asset referenced by the manifest returns the expected content type rather than an HTML rewrite or 404.

If it fails, do not retry a user transaction. Keep the pilot paused, preserve the JSON output, and repair the deployment/cache state first.
