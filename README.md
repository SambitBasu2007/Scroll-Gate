https://sambitbasu2007.github.io/Scroll-Gate/

# Kage — Lite v2

A condensed, fully procedural re-read of the reference "Kage" site: a
moon-lit mountain temple approached through two torii gates, told across
a hero + 3 chapters instead of the original's 6 sections. Everything
visual is generated code — no downloaded images, models, or fonts, no
CDN, no paid package.

## Files

- `index.html` — nav, hero, 3 chapter sections (`gate`, `temple`,
  `afterlight`), each tagged `data-cam` to drive the camera
- `style.css` — dark cinematic theme, nav, chapter typography,
  scroll-reveal states (`.rv-in`)
- `scene.js` — the whole 3D scene + camera + scroll logic
- `vendor/three.module.min.js` + `vendor/three.core.min.js` — local
  three.js r0.185.1 (three.module.min.js imports the core file as a
  sibling — both are required)

## Running it

ES modules are blocked on `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 and scroll.

## What's procedural (nothing downloaded)

- **Moon** — a `CircleGeometry` disc with a canvas-generated radial
  gradient + a few random craters, plus a second additive-blended circle
  behind it for the glow halo.
- **Temple** — stacked box/cone geometry with a row of flat, lit
  "paper screen" windows (`MeshBasicMaterial`, so they glow without
  needing extra lights).
- **Torii gates, stone lanterns, steps, hill silhouette, ground/path** —
  all primitive geometry (`Box`, `Cylinder`, `Cone`, `Sphere`,
  `Plane`).
- **Falling leaves** — a 150-point `Points` system with per-particle
  fall speed and a sine-wave horizontal sway, no textures.

## Camera system

Camera position/look-at/FOV are defined per chapter in the `CAM` array
in `scene.js`, interpolated with `CatmullRomCurve3`. Scroll position is
converted to a chapter-index float by measuring each `[data-cam]`
section's actual position on the page (so it stays correct regardless
of how much text is in a section), then critically-damped toward that
target each frame so it reads as a walk, not a scroll-jump.

**The CAM array must always have exactly as many entries as there are
`[data-cam]` elements in index.html** (currently 5: hero, gate, temple,
afterlight, and a trailing spacer). Adding/removing a section means
adding/removing the matching CAM entry.

## The CSS rule that actually matters

```css
html, body {
    overflow-x: hidden;
    overflow-y: visible;
}
```

Never set `overflow-x: hidden` without also pinning `overflow-y`
explicitly. Left unpaired, the browser silently converts `overflow-y`
to `auto`, which — combined with any fixed height on `html`/`body` —
traps all scrolling inside `body` instead of the actual page. This
bit an earlier version of this project; it's commented in the CSS as
a guardrail.

## Making it yours

- **Copy**: edit the text directly in `index.html` — headings,
  eyebrows, paragraphs.
- **Colors**: `mat*` constants near the top of `scene.js`, plus
  `--vermilion` / `--ember` / `--ink` in `style.css`.
- **Camera route**: the `CAM` array in `scene.js` — each entry is
  `{ p: [x,y,z], t: [x,y,z], fov }`.
- **Chapter count**: add a new `<section data-cam="N">...` in
  index.html, a matching entry in `CAM`, and bump the trailing
  `.track-end` element's `data-cam` to the new final index.
- **Font**: swap the `@font-face src` in `style.css` for a local
  `.woff2` if you want something other than the system fallback.

## Left out on purpose (vs. the ~6700-line reference)

No foreground foliage photography, no card/thumbnail grids, no
word-mask text-reveal animation, no hand-held mouse-parallax drift, no
aspect-fit FOV reprojection, no audio. These are the things that made
the original big; the walk-through-a-temple feeling doesn't depend on
them.
