// The GPU effect shaders. Pure data — no pixi import — so this stays tiny and
// tree-shakeable; renderer.ts pairs each fragment with pixi's default filter
// vertex shader.
//
// pixi.js v8 filter conventions (verified against the installed source):
//   • NO `#version` and NO `precision` line — GlProgram's preprocessor injects
//     `#version 300 es` + precision. We write GLSL ES 300 *syntax*.
//   • input sampler is `uTexture`, the UV varying is `vTextureCoord`, output is
//     our own `out vec4 finalColor` (not gl_FragColor). Use texture(), in/out.
//   • FilterSystem auto-provides `uInputSize` (.xy = px size, .zw = 1/size) and
//     `uInputClamp` (.xy = min UV, .zw = max UV of the valid frame region).
//   • pixi works in premultiplied alpha inside filters, so psSample()
//     un-premultiplies before colour math and we re-premultiply on output
//     (our video source is opaque, a≈1, so output alpha is 1).
//
// Every warp samples through psSample(), which clamps to uInputClamp — so a
// warp that pushes a sample past the frame edge repeats the edge pixel instead
// of revealing a transparent wedge (which compose() would otherwise bake in).
//
// `uStrength` is the normalized 0..1 slider value; each shader maps it to its
// own physical range internally.

export const FRAG_HEADER = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// highp to match the precision these globals are declared with in pixi's default
// filter *vertex* shader — a mismatch fails to link wherever uInputSize is used.
uniform highp vec4 uInputSize;   // .xy = size in px, .zw = 1/size
uniform highp vec4 uInputClamp;  // .xy = min UV, .zw = max UV of the valid frame

uniform float uStrength;   // 0..1 normalized intensity

vec3 psSample(vec2 uv) {
  vec4 c = texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
  return c.a > 0.0011 ? c.rgb / c.a : c.rgb;
}
float psLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

// Radial magnify around the frame centre. Aspect-corrected so the lens is
// circular; the displacement decays to zero at the lens edge so the frame
// border stays put (no corner voids). Dent is the same math with a negative
// strength — a pinch instead of a bulge.
const BULGE = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;         // 0..1 within the frame
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;         // aspect
  float r = length(vec2(c.x * A, c.y));
  float S = uStrength * 0.6;
  float t = clamp(r / 0.62, 0.0, 1.0);
  float f = 1.0 - t;
  float scale = 1.0 - S * f * f;                 // <1 near centre = magnify
  vec2 wp = 0.5 + c * scale;
  finalColor = vec4(psSample(lo + wp * span), 1.0);
}`;

const DENT = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  float r = length(vec2(c.x * A, c.y));
  float S = -uStrength * 1.1;                     // negative = pinch — deep, PB-strength
  float t = clamp(r / 0.72, 0.0, 1.0);           // wider lens for a fuller dimple
  float f = 1.0 - t;
  float scale = 1.0 - S * f * f;
  vec2 wp = 0.5 + c * scale;
  finalColor = vec4(psSample(lo + wp * span), 1.0);
}`;

// Angular swirl: rotate each sample around the centre by an amount that peaks
// at the centre and decays to the lens edge. Rotation happens in
// aspect-corrected space so the swirl is circular.
const TWIRL = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  vec2 ca = vec2(c.x * A, c.y);
  float r = length(ca);
  float t = clamp(r / 0.62, 0.0, 1.0);
  float ang = uStrength * 4.2 * (1.0 - t) * (1.0 - t);
  float s = sin(ang), co = cos(ang);
  vec2 rc = vec2(ca.x * co - ca.y * s, ca.x * s + ca.y * co);
  rc.x /= A;
  vec2 wp = 0.5 + rc;
  finalColor = vec4(psSample(lo + wp * span), 1.0);
}`;

// Light tunnel: fold the radius with a triangle wave so the image repeats in
// concentric rings out from the centre — a kaleidoscopic tunnel. Higher
// strength = tighter folds = more rings.
const TUNNEL = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  vec2 ca = vec2(c.x * A, c.y);
  float r = length(ca);
  float ang = atan(ca.y, ca.x);
  float fold = mix(0.55, 0.14, uStrength);
  float m = mod(r, 2.0 * fold);
  float rr = m > fold ? (2.0 * fold - m) : m;
  vec2 nc = vec2(cos(ang), sin(ang)) * rr;
  nc.x /= A;
  vec2 wp = 0.5 + nc;
  finalColor = vec4(psSample(lo + wp * span), 1.0);
}`;

// Comic book: posterize the colour into flat bands and ink the edges with a
// Sobel filter on luminance. More "Ink" = fewer colour bands + heavier lines.
// The sample step is normalized to a 720px reference so the ink lines cover the
// same fraction of the frame in the 720-capped preview and the native-res
// capture (a raw texel step would scale with resolution and break WYSIWYG).
const COMIC = `void main(void) {
  vec2 texel = uInputSize.zw * (max(uInputSize.x, uInputSize.y) / 720.0);
  vec3 base = psSample(vTextureCoord);
  float levels = mix(6.0, 3.0, uStrength);
  vec3 poster = floor(base * levels + 0.5) / levels;
  float tl = psLuma(psSample(vTextureCoord + texel * vec2(-1.0, -1.0)));
  float ml = psLuma(psSample(vTextureCoord + texel * vec2(-1.0,  0.0)));
  float bl = psLuma(psSample(vTextureCoord + texel * vec2(-1.0,  1.0)));
  float tr = psLuma(psSample(vTextureCoord + texel * vec2( 1.0, -1.0)));
  float mr = psLuma(psSample(vTextureCoord + texel * vec2( 1.0,  0.0)));
  float br = psLuma(psSample(vTextureCoord + texel * vec2( 1.0,  1.0)));
  float tc = psLuma(psSample(vTextureCoord + texel * vec2( 0.0, -1.0)));
  float bc = psLuma(psSample(vTextureCoord + texel * vec2( 0.0,  1.0)));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float edge = sqrt(gx * gx + gy * gy);
  float ink = smoothstep(0.5, 1.1, edge * (0.6 + uStrength));
  vec3 col = mix(poster, vec3(0.03, 0.02, 0.05), ink);
  finalColor = vec4(col, 1.0);
}`;

// Dreamy glow: a soft bloom. Ring-sample around each pixel, keep the bright
// part, and add it back for a hazy halo. Strength drives the glow gain. The
// ring radius is normalized to a 720px reference so the halo is the same size
// relative to the frame in the preview and the (higher-res) capture.
const GLOW = `void main(void) {
  vec2 texel = uInputSize.zw * (max(uInputSize.x, uInputSize.y) / 720.0);
  vec3 base = psSample(vTextureCoord);
  float g = uStrength * 1.6;
  vec3 sum = vec3(0.0);
  const int N = 12;
  for (int i = 0; i < N; i++) {
    float a = (float(i) / float(N)) * 6.2831853;
    vec2 o = vec2(cos(a), sin(a)) * 2.5;
    sum += psSample(vTextureCoord + o * texel);
  }
  sum /= float(N);
  vec3 bright = max(sum - 0.55, 0.0);
  vec3 col = base + bright * g * 2.2;
  col = mix(col, vec3(psLuma(col)), 0.05 * uStrength);
  finalColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// X-ray: invert luminance and tint it cold blue-white, with a contrast punch.
const XRAY = `void main(void) {
  vec3 base = psSample(vTextureCoord);
  float l = psLuma(base);
  float inv = 1.0 - l;
  vec3 xr = clamp(vec3(inv * 0.55, inv * 0.92, inv * 1.12), 0.0, 1.0);
  xr = pow(xr, vec3(mix(1.0, 0.75, uStrength)));
  vec3 col = mix(base, xr, clamp(uStrength + 0.35, 0.0, 1.0));
  finalColor = vec4(col, 1.0);
}`;

// Colored Pencil (≈ CILineOverlay): desaturate, draw Sobel strokes on a paper
// tint. More strength = darker, tighter strokes over a stronger paper wash.
const PENCIL = `void main(void) {
  vec2 texel = uInputSize.zw * (max(uInputSize.x, uInputSize.y) / 720.0);
  vec3 base = psSample(vTextureCoord);
  float l = psLuma(base);
  float tl = psLuma(psSample(vTextureCoord + texel * vec2(-1.0, -1.0)));
  float ml = psLuma(psSample(vTextureCoord + texel * vec2(-1.0,  0.0)));
  float bl = psLuma(psSample(vTextureCoord + texel * vec2(-1.0,  1.0)));
  float tr = psLuma(psSample(vTextureCoord + texel * vec2( 1.0, -1.0)));
  float mr = psLuma(psSample(vTextureCoord + texel * vec2( 1.0,  0.0)));
  float br = psLuma(psSample(vTextureCoord + texel * vec2( 1.0,  1.0)));
  float tc = psLuma(psSample(vTextureCoord + texel * vec2( 0.0, -1.0)));
  float bc = psLuma(psSample(vTextureCoord + texel * vec2( 0.0,  1.0)));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float edge = sqrt(gx * gx + gy * gy);
  float stroke = 1.0 - smoothstep(0.15, 0.15 + mix(0.9, 0.35, uStrength), edge);
  vec3 muted = mix(vec3(l), base, 0.55);
  vec3 paper = mix(muted, vec3(0.96, 0.95, 0.92), 0.35);
  vec3 col = paper * stroke;
  col = mix(base, col, clamp(uStrength + 0.35, 0.0, 1.0));
  finalColor = vec4(col, 1.0);
}`;

// Squeeze (≈ CIPinchDistortion): pull samples inward across a broad region — a
// soft pinch. Distinct from Dent (a tight, deep dimple) by radius + falloff.
const SQUEEZE = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  vec2 ca = vec2(c.x * A, c.y);
  float dist = length(ca);
  float S = uStrength * 0.8;
  float t = clamp(dist / 0.9, 0.0, 1.0);         // broad region (vs Dent's tight lens)
  float f = 1.0 - t;
  float percent = 1.0 + S * f;                    // >1 = pull samples inward (pinch)
  vec2 wc = ca * percent;
  wc.x /= A;
  finalColor = vec4(psSample(lo + (0.5 + wc) * span), 1.0);
}`;

// Mirror: 2-fold kaleidoscope — reflect the left half onto the right about the
// vertical centre axis (NOT a horizontal flip). Strength blends in the mirror.
const MIRROR = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  float mx = 0.5 - abs(p.x - 0.5);                // fold both halves onto the left
  vec2 wp = mix(p, vec2(mx, p.y), clamp(uStrength, 0.0, 1.0));
  finalColor = vec4(psSample(lo + wp * span), 1.0);
}`;

// Fish Eye: whole-frame barrel bow. Unlike Bulge (a localized centre magnify
// that zeroes out past its lens), this bends the entire frame — edges bow in.
const FISHEYE = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  vec2 ca = vec2(c.x * A, c.y);
  float r = length(ca);
  float k = uStrength * 0.9;
  float rn = r / 0.72;
  float ff = 1.0 / (1.0 + k * rn * rn);           // pull inward across the whole frame
  vec2 wc = ca * ff;
  wc.x /= A;
  finalColor = vec4(psSample(lo + (0.5 + wc) * span), 1.0);
}`;

// Stretch: anisotropic centre bump — magnify along x (widen) while gently
// compressing y, so the centre of the face stretches sideways.
const STRETCH = `void main(void) {
  vec2 lo = uInputClamp.xy, hi = uInputClamp.zw;
  vec2 span = hi - lo;
  vec2 p = (vTextureCoord - lo) / span;
  vec2 c = p - 0.5;
  float A = uInputSize.x / uInputSize.y;
  vec2 ca = vec2(c.x * A, c.y);
  float r = length(ca);
  float t = clamp(r / 0.7, 0.0, 1.0);
  float f = (1.0 - t) * (1.0 - t);
  float S = uStrength * 0.6;
  float sx = 1.0 - S * f;                          // magnify x near centre (stretch wide)
  float sy = 1.0 + 0.25 * S * f;                   // slight y compress
  vec2 wc = vec2(ca.x * sx, ca.y * sy);
  wc.x /= A;
  finalColor = vec4(psSample(lo + (0.5 + wc) * span), 1.0);
}`;

export const FRAGMENTS: Record<import('../effects').ShaderId, string> = {
  bulge: BULGE,
  dent: DENT,
  twirl: TWIRL,
  squeeze: SQUEEZE,
  mirror: MIRROR,
  tunnel: TUNNEL,
  fisheye: FISHEYE,
  stretch: STRETCH,
  comic: COMIC,
  glow: GLOW,
  xray: XRAY,
  pencil: PENCIL,
};
