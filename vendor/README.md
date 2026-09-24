# Vendored code

Third-party and cross-project files copied in rather than fetched at runtime.
Nothing here is edited: keeping each file byte-identical to its source is what
makes it possible to diff against upstream and see whether a copy has drifted.

## pit-band.js

| | |
|---|---|
| Source | https://github.com/WadeSellers/house-band |
| Path upstream | `pit-band.js` |
| Commit | `b81dfaab7b13cc102264ba4931f8ca39d16ed1cd` (2026-09-23) |
| Used by | `/toys/band.js` |

The generative lo-fi engine behind House Band, the menu bar app for the Mac.
Pure Web Audio: no samples, no recordings, no network calls, and one global,
`PitBand`.

**On the naming.** The repository was renamed from `pit-band` to `house-band`,
but the file and the global it defines are both still `PitBand` upstream, so
the copy here keeps that name too. Renaming it locally would mean this file no
longer matches its source, which defeats the point of vendoring it. If upstream
ever renames the file and the global, rename this copy in the same commit and
update the `<script>` tag in `index.html`.

GitHub currently redirects the old `pit-band` URL to the new one, but that
redirect stops working the moment anything else claims that name, which is why
the table above names the new repository rather than relying on it.

### Updating

```sh
git clone --depth 1 https://github.com/WadeSellers/house-band /tmp/house-band
cp /tmp/house-band/pit-band.js vendor/pit-band.js
```

Then update the commit in the table above, and check that The Band still plays
and that the chord in the top right advances: the toy reads the engine's
per-bar callback, so a change to that callback's shape would break the display
without breaking the audio.

**What lives in the app, not here.** The two-hour trial, the StoreKit paywall,
the install counter and the telemetry switch are all in the Mac app's Swift
code. None of it is in this file, and none of it should ever end up on the site.
