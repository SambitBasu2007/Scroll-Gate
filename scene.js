import * as THREE from "./vendor/three.module.min.js";

const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lenis = new Lenis({
    autoRaf: true,
    anchors: true,
});
const srand = (seed) => { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; }; };
const rng = srand(42);
// ===================== PROCEDURAL TEXTURE INFRASTRUCTURE =====================
const TAU = Math.PI * 2;
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
const noise2D = (seed) => {
    const rnd = mulberry32(seed), p = new Uint8Array(256), perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    return function (x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        const X = xi & 255, Y = yi & 255, xf = x - xi, yf = y - yi;
        const u = fade(xf), v = fade(yf);
        const g = (h, dx, dy) => { const q = G[h & 7]; return q[0] * dx + q[1] * dy; };
        const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
        const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
        return lerp(lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u),
            lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u), v);
    };
};
const fbm = (n, x, y, oct, lac, gain) => {
    let a = .5, f = 1, s = 0, m = 0;
    for (let i = 0; i < (oct || 4); i++) { s += a * n(x * f, y * f); m += a; a *= (gain || .5); f *= (lac || 2); }
    return s / m;
};
function cvs(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
const hex = (r, g, b) => "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
function fbmCanvas(W, H, seed, octaves, baseCells, contrast) {
    const out = cvs(W, H), o = out.getContext("2d");
    o.fillStyle = "#808080"; o.fillRect(0, 0, W, H);
    let cells = baseCells || 3, alpha = 1;
    for (let i = 0; i < (octaves || 5); i++) {
        const n2 = cvs(cells, cells), nx2 = n2.getContext("2d");
        const im = nx2.createImageData(cells, cells), d = im.data, r = mulberry32(seed + i * 977);
        for (let k = 0; k < cells * cells; k++) {
            const v = 128 + (r() - .5) * 255 * (contrast || 1);
            d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = clamp(v, 0, 255); d[k * 4 + 3] = 255;
        }
        nx2.putImageData(im, 0, 0);
        o.globalAlpha = alpha; o.globalCompositeOperation = i === 0 ? "source-over" : "overlay";
        o.imageSmoothingEnabled = true; o.imageSmoothingQuality = "high";
        o.drawImage(n2, 0, 0, W, H); cells *= 2; alpha *= .62;
    }
    o.globalAlpha = 1; o.globalCompositeOperation = "source-over"; return out;
}
function normalFromHeight(hc, strength) {
    const W = hc.width, H = hc.height;
    const b = cvs(W, H), bx = b.getContext("2d");
    bx.filter = "blur(1.1px)"; bx.drawImage(hc, 0, 0); bx.filter = "none";
    const src = bx.getImageData(0, 0, W, H).data;
    const out = cvs(W, H), ox = out.getContext("2d");
    const im = ox.createImageData(W, H), d = im.data;
    const at = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
    const s = strength || 2.4;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const gx = (at(x + 1, y) - at(x - 1, y)) * s;
        const gy = (at(x, y + 1) - at(x, y - 1)) * s;
        let nx2 = -gx, ny2 = gy, nz2 = 1;
        const il = 1 / Math.hypot(nx2, ny2, nz2);
        const i = (y * W + x) * 4;
        d[i] = (nx2 * il * .5 + .5) * 255; d[i + 1] = (ny2 * il * .5 + .5) * 255;
        d[i + 2] = (nz2 * il * .5 + .5) * 255; d[i + 3] = 255;
    }
    ox.putImageData(im, 0, 0); return out;
}
function tx(canvasEl, o) {
    o = o || {};
    const t = new THREE.CanvasTexture(canvasEl);
    t.wrapS = t.wrapT = o.wrap || THREE.ClampToEdgeWrapping;
    if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
    t.anisotropy = Math.min(o.aniso || 8, 16);
    if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
}
function surface(t, rep, o) {
    o = o || {};
    const wrap = THREE.RepeatWrapping;
    const m = new THREE.MeshStandardMaterial({
        map: tx(t.map, { wrap, repeat: rep, aniso: 8 }),
        normalMap: tx(t.normal, { wrap, repeat: rep, srgb: false, aniso: 8 }),
        normalScale: new THREE.Vector2(o.normal === undefined ? .8 : o.normal, o.normal === undefined ? .8 : o.normal),
        color: o.color === undefined ? 0xffffff : o.color,
        roughness: o.roughness === undefined ? 1 : o.roughness,
        metalness: o.metalness === undefined ? .02 : o.metalness
    });
    if (t.rough) m.roughnessMap = tx(t.rough, { wrap, repeat: rep, srgb: false });
    return m;
}
function texGlow(inner, mid) {
    const S = 256, c = cvs(S, S), x = c.getContext("2d");
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner || "rgba(255,255,255,1)");
    g.addColorStop(.28, mid || "rgba(255,255,255,.36)");
    g.addColorStop(.62, "rgba(255,255,255,.07)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, S, S); return c;
}
function texSky() {
    const W = 512, H = 512, c = cvs(W, H), x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgb(6,10,15)"); g.addColorStop(.34, "rgb(13,22,31)");
    g.addColorStop(.66, "rgb(17,26,34)"); g.addColorStop(.88, "rgb(24,35,42)");
    g.addColorStop(1, "rgb(14,22,28)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.globalAlpha = .34; x.globalCompositeOperation = "overlay";
    x.drawImage(fbmCanvas(W, H, 313, 5, 3, .9), 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    const rnd = mulberry32(881);
    for (let i = 0; i < 420; i++) {
        const sx = rnd() * W, sy = rnd() * H * .78, r = .5 + rnd() * rnd() * 1.7;
        x.fillStyle = "rgba(214,232,240," + ((.12 + rnd() * .42) * (1 - sy / H)) + ")";
        x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
    }
    return c;
}
function sweepPoly(points, profile) {
    const segs = points.length, np = profile.length;
    const pos = [], nor = [], uv = [], idx = [];
    const TV = new THREE.Vector3(), NV = new THREE.Vector3(), BV = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < segs; i++) {
        const p = points[i], a = points[Math.max(0, i - 1)], b2 = points[Math.min(segs - 1, i + 1)];
        TV.subVectors(b2, a).normalize();
        BV.crossVectors(TV, up).normalize();
        NV.crossVectors(BV, TV).normalize();
        for (let j = 0; j < np; j++) {
            const u = profile[j][0], v = profile[j][1], l = Math.hypot(u, v) || 1;
            pos.push(p.x + BV.x * u + NV.x * v, p.y + BV.y * u + NV.y * v, p.z + BV.z * u + NV.z * v);
            nor.push(BV.x * u / l + NV.x * v / l, BV.y * u / l + NV.y * v / l, BV.z * u / l + NV.z * v / l);
            uv.push(j / np, i / (segs - 1));
        }
    }
    for (let i = 0; i < segs - 1; i++) for (let j = 0; j < np; j++) {
        const j2 = (j + 1) % np, a = i * np + j, b2 = i * np + j2, c = (i + 1) * np + j2, d = (i + 1) * np + j;
        idx.push(a, b2, c, a, c, d);
    }
    [0, segs - 1].forEach((ring, k) => {
        const base = pos.length / 3, p = points[ring];
        pos.push(p.x, p.y, p.z); nor.push(0, 0, k ? 1 : -1); uv.push(.5, .5);
        for (let j = 0; j < np; j++) {
            const a = ring * np + j, b2 = ring * np + (j + 1) % np;
            k ? idx.push(base, a, b2) : idx.push(base, b2, a);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
}
function roofGeo(A, B, R, Hr, thick, flare) {
    const NX = 52, NZ = 34, FL = flare === undefined ? .30 : flare, e = 1e-3;
    const smoothStep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const hAt = (x, z) => {
        const cx = Math.min(1, Math.abs(x) / A), cz = Math.min(1, Math.abs(z) / B);
        const tx2 = Math.max(0, (Math.abs(x) - R) / Math.max(A - R, 1e-4));
        const t = Math.min(1, Math.max(tx2, cz));
        return Hr * Math.pow(1 - t, 1.45) + FL * Hr * smoothStep(.72, 1, t) * (.52 + .68 * Math.min(cx, cz));
    };
    const pos = [], nor = [], uv = [], idx = [];
    const N = new THREE.Vector3();
    const VPS = (NX + 1) * (NZ + 1);
    for (let k = 0; k < 2; k++) {
        for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
            const x = -A + 2 * A * i / NX, z = -B + 2 * B * j / NZ;
            N.set(-(hAt(x + e, z) - hAt(x - e, z)) / (2 * e), 1,
                -(hAt(x, z + e) - hAt(x, z - e)) / (2 * e)).normalize();
            if (k) N.negate();
            pos.push(x, hAt(x, z) - (k ? thick : 0), z);
            nor.push(N.x, N.y, N.z); uv.push(x * .14, z * .14);
        }
        for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
            const a = k * VPS + j * (NX + 1) + i, b2 = a + 1, c = a + NX + 2, d = a + NX + 1;
            k ? idx.push(a, c, b2, a, d, c) : idx.push(a, b2, c, a, c, d);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); return g;
}
function mergeGeos(list) {
    let vN = 0, iN = 0;
    list.forEach(g => { vN += g.attributes.position.count; iN += g.index.count; });
    const pos = new Float32Array(vN * 3), nor = new Float32Array(vN * 3), uv2 = new Float32Array(vN * 2);
    const idx = vN > 65535 ? new Uint32Array(iN) : new Uint16Array(iN);
    let vo = 0, io = 0;
    list.forEach(g => {
        pos.set(g.attributes.position.array, vo * 3);
        nor.set(g.attributes.normal.array, vo * 3);
        uv2.set(g.attributes.uv.array, vo * 2);
        const gi = g.index.array;
        for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
        io += gi.length; vo += g.attributes.position.count; g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("uv", new THREE.BufferAttribute(uv2, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
}


const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = 0x05070a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a0d);
scene.fog = new THREE.FogExp2(0x050a0e, 0.014);
// ===================== SKY BACKDROP =====================
const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(360, 190),
    new THREE.MeshBasicMaterial({
        color: new THREE.Color(.60, .70, .80), map: tx(texSky()),
        depthWrite: false, fog: false, toneMapped: false
    }));
skyMesh.position.set(0, 62, -108); skyMesh.renderOrder = 0; scene.add(skyMesh);


const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0x2a2622, 0x05070a, 1.2));
const sun = new THREE.DirectionalLight(0x8a97ff, 0.7);
sun.position.set(-8, 10, -6);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffd9c2, 0.65);
fill.position.set(2, 6, 30);
scene.add(fill);

let templeDoorPivotL = null, templeDoorPivotR = null, templeDoorLight = null;

function tex(size, draw) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

// ===================== MOON (cratered disc + corona) =====================
function texMoon() {
    const S = 512, c = cvs(S, S), x = c.getContext('2d');
    const R = S / 2 - 1, rnd = mulberry32(91);
    const px = (u, v) => [S / 2 + u * R, S / 2 + v * R];
    x.beginPath(); x.arc(S / 2, S / 2, R, 0, TAU); x.closePath();
    x.save(); x.clip();
    // highland base
    const g = x.createRadialGradient(S * .46, S * .44, S * .05, S / 2, S / 2, R);
    g.addColorStop(0, 'rgb(150,150,150)'); g.addColorStop(.55, 'rgb(158,158,158)');
    g.addColorStop(.86, 'rgb(178,178,178)'); g.addColorStop(1, 'rgb(196,196,196)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = .5;
    x.drawImage(fbmCanvas(256, 256, 517, 6, 4, 1.1), 0, 0, S, S);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    // maria
    const seas = [[-.52, -.06, .46, .80], [-.26, -.38, .31, .92], [.13, -.31, .20, .88],
    [.30, -.08, .23, .84], [.45, .12, .15, .78], [.27, .27, .12, .74],
    [.57, -.30, .12, .95], [-.27, .30, .19, .70], [-.47, .25, .13, .72]];
    const sea = cvs(S, S), sx = sea.getContext('2d');
    seas.forEach(([u, v, rad, dk]) => {
        for (let i = 0; i < 22; i++) {
            const a = rnd() * TAU, off = rnd() * rad * .66;
            const [bx, by] = px(u + Math.cos(a) * off, v + Math.sin(a) * off * .8);
            const rr = rad * R * (.30 + rnd() * .46);
            const bg = sx.createRadialGradient(bx, by, rr * .2, bx, by, rr);
            bg.addColorStop(0, 'rgba(0,0,0,' + (dk * .14).toFixed(3) + ')');
            bg.addColorStop(1, 'rgba(0,0,0,0)');
            sx.fillStyle = bg; sx.beginPath(); sx.arc(bx, by, rr, 0, TAU); sx.fill();
        }
    });
    x.save(); x.filter = 'blur(9px)'; x.globalAlpha = .90;
    x.drawImage(sea, 0, 0); x.restore();
    x.globalCompositeOperation = 'overlay'; x.globalAlpha = .18;
    x.drawImage(fbmCanvas(256, 256, 811, 4, 11, 1.2), 0, 0, S, S);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    // crater field
    const inSea = (u, v) => seas.some(([su, sv, rad]) => Math.hypot(u - su, (v - sv) * 1.15) < rad * .82);
    for (let i = 0; i < 500; i++) {
        const a = rnd() * TAU, rr = Math.sqrt(rnd()) * .97;
        const u = Math.cos(a) * rr, v = Math.sin(a) * rr;
        if (inSea(u, v) && rnd() > .12) continue;
        const [cx2, cy] = px(u, v);
        const r = (1 + rnd() * rnd() * rnd() * 11) * (S / 512);
        const fade = .55 + .45 * Math.sqrt(Math.max(0, 1 - rr * rr));
        const sq = Math.sqrt(Math.max(0, 1 - rr * rr)) * .72 + .28;
        x.save(); x.translate(cx2, cy); x.rotate(Math.atan2(v, u)); x.scale(sq, 1);
        x.rotate(-Math.atan2(v, u));
        const rimW = Math.max(.8, r * .26);
        const lg = x.createLinearGradient(-r, -r, r, r);
        lg.addColorStop(0, 'rgba(255,255,255,' + (.34 * fade).toFixed(3) + ')');
        lg.addColorStop(.5, 'rgba(255,255,255,0)');
        lg.addColorStop(1, 'rgba(0,0,0,' + (.38 * fade).toFixed(3) + ')');
        x.strokeStyle = lg; x.lineWidth = rimW;
        x.beginPath(); x.arc(0, 0, Math.max(.6, r - rimW * .5), 0, TAU); x.stroke();
        if (r > 3) {
            const fg = x.createLinearGradient(-r, -r, r, r);
            fg.addColorStop(0, 'rgba(0,0,0,' + (.21 * fade).toFixed(3) + ')');
            fg.addColorStop(1, 'rgba(255,255,255,' + (.07 * fade).toFixed(3) + ')');
            x.fillStyle = fg; x.beginPath(); x.arc(0, 0, r - rimW, 0, TAU); x.fill();
        }
        x.restore();
    }
    // terminator shadow
    const sh = x.createRadialGradient(S * .40, S * .38, S * .18, S * .52, S * .56, S * .72);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.30)');
    x.fillStyle = sh; x.fillRect(0, 0, S, S);
    x.restore();
    // limb feather
    const fe = x.createRadialGradient(S / 2, S / 2, R - 2.5, S / 2, S / 2, R);
    fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalCompositeOperation = 'destination-in';
    x.fillStyle = fe; x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = 'source-over';
    return c;
}
const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(8.6 * 2, 8.6 * 2),
    new THREE.MeshBasicMaterial({
        map: tx(texMoon()), color: new THREE.Color(3.6, .64, .61),
        transparent: true, depthWrite: false, fog: false, toneMapped: false
    })
);
moon.position.set(25, 30, -350); moon.renderOrder = 1;
scene.add(moon);

// Moon corona (radial glow)
const haloTex = tx(texGlow('rgba(255,124,112,.90)', 'rgba(206,52,48,.26)'));
const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(8.6 * 6.4, 8.6 * 6.4),
    new THREE.MeshBasicMaterial({
        map: haloTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, opacity: .44
    })
);
halo.position.set(25, 30, -350.3); halo.renderOrder = 0;
scene.add(halo);
// Mist band behind temple for depth separation
const mistTex = tx(texGlow('rgba(150,178,190,.62)', 'rgba(104,138,154,.20)'));
const mistPlane = new THREE.Mesh(new THREE.PlaneGeometry(64, 20),
    new THREE.MeshBasicMaterial({
        map: mistTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false, opacity: .17
    }));
mistPlane.position.set(0, 4.5, -182); mistPlane.renderOrder = 2; scene.add(mistPlane);
scene.add(halo);

// Materials
const matVermilion = new THREE.MeshStandardMaterial({ color: 0xe0231c, roughness: 0.55, emissive: 0x330705, emissiveIntensity: 0.5 });
const matVermilionDark = new THREE.MeshStandardMaterial({ color: 0x8f1712, roughness: 0.7, emissive: 0x220402, emissiveIntensity: 0.4 });
const matStone = new THREE.MeshStandardMaterial({ color: 0x11161a, roughness: 0.95 });
const matStoneLight = new THREE.MeshStandardMaterial({ color: 0x1b2226, roughness: 0.9 });
const matStonePath = new THREE.MeshStandardMaterial({ color: 0x181d21, roughness: 0.88 });
const matWood = new THREE.MeshStandardMaterial({ color: 0x0e0b09, roughness: 0.85 });
const matRoof = new THREE.MeshStandardMaterial({ color: 0x090a0c, roughness: 0.55 });
const matRoofEdge = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.5 });
const matWindow = new THREE.MeshBasicMaterial({ color: 0xffcf8a });
const matWoodDoor = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.7 });
const matGrass = new THREE.MeshStandardMaterial({ color: 0x0d1a0d, roughness: 1, transparent: true, opacity: 0.7 });
const matRock = new THREE.MeshStandardMaterial({ color: 0x0f1214, roughness: 0.92 });
const matRockLight = new THREE.MeshStandardMaterial({ color: 0x151a1d, roughness: 0.88 });
const matPine = new THREE.MeshStandardMaterial({ color: 0x081208, roughness: 0.95 });
const matPineTrunk = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.9 });
const matCedar = new THREE.MeshStandardMaterial({ color: 0x061006, roughness: 0.92 });
const matCherry = new THREE.MeshStandardMaterial({ color: 0x0a140a, roughness: 0.9 });
const matBamboo = new THREE.MeshStandardMaterial({ color: 0x0b160b, roughness: 0.88 });
const matMountain = new THREE.MeshStandardMaterial({ color: 0x080b0e, roughness: 1, fog: true });

// ===================== GROUND =====================
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), matStone);
ground.rotation.x = -Math.PI / 2;
ground.position.z = -200;
scene.add(ground);

// ===================== STONE PATH =====================
const pathStones = new THREE.Group();
for (let z = 15; z > -220; z -= 0.55) {
    const cols = 3 + Math.floor(Math.random() * 3);
    for (let c = 0; c < cols; c++) {
        const w = 0.4 + Math.random() * 0.5;
        const d = 0.3 + Math.random() * 0.2;
        const h = 0.06 + Math.random() * 0.05;
        const stone = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matStonePath);
        const xOff = (c - (cols - 1) / 2) * (0.5 + Math.random() * 0.12);
        stone.position.set(xOff + (Math.random() - 0.5) * 0.06, h / 2, z + (Math.random() - 0.5) * 0.08);
        stone.rotation.y = (Math.random() - 0.5) * 0.12;
        pathStones.add(stone);
    }
}
scene.add(pathStones);

// ===================== CONTINUOUS STAIRS (to door) =====================
// z=-60 to z=-163, y=0 to y=8.5 (door bottom at y=8.6)
const STAIR_START_Z = -60;
const STAIR_END_Z = -163;
const STAIR_TOP_Y = 8.5;
const STAIR_COUNT = 65;
const stairsGroup = new THREE.Group();
// Step treads + risers
for (let i = 0; i < STAIR_COUNT; i++) {
    const t = i / (STAIR_COUNT - 1);
    const z = lerp(STAIR_START_Z, STAIR_END_Z, t);
    const y = lerp(0, STAIR_TOP_Y, t);
    const stepW = lerp(5.0, 6.5, t);
    const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.12, 0.85), matStoneLight);
    step.position.set(0, y + 0.06, z);
    stairsGroup.add(step);
    if (i > 0) {
        const riserH = STAIR_TOP_Y / STAIR_COUNT;
        const riser = new THREE.Mesh(new THREE.BoxGeometry(stepW, riserH + 0.02, 0.1), matStone);
        riser.position.set(0, y - riserH / 2, z + 0.475);
        stairsGroup.add(riser);
    }
}
// Side posts
for (const side of [-1, 1]) {
    for (let i = 0; i < STAIR_COUNT; i += 4) {
        const t = i / (STAIR_COUNT - 1);
        const z = lerp(STAIR_START_Z, STAIR_END_Z, t);
        const y = lerp(0, STAIR_TOP_Y, t);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), matStoneLight);
        post.position.set(side * 3.0, y + 0.3, z);
        stairsGroup.add(post);
    }
}
// Small platform at door threshold (only below the door)
const doorPlatform = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.15, 2.5),
    matStoneLight
);
doorPlatform.position.set(0, STAIR_TOP_Y + 0.075, STAIR_END_Z - 1.0);
stairsGroup.add(doorPlatform);
scene.add(stairsGroup);

// ===================== ENVIRONMENTAL DETAILS (z=15 to z=-20, approach to first torii) =====================
// Dense stone marker posts along both sides of the path
for (let z = 12; z > -22; z -= 3 + Math.random() * 2) {
    for (const side of [-1, 1]) {
        const postH = 0.5 + rng() * 0.6;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, postH, 8), matStoneLight);
        post.position.set(side * (2.5 + rng() * 0.8), postH / 2, z);
        scene.add(post);
    }
}
// Low stone wall segments along path edges
for (const [x, z, w] of [[-3.2, 2, 4], [3.2, -2, 3], [-3.5, -8, 3.5], [3.5, -13, 3], [-3.3, -17, 2.5]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, w), matStone);
    wall.position.set(x, 0.175, z); scene.add(wall);
}
// Stone cairns (stacked rock piles) near path
for (const [x, z] of [[-4, 0], [5, -5], [-5, -10], [6, -16], [-4, -19], [4, 3], [-6, 8], [5, 10]]) {
    const g = new THREE.Group();
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
        const s = 0.08 + rng() * 0.15;
        const rock = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), rng() > 0.5 ? matRock : matRockLight);
        rock.position.set((rng() - 0.5) * 0.08, s + i * 0.18, (rng() - 0.5) * 0.08);
        rock.scale.y = 0.5 + rng() * 0.3;
        rock.rotation.set(rng() * 0.2, rng() * Math.PI, rng() * 0.2);
        g.add(rock);
    }
    g.position.set(x, 0, z); scene.add(g);
}
// Stone benches / resting slabs
for (const [x, z, w] of [[-4, -3, 1.0], [4.5, -8, 0.9], [-5, -15, 1.1], [4, 7, 0.8]]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.45), matStoneLight);
    slab.position.set(x, 0.32, z); scene.add(slab);
    for (const lx of [-w / 2 + 0.12, w / 2 - 0.12]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.35), matStone);
        leg.position.set(x + lx, 0.16, z); scene.add(leg);
    }
}
// Mini torii markers beside the path
for (const [x, z, s] of [[-4, -1, 0.3], [5, -11, 0.25], [-5, -18, 0.28]]) {
    const mg = new THREE.Group();
    const mpillar = new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 1.2 * s, 6);
    const mL = new THREE.Mesh(mpillar, matVermilion); mL.position.set(-0.3 * s, 0.6 * s, 0); mg.add(mL);
    const mR = new THREE.Mesh(mpillar, matVermilion); mR.position.set(0.3 * s, 0.6 * s, 0); mg.add(mR);
    const mBeam = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.06 * s, 0.12 * s), matVermilion);
    mBeam.position.set(0, 1.2 * s, 0); mg.add(mBeam);
    const mTop = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.04 * s, 0.16 * s), matVermilionDark);
    mTop.position.set(0, 1.28 * s, 0); mg.add(mTop);
    mg.position.set(x, 0, z); scene.add(mg);
}
// Water basin (tsukubai)
const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.4, 0.4, 12), matStoneLight);
basin.position.set(3.5, 0.2, -4); scene.add(basin);
const basinWater = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.6 }));
basinWater.rotation.x = -Math.PI / 2; basinWater.position.set(3.5, 0.41, -4); scene.add(basinWater);
const basinPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 8), matStone);
basinPedestal.position.set(3.5, 0.15, -4); scene.add(basinPedestal);
// Second water basin
const basin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.35, 12), matStoneLight);
basin2.position.set(-3.8, 0.18, -9); scene.add(basin2);
const basin2Water = new THREE.Mesh(new THREE.CircleGeometry(0.33, 12), new THREE.MeshBasicMaterial({ color: 0x1a2a3a, transparent: true, opacity: 0.6 }));
basin2Water.rotation.x = -Math.PI / 2; basin2Water.position.set(-3.8, 0.36, -9); scene.add(basin2Water);
// Raked gravel zen garden patches
for (const [x, z, w, d] of [[-2.5, 2, 3, 4], [2.5, -5, 2.5, 3.5], [-3, -12, 2, 3], [2, -17, 2.5, 2.5]]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.015, d), matStonePath.clone());
    patch.material.color.set(0x141820);
    patch.position.set(x, 0.008, z); scene.add(patch);
    // rake lines
    for (let lz = -d / 2 + 0.3; lz < d / 2; lz += 0.4) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.005, 0.03), matStonePath.clone());
        line.material.color.set(0x0f1216);
        line.position.set(x, 0.02, z + lz); scene.add(line);
    }
}
// Wooden signpost near start
const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6), matWood);
signPost.position.set(4, 0.6, 8); scene.add(signPost);
const signBoard = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.04), matWood);
signBoard.position.set(4, 1.0, 8); scene.add(signBoard);
// Jizo statue (small stone figure) near path
for (const [x, z] of [[-4.5, -6], [5, -14]]) {
    const jizoG = new THREE.Group();
    const jizoBody = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 8), matStoneLight);
    jizoBody.position.set(0, 0.2, 0); jizoG.add(jizoBody);
    const jizoHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), matStoneLight);
    jizoHead.position.set(0, 0.48, 0); jizoG.add(jizoHead);
    jizoG.position.set(x, 0, z); scene.add(jizoG);
}
// Scattered mossy boulders near path edges
for (const [x, z, s] of [[-5, 4, 0.5], [6, 1, 0.4], [-6, -6, 0.6], [7, -10, 0.35], [-7, -16, 0.45], [8, -19, 0.3]]) {
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), matRock);
    boulder.position.set(x, s * 0.4, z);
    boulder.scale.y = 0.5 + rng() * 0.3;
    boulder.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3);
    scene.add(boulder);
}
// Small stone lanterns (decorative, not lit) along path
for (const [x, z] of [[-4, 5], [4, -7], [-4.5, -14], [5, -19]]) {
    const sg = new THREE.Group();
    const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.15, 6), matStone);
    sBase.position.y = 0.075; sg.add(sBase);
    const sShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 6), matStoneLight);
    sShaft.position.y = 0.4; sg.add(sShaft);
    const sTop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), matStone);
    sTop.position.y = 0.69; sg.add(sTop);
    const sCap = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 4), matStone);
    sCap.rotation.y = Math.PI / 4; sCap.position.y = 0.8; sg.add(sCap);
    sg.position.set(x, 0, z); scene.add(sg);
}



// ===================== ENVIRONMENTAL DETAILS (between torii, z=-20 to z=-42) =====================
// Dense cairns and rock clusters
for (const [x, z] of [[-5, -24], [6, -28], [-4, -32], [7, -36], [-6, -39], [5, -22], [-7, -30], [8, -34]]) {
    const g = new THREE.Group();
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
        const s = 0.1 + rng() * 0.2;
        const rock = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), rng() > 0.5 ? matRock : matRockLight);
        rock.position.set((rng() - 0.5) * 0.1, s + i * 0.2, (rng() - 0.5) * 0.1);
        rock.scale.y = 0.5 + rng() * 0.3; rock.rotation.set(rng() * 0.2, rng() * Math.PI, rng() * 0.2);
        g.add(rock);
    }
    g.position.set(x, 0, z); scene.add(g);
}
// Stone marker posts between torii
for (let z = -22; z > -40; z -= 3) {
    for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), matStoneLight);
        post.position.set(side * 2.8, 0.3, z); scene.add(post);
    }
}
// Low stone borders
for (const [x, z, w] of [[-3, -23, 2.5], [3.2, -30, 3], [-3.5, -37, 2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, w), matStone);
    wall.position.set(x, 0.15, z); scene.add(wall);
}
// Scattered mossy boulders
for (const [x, z, s] of [[-6, -25, 0.5], [7, -32, 0.4], [-8, -38, 0.6], [8, -27, 0.35]]) {
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), matRock);
    boulder.position.set(x, s * 0.4, z); boulder.scale.y = 0.5 + rng() * 0.3;
    boulder.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3); scene.add(boulder);
}
// Offerings table near second torii
const offTable = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.5), matWood);
offTable.position.set(-3.5, 0.65, -40); scene.add(offTable);
const offTableLeg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6), matWood);
offTableLeg1.position.set(-3.9, 0.325, -40); scene.add(offTableLeg1);
const offTableLeg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6), matWood);
offTableLeg2.position.set(-3.1, 0.325, -40); scene.add(offTableLeg2);

// ===================== TORII (2 gates, before stairs) =====================
function buildTorii(z, scale) {
    const lac = surface(libTex("lacquer", () => texLacquer()), [2, 2],
        { color: 0xb84430, roughness: .92, metalness: .05, normal: .75 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0x7a5d2a, roughness: .50, metalness: .60 });
    const g = new THREE.Group();
    const BASE = 0.0, H = 5.2, SPAN = 2.1;
    // Columns with gold foot and collar
    [-1, 1].forEach(s => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.26 * scale, H * scale, 20), lac);
        col.position.set(s * SPAN * scale, (BASE + H / 2) * scale, 0);
        col.castShadow = true; g.add(col);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.30 * scale, 0.34 * scale, 0.35 * scale, 20), goldMat);
        foot.position.set(s * SPAN * scale, (BASE + 0.17) * scale, 0);
        foot.castShadow = true; g.add(foot);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.24 * scale, 0.18 * scale, 20), goldMat);
        collar.position.set(s * SPAN * scale, (BASE + H - 1.0) * scale, 0); g.add(collar);
        // Ornate bracket at beam-column intersection
        const br = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.20 * scale, 0.58 * scale), goldMat);
        br.position.set(s * SPAN * scale, (BASE + H - 0.50) * scale, 0); g.add(br);
        const br2 = new THREE.Mesh(new THREE.BoxGeometry(0.40 * scale, 0.35 * scale, 0.40 * scale), goldMat);
        br2.position.set(s * SPAN * scale, (BASE + H - 0.24) * scale, 0); g.add(br2);
    });
    // nuki — straight beam piercing the columns
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(6.4 * scale, 0.35 * scale, 0.30 * scale), lac);
    nuki.position.set(0, (BASE + H - 1.45) * scale, 0);
    nuki.castShadow = true; g.add(nuki);
    // gakuzuka — central strut
    const gak = new THREE.Mesh(new THREE.BoxGeometry(0.30 * scale, 0.80 * scale, 0.28 * scale), lac);
    gak.position.set(0, (BASE + H + 0.07) * scale, 0); g.add(gak);
    const gakG = new THREE.Mesh(new THREE.BoxGeometry(0.40 * scale, 0.12 * scale, 0.34 * scale), goldMat);
    gakG.position.set(0, (BASE + H + 0.47) * scale, 0); g.add(gakG);
    // shimaki — swept beam (upward-curving ends)
    function beamPath(half, rise, power) {
        const p = [];
        for (let i = 0; i <= 26; i++) {
            const u = i / 26 * 2 - 1;
            p.push(new THREE.Vector3(u * half, Math.pow(Math.abs(u), power) * rise, 0));
        }
        return p;
    }
    const shimaki = new THREE.Mesh(sweepPoly(beamPath(3.35 * scale, 0.28 * scale, 2.6),
        [[-.20, -.13], [.20, -.13], [.22, .04], [.19, .14], [-.19, .14], [-.22, .04]]), lac);
    shimaki.position.set(0, (BASE + H - 0.35) * scale, 0);
    shimaki.castShadow = true; g.add(shimaki);
    // kasagi — top swept beam (wider, more rise)
    const kasagi = new THREE.Mesh(sweepPoly(beamPath(3.90 * scale, 0.42 * scale, 2.4),
        [[-.28, -.16], [.28, -.16], [.31, .03], [.20, .19], [-.20, .19], [-.31, .03]]), lac);
    kasagi.position.set(0, (BASE + H + 0.65) * scale, 0);
    kasagi.castShadow = true; g.add(kasagi);
    // Black lacquer cap on top of kasagi
    const cap = new THREE.Mesh(sweepPoly(beamPath(3.96 * scale, 0.42 * scale, 2.4),
        [[-.32, .15], [.32, .15], [.32, .23], [-.32, .23]]),
        new THREE.MeshStandardMaterial({ color: 0x120c0c, roughness: .42, metalness: .14 }));
    cap.position.set(0, (BASE + H + 0.65) * scale, 0); g.add(cap);
    g.position.set(0, 0, z);
    scene.add(g); return g;
}
function texLacquer() {
    const W = 512, H = 512;
    const c = cvs(W, H), x = c.getContext("2d");
    const h = cvs(W, H), hx = h.getContext("2d");
    const rnd = mulberry32(5);
    // wood base
    x.fillStyle = "#1a1410"; x.fillRect(0, 0, W, H);
    hx.fillStyle = "#808080"; hx.fillRect(0, 0, W, H);
    // vermilion coat
    x.globalAlpha = .80; x.fillStyle = "#7c1610"; x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
    // uneven pigment
    x.globalCompositeOperation = "overlay"; x.globalAlpha = .5;
    x.drawImage(fbmCanvas(W, H, 313, 5, 3, 1), 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    // craquelure
    for (let i = 0; i < 190; i++) {
        let px = rnd() * W, py = rnd() * H, a = rnd() * TAU;
        x.strokeStyle = "rgba(24,8,6," + (.28 + rnd() * .4) + ")";
        hx.strokeStyle = "rgba(0,0,0,.42)";
        x.lineWidth = hx.lineWidth = .5 + rnd() * .7;
        x.beginPath(); hx.beginPath(); x.moveTo(px, py); hx.moveTo(px, py);
        for (let k = 0; k < 5 + rnd() * 9; k++) {
            a += (rnd() - .5) * 1.5; px += Math.cos(a) * (5 + rnd() * 9); py += Math.sin(a) * (5 + rnd() * 9);
            x.lineTo(px, py); hx.lineTo(px, py);
        }
        x.stroke(); hx.stroke();
    }
    // rain streaks
    for (let i = 0; i < 120; i++) {
        const sx = rnd() * W, w = .6 + rnd() * 2.6, top = rnd() * H, len = H * (.2 + rnd() * .6);
        const g = x.createLinearGradient(0, top, 0, top + len);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(.3, rnd() > .5 ? "rgba(12,4,4,.24)" : "rgba(210,150,120,.05)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = g; x.fillRect(sx, top, w, len);
    }
    return { map: c, normal: normalFromHeight(h, 2.2) };
}
const _texLib = {};
function libTex(k, f) { return _texLib[k] || (_texLib[k] = f()); }
buildTorii(-20, 1.0);
buildTorii(-42, 0.9);


// ===================== SHRINES =====================
function buildShrine(x, z) {
    const g = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8);
    const pL = new THREE.Mesh(pillarGeo, matVermilion);
    const pR = new THREE.Mesh(pillarGeo, matVermilion);
    pL.position.set(-0.6, 0.8, 0); pR.position.set(0.6, 0.8, 0); g.add(pL, pR);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.22), matVermilion);
    beam.position.set(0, 1.65, 0); g.add(beam);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.08, 0.28), matVermilionDark);
    shimaki.position.set(0, 1.76, 0); g.add(shimaki);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), matWood);
    box.position.set(0, 0.25, -0.6); g.add(box);
    const roofMini = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.28, 4), matRoof);
    roofMini.rotation.y = Math.PI / 4; roofMini.position.set(0, 0.64, -0.6); g.add(roofMini);
    g.position.set(x, 0, z); scene.add(g); return g;
}
buildShrine(-10, -30);
buildShrine(14, -55);
buildShrine(-16, -100);

// ===================== LANTERNS =====================
function buildLantern(x, z, scale) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.34 * scale, 0.3 * scale, 8), matStoneLight);
    base.position.y = 0.15 * scale;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.14 * scale, 1.1 * scale, 8), matStoneLight);
    shaft.position.y = 0.85 * scale;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.46 * scale, 0.4 * scale, 0.46 * scale), matWindow.clone());
    box.material.color.set(0xffb066); box.position.y = 1.55 * scale;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42 * scale, 0.32 * scale, 4), matRoof);
    roof.rotation.y = Math.PI / 4; roof.position.y = 1.95 * scale;
    const flame = new THREE.PointLight(0xff8a3d, 1.2, 5, 2); flame.position.y = 1.55 * scale;
    g.add(base, shaft, box, roof, flame);
    g.position.set(x, 0, z); scene.add(g);
}
for (let z = -12; z > -60; z -= 7) {
    const s = lerp(1.0, 0.8, Math.abs(z + 12) / 48);
    buildLantern(-3.0 - Math.random() * 0.3, z, s);
    buildLantern(3.0 + Math.random() * 0.3, z, s);
}

// ===================== TEMPLE =====================
// Positioned at y=6 (matches landing height), z=-172, scale 2x
// Podium bottom world = 6 + 2*0 = 6, matches landing y=6
// Door center world = 6 + 2*2.3 = 10.6, z = -172 + 2*4.3 = -163.4
const TEMPLE_Y = STAIR_TOP_Y - 2.6;  // door bottom = TEMPLE_Y + 2.6 = STAIR_TOP_Y
const TEMPLE_Z = -172;
const templeGroup = new THREE.Group();
templeGroup.position.set(0, TEMPLE_Y, TEMPLE_Z);
templeGroup.scale.set(2, 2, 2);

function buildTemple(g) {
    const podium = new THREE.Mesh(new THREE.BoxGeometry(32, 0.8, 10), matStoneLight);
    podium.position.y = 0.4; g.add(podium);
    const podium2 = new THREE.Mesh(new THREE.BoxGeometry(31, 0.49, 9), matStone);
    podium2.position.y = 1.0; g.add(podium2);
    const veranda = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.15, 8.0), matWood);
    veranda.position.y = 1.22; g.add(veranda);
    const verandaEdge = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.06, 8.1), matRoofEdge);
    verandaEdge.position.y = 1.30; g.add(verandaEdge);
    const bodyW = 7.4, bodyH = 3.8, bodyD = 6.2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), matWood);
    body.position.y = 1.3 + bodyH / 2; g.add(body);
    const rearBody = new THREE.Mesh(new THREE.BoxGeometry(bodyW, 3.0, 3.2), matWood);
    rearBody.position.set(0, 1.3 + 1.5, -4.7); g.add(rearBody);
    const rearRoof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 3.8), matRoof);
    rearRoof.position.set(0, 1.3 + 3.0 + 0.12, -4.7); g.add(rearRoof);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.22, bodyH, bodyD), matWood);
    sideL.position.set(-bodyW / 2 - 0.11, 1.3 + bodyH / 2, 0); g.add(sideL);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.22, bodyH, bodyD), matWood);
    sideR.position.set(bodyW / 2 + 0.11, 1.3 + bodyH / 2, 0); g.add(sideR);
    const colCount = 8, colSpan = 6.8;
    for (let i = 0; i < colCount; i++) {
        if (i === 3 || i === 4) continue;
        const t = i / (colCount - 1);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, bodyH, 10), matVermilion);
        col.position.set(-colSpan / 2 + colSpan * t, 1.3 + bodyH / 2, bodyD / 2 + 0.18);
        g.add(col);
    }
    const nukiBeam = new THREE.Mesh(new THREE.BoxGeometry(colSpan + 0.4, 0.18, 0.25), matVermilionDark);
    nukiBeam.position.set(0, 1.3 + bodyH * 0.72, bodyD / 2 + 0.25); g.add(nukiBeam);
    const bracketGeo = new THREE.BoxGeometry(0.25, 0.12, 0.3);
    for (let i = 0; i < colCount; i++) {
        if (i === 3 || i === 4) continue;
        const xPos = -colSpan / 2 + colSpan * (i / (colCount - 1));
        for (let layer = 0; layer < 3; layer++) {
            const bracket = new THREE.Mesh(bracketGeo, matWood);
            bracket.position.set(xPos, 1.3 + bodyH + 0.06 + layer * 0.1, bodyD / 2 + 0.12 + layer * 0.08);
            bracket.scale.x = 0.8 + layer * 0.3; bracket.scale.z = 0.6 + layer * 0.2; g.add(bracket);
        }
    }
    const winGeo = new THREE.PlaneGeometry(0.52, 1.2);
    for (let i = 0; i < 9; i++) {
        if (i === 3 || i === 4 || i === 5) continue;
        const win = new THREE.Mesh(winGeo, matWindow);
        win.position.set(-2.9 + (5.8 / 8) * i, 1.3 + bodyH * 0.5, bodyD / 2 + 0.19); g.add(win);
    }
    // Door entrance â€” pushed forward from face
    const doorW = 0.6, doorH = 2.0, doorD = 0.12;
    const doorZ = bodyD / 2 + 1.2;
    const doorLY = 1.3 + doorH / 2;
    const interiorMat = new THREE.MeshBasicMaterial({ color: 0xf5f0e8, fog: false });
    const interior = new THREE.Mesh(new THREE.PlaneGeometry(doorW * 2 + 0.2, doorH - 0.1), interiorMat);
    interior.position.set(0, doorLY, bodyD / 2 + 0.25); g.add(interior);
    const dFL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.2, 0.18), matWood);
    dFL.position.set(-doorW - 0.05, doorLY, doorZ); g.add(dFL);
    const dFR = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.2, 0.18), matWood);
    dFR.position.set(doorW + 0.05, doorLY, doorZ); g.add(dFR);
    const dLintel = new THREE.Mesh(new THREE.BoxGeometry(doorW * 2 + 0.3, 0.12, 0.2), matWood);
    dLintel.position.set(0, 1.3 + doorH + 0.1, doorZ); g.add(dLintel);
    const doorPivotL = new THREE.Group();
    doorPivotL.position.set(-doorW - 0.05, doorLY, doorZ); g.add(doorPivotL);
    const doorL = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorD), matWoodDoor);
    doorL.position.set(doorW / 2 + 0.04, 0, 0); doorPivotL.add(doorL);
    const doorPivotR = new THREE.Group();
    doorPivotR.position.set(doorW + 0.05, doorLY, doorZ); g.add(doorPivotR);
    const doorR = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, doorD), matWoodDoor);
    doorR.position.set(-doorW / 2 - 0.04, 0, 0); doorPivotR.add(doorR);
    const ringGeo = new THREE.TorusGeometry(0.07, 0.015, 8, 16);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.35, metalness: 0.7 });
    const ringL = new THREE.Mesh(ringGeo, ringMat);
    ringL.position.set(0, doorH * 0.45 - doorH / 2, doorD / 2 + 0.08); doorL.add(ringL);
    const ringR = new THREE.Mesh(ringGeo, ringMat);
    ringR.position.set(0, doorH * 0.45 - doorH / 2, doorD / 2 + 0.08); doorR.add(ringR);
    const doorLight = new THREE.PointLight(0xffb066, 1.4, 6, 2);
    doorLight.position.set(0, doorLY, bodyD / 2 + 0.5); g.add(doorLight);
    templeDoorPivotL = doorPivotL;
    templeDoorPivotR = doorPivotR;
    templeDoorLight = doorLight;
    // ===================== UPGRADED TEMPLE TOP (two-storey with swept roofs) =====================
    const timber = surface({ map: fbmCanvas(512, 512, 29, 5, 3, 1), normal: normalFromHeight(fbmCanvas(512, 512, 30, 4, 6, 1), 2.0) },
        [4, 1.6], { color: 0x565150, normal: 1.5 });
    const postMat = surface({ map: fbmCanvas(512, 512, 31, 4, 4, 1), normal: normalFromHeight(fbmCanvas(512, 512, 32, 3, 8, 1), 1.5) },
        [1.1, 1.0], { color: 0x8a746d, normal: 1.05, metalness: .03 });
    const roofMat = surface({ map: fbmCanvas(512, 512, 33, 5, 3, 1), normal: normalFromHeight(fbmCanvas(512, 512, 34, 4, 6, 1), 2.2) },
        [1, 1], { color: 0x2b343a, roughness: .74, metalness: .10, normal: 1.4 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0x8f6f2e, roughness: .38, metalness: .78 });
    const paperMat = new THREE.MeshBasicMaterial({ color: 0xf5d0a0, fog: true, toneMapped: false });
    const gridMat = new THREE.MeshBasicMaterial({
        map: (function () {
            const W = 1024, H = 768, c = cvs(W, H), x2 = c.getContext('2d');
            x2.clearRect(0, 0, W, H);
            x2.fillStyle = 'rgba(228,222,206,.055)'; x2.fillRect(0, 0, W, H);
            x2.strokeStyle = 'rgba(10,8,7,.88)';
            const cols = 12, rows = 9;
            x2.lineWidth = 5;
            for (let i = 1; i < cols; i++) { x2.beginPath(); x2.moveTo(W / cols * i, 0); x2.lineTo(W / cols * i, H); x2.stroke(); }
            for (let j = 1; j < rows; j++) { x2.beginPath(); x2.moveTo(0, H / rows * j); x2.lineTo(W, H / rows * j); x2.stroke(); }
            x2.lineWidth = 13; x2.strokeStyle = 'rgba(8,6,5,.95)';
            x2.strokeRect(0, 0, W, H);
            x2.beginPath(); x2.moveTo(W / 2, 0); x2.lineTo(W / 2, H); x2.stroke();
            return tx(c);
        })(),
        transparent: true, depthWrite: false, fog: true
    });
    function bay(w, h, x2, y, z) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paperMat);
        p.position.set(x2, y, z); g.add(p);
        const s2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gridMat);
        s2.position.set(x2, y, z + .06); s2.renderOrder = 3; g.add(s2);
    }
    function brackets(halfW, halfD, y, step) {
        const parts = [];
        for (let x2 = -halfW; x2 <= halfW + 1e-3; x2 += step) {
            [-halfD, halfD].forEach(dz => {
                parts.push(new THREE.BoxGeometry(.34, .46, .34).translate(x2, y, TEMPLE_Z_LOCAL + dz));
                parts.push(new THREE.BoxGeometry(.92, .17, .24).translate(x2, y + .30, TEMPLE_Z_LOCAL + dz));
            });
        }
        for (let dz = -halfD + step; dz < halfD - 1e-3; dz += step) {
            [-halfW, halfW].forEach(x2 => {
                parts.push(new THREE.BoxGeometry(.34, .46, .34).translate(x2, y, TEMPLE_Z_LOCAL + dz));
                parts.push(new THREE.BoxGeometry(.24, .17, .92).translate(x2, y + .30, TEMPLE_Z_LOCAL + dz));
            });
        }
        const m = new THREE.Mesh(mergeGeos(parts), postMat);
        g.add(m);
    }
    const TEMPLE_Z_LOCAL = 0;
    const F = 1.3;
    // --- Upper storey ---
    const up = new THREE.Mesh(new THREE.BoxGeometry(10.0, 3.4, 6.0), timber);
    up.position.set(0, F + 5.2, TEMPLE_Z_LOCAL); g.add(up);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12.4, .26, 8.4), postMat);
    deck.position.set(0, F + 3.52, TEMPLE_Z_LOCAL); g.add(deck);
    [.10, .94].forEach(dy2 => [4.2, -4.2].forEach(dz => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(12.4, .17, .17), postMat);
        r.position.set(0, F + 3.65 + dy2, TEMPLE_Z_LOCAL + dz); g.add(r);
    }));
    for (let i = 0; i <= 16; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(.10, 1.05, .10), postMat);
        b.position.set(-6.2 + i * .775, F + 4.22, TEMPLE_Z_LOCAL + 4.2); g.add(b);
    }
    for (let i = 0; i < 4; i++)
        bay(1.0, 1.35, -4.5 + i * 3.0, F + 5.3, TEMPLE_Z_LOCAL + 3.06);
    // gold plaque
    const plq = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.30, .16), goldMat);
    plq.position.set(0, F + 5.5, TEMPLE_Z_LOCAL + 3.12); g.add(plq);
    const plqIn = new THREE.Mesh(new THREE.BoxGeometry(1.52, .98, .18), timber);
    plqIn.position.set(0, F + 5.5, TEMPLE_Z_LOCAL + 3.16); g.add(plqIn);
    brackets(5.2, 3.3, F + 7.0, 1.30);
    // --- Main swept roof ---
    const upper = new THREE.Mesh(roofGeo(10.8, 7.2, 3.6, 5.2, .48, .26), roofMat);
    upper.position.set(0, F + 7.5, TEMPLE_Z_LOCAL); g.add(upper);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(7.6, .60, 1.05), roofMat);
    ridge.position.set(0, F + 12.9, TEMPLE_Z_LOCAL); g.add(ridge);
    [-1, 1].forEach(s2 => {
        const oni = new THREE.Mesh(new THREE.ConeGeometry(.46, 1.15, 4), roofMat);
        oni.position.set(s2 * 3.9, F + 13.4, TEMPLE_Z_LOCAL); oni.rotation.y = Math.PI / 4; g.add(oni);
    });
    // --- Lower pent roof over ground storey ---
    const lower = new THREE.Mesh(roofGeo(9.6, 6.4, 3.2, 2.9, .40, .26), roofMat);
    lower.position.set(0, F + 3.6, TEMPLE_Z_LOCAL); g.add(lower);
    brackets(7.0, 4.4, F + 3.2, 1.40);
    // --- Flanking wings with pillars ---
    [-1, 1].forEach(s2 => {
        const wcx = s2 * 10.6;
        const w = new THREE.Mesh(new THREE.BoxGeometry(7.6, 3.4, 5.2), timber);
        w.position.set(wcx, F + 1.7, TEMPLE_Z_LOCAL + 1.4); g.add(w);
        // Windows (positioned between pillars)
        for (let i = 0; i < 3; i++)
            bay(1.3, 1.6, wcx + (i - 1) * 2.4, F + 1.8, TEMPLE_Z_LOCAL + 4.06);
        // Pillars on front face of wing (avoid window positions at -2.4, 0, +2.4)
        const wingPillarXs = [-3.4, -1.2, 1.2, 3.4];
        wingPillarXs.forEach(xp => {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, 4.2, 10), postMat);
            p.position.set(wcx + xp, F + 1.3, TEMPLE_Z_LOCAL + 4.15); g.add(p);
        });
        // Pillars on side faces
        [-1, 1].forEach(sz => {
            const sp = new THREE.Mesh(new THREE.CylinderGeometry(.10, .13, 4.2, 8), postMat);
            sp.position.set(wcx + sz * 3.6, F + 1.3, TEMPLE_Z_LOCAL + 1.4); g.add(sp);
        });
        const r = new THREE.Mesh(roofGeo(5.0, 4.0, 1.4, 1.9, .32, .26), roofMat);
        r.position.set(wcx, F + 3.4, TEMPLE_Z_LOCAL + 1.4); g.add(r);
    });
    // --- Gap pillars between main building and wings ---
    [-1, 1].forEach(s2 => {
        const gapX = s2 * 5.5;
        for (let i = 0; i < 2; i++) {
            const gz = TEMPLE_Z_LOCAL + 1.5 + i * 2.2;
            const gp = new THREE.Mesh(new THREE.CylinderGeometry(.10, .13, 4.6, 8), postMat);
            gp.position.set(gapX, F + 1.5, gz); g.add(gp);
        }
    });
    // --- Extra red pillars on outer sides of wings ---
    [-1, 1].forEach(s2 => {
        const outerX = s2 * 6.8;
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe0231c, roughness: 0.55, emissive: 0x330705, emissiveIntensity: 0.5 });
        for (let i = 0; i < 3; i++) {
            const pz = TEMPLE_Z_LOCAL + -1.65 + i * 2.5;
            const rp = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 4.2, 10), pillarMat);
            rp.position.set(outerX, F + 1.3, pz); g.add(rp);
        }
        // Fence rails between the red pillars
        const railMat = new THREE.MeshStandardMaterial({ color: 0x8f1712, roughness: 0.7 });
        for (let i = 0; i < 2; i++) {
            const rz1 = TEMPLE_Z_LOCAL + -8.0 + i * 2.5;
            const rz2 = TEMPLE_Z_LOCAL + 5.0 + (i + 1) * 2.5;
            // Top rail
            const railTop = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 2.5), railMat);
            railTop.position.set(outerX, F + 2.8, (rz1 + rz2) / 2); g.add(railTop);
            // Mid rail
            const railMid = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 2.5), railMat);
            railMid.position.set(outerX, F + 2.0, (rz1 + rz2) / 2); g.add(railMid);
            // Bottom rail
            const railBot = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 2.5), railMat);
            railBot.position.set(outerX, F + 1.2, (rz1 + rz2) / 2); g.add(railBot);
        }
    });
    // Hall glow spill
    const spillTex = tx(texGlow('rgba(255,150,66,.80)', 'rgba(240,96,26,.24)'));
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(30, 16),
        new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .30 }));
    spill.position.set(0, F + 3.0, TEMPLE_Z_LOCAL + 5.6); spill.renderOrder = 2; g.add(spill);
}
buildTemple(templeGroup);
scene.add(templeGroup);
// Ground fill below temple podium (connects stairs to temple base)
const templeGround = new THREE.Mesh(
    new THREE.BoxGeometry(18, 2.5, 14),
    matStone
);
templeGround.position.set(0, TEMPLE_Y + 0.8, TEMPLE_Z + 2);
scene.add(templeGround);
// Side walls to fill gaps
const templeFillL = new THREE.Mesh(
    new THREE.BoxGeometry(44, 6, 16),
    matStone
);
templeFillL.position.set(-9, TEMPLE_Y - 1.5, TEMPLE_Z + 1);
scene.add(templeFillL);
const templeFillR = new THREE.Mesh(
    new THREE.BoxGeometry(44, 6, 16),
    matStone
);
templeFillR.position.set(9, TEMPLE_Y - 1.5, TEMPLE_Z + 1);
scene.add(templeFillR);


// ===================== DRIFTING HAZE SLABS =====================
const hazeTex = tx(texGlow("rgba(160,205,210,.55)", "rgba(110,165,175,.18)"));
const hazePlanes = [];
const hazeRnd = mulberry32(66);
for (let i = 0; i < 6; i++) {
    const s = 12 + hazeRnd() * 15;
    const h = new THREE.Mesh(new THREE.PlaneGeometry(s, s * .55),
        new THREE.MeshBasicMaterial({
            map: hazeTex, transparent: true, blending: THREE.AdditiveBlending,
            depthWrite: false, fog: false, opacity: .05 + hazeRnd() * .07
        }));
    h.position.set((hazeRnd() - .5) * 44, 1.5 + hazeRnd() * 10, -38 + hazeRnd() * 40);
    h.renderOrder = 4;
    h.userData = { sp: .06 + hazeRnd() * .12, ph: hazeRnd() * TAU, x0: h.position.x };
    scene.add(h); hazePlanes.push(h);
}

// ===================== EMBER PARTICLES =====================
const EMBER_N = 460;
const emberPos = new Float32Array(EMBER_N * 3), emberSeed = new Float32Array(EMBER_N);
const emberRnd = mulberry32(67);
for (let i = 0; i < EMBER_N; i++) {
    emberPos[i * 3] = (emberRnd() - .5) * 30;
    emberPos[i * 3 + 1] = emberRnd() * 11;
    emberPos[i * 3 + 2] = -26 + emberRnd() * 36;
    emberSeed[i] = emberRnd();
}
const emberGeo = new THREE.BufferGeometry();
emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
emberGeo.setAttribute("aSeed", new THREE.BufferAttribute(emberSeed, 1));
const emberMat = new THREE.ShaderMaterial({
    uniforms: {
        uT: { value: 0 },
        uTex: { value: tx(texGlow("rgba(255,190,140,1)", "rgba(255,120,60,.35)")) },
        uSize: { value: window.innerHeight * .5 }
    },
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: [
        "attribute float aSeed; uniform float uT; uniform float uSize; varying float vA;",
        "void main(){ vec3 p=position;",
        " p.y = mod(p.y + uT*(0.14+aSeed*0.28), 11.5);",
        " p.x += sin(uT*0.36 + aSeed*22.0)*0.85;",
        " p.z += cos(uT*0.29 + aSeed*17.0)*0.7;",
        " vec4 mv = modelViewMatrix * vec4(p,1.0);",
        " vA = (0.25+aSeed*0.75) * smoothstep(11.5,7.0,p.y) * smoothstep(0.0,1.4,p.y);",
        " gl_PointSize = uSize*(0.010+aSeed*0.020)/max(-mv.z,0.6);",
        " gl_Position = projectionMatrix * mv; }"
    ].join("\n"),
    fragmentShader: [
        "uniform sampler2D uTex; varying float vA;",
        "void main(){ vec4 t=texture2D(uTex, gl_PointCoord);",
        " gl_FragColor = vec4(t.rgb*vec3(1.6,0.78,0.42), t.a*vA*0.75); }"
    ].join("\n")
});
const embers = new THREE.Points(emberGeo, emberMat);
embers.frustumCulled = false; embers.renderOrder = 5;
scene.add(embers);

// ===================== CURSOR WISP PARTICLES =====================
const WISP_N = 190;
const wispGeo = new THREE.BufferGeometry();
wispGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(WISP_N * 3), 3));
wispGeo.setAttribute("aA", new THREE.BufferAttribute(new Float32Array(WISP_N), 1));
wispGeo.setAttribute("aS", new THREE.BufferAttribute(new Float32Array(WISP_N), 1));
const wispData = { list: [], i: 0, acc: 0, ex: 0, ey: 0, lx: 0, ly: 0 };
for (let i = 0; i < WISP_N; i++) wispData.list.push({ x: 0, y: 0, z: 0, a: 0, s: .01 + Math.random() * .03 });
const wispTex = tx((function () {
    const S = 128, c = cvs(S, S), x = c.getContext("2d");
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(.07, "rgba(236,250,250,.92)");
    g.addColorStop(.3, "rgba(180,220,230,.25)");
    g.addColorStop(.7, "rgba(120,180,200,.06)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, S, S); return c;
})());
const wispMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: wispTex }, uPx: { value: window.innerHeight } },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, fog: false,
    vertexShader: [
        "attribute float aA; attribute float aS;",
        "uniform float uPx; varying float vA;",
        "void main(){ vA = aA;",
        " vec4 mv = modelViewMatrix * vec4(position,1.0);",
        " gl_PointSize = uPx * aS / max(-mv.z, 0.4);",
        " gl_Position = projectionMatrix * mv; }"
    ].join("\n"),
    fragmentShader: [
        "uniform sampler2D uTex; varying float vA;",
        "void main(){ if (vA <= 0.0) discard;",
        " vec4 t = texture2D(uTex, gl_PointCoord);",
        " gl_FragColor = vec4(t.rgb, t.a * vA); }"
    ].join("\n")
});
const wisps = new THREE.Points(wispGeo, wispMat);
wisps.frustumCulled = false; wisps.renderOrder = 8;
scene.add(wisps);
let wispCam = null;

// ===================== MORE PROCEDURAL BUSHES =====================
const bushRnd = mulberry32(777);
for (let i = 0; i < 80; i++) {
    const bx = (bushRnd() - .5) * 18 + ((bushRnd() > .5 ? 1 : -1) * (4 + bushRnd() * 5));
    const bz = -8 - bushRnd() * 190;
    const bg = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(.28 + bushRnd() * .08, .15 + bushRnd() * .1, .04 + bushRnd() * .03),
        roughness: .95
    });
    for (let j = 0; j < 3 + Math.floor(bushRnd() * 4); j++) {
        const r = .15 + bushRnd() * .4;
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), bushMat);
        sphere.position.set((bushRnd() - .5) * r * 2, r * .6 + bushRnd() * r, (bushRnd() - .5) * r * 2);
        sphere.scale.y = .6 + bushRnd() * .3;
        bg.add(sphere);
    }
    bg.position.set(bx, 0, bz);
    bg.rotation.y = bushRnd() * TAU;
    scene.add(bg);
}


// ===================== PROCEDURAL MAPLE TREES (from templeNightRenderer) =====================
function buildMaple(seed, x, z, scale) {
    const rnd = mulberry32(seed);
    const parts = [], tips = [];
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    function seg(from, to, r0, r1) {
        dir.subVectors(to, from);
        const len = dir.length(); dir.normalize();
        const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true);
        Q.setFromUnitVectors(UP, dir);
        pos.addVectors(from, to).multiplyScalar(.5);
        M4.compose(pos, Q, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(M4);
        parts.push(geo);
    }
    function branch(from, dirV, len, rad, depth) {
        const to = from.clone().addScaledVector(dirV, len);
        to.y += len * .10;
        seg(from, to, rad, rad * .68);
        if (depth >= 4 || len < .34) { tips.push(to.clone()); return; }
        const n = depth < 2 ? 3 : 2;
        for (let i = 0; i < n; i++) {
            const d = dirV.clone();
            d.x += (rnd() - .5) * 1.25; d.z += (rnd() - .5) * 1.25; d.y += .30 + rnd() * .5;
            d.normalize();
            branch(to, d, len * (.62 + rnd() * .16), rad * .66, depth + 1);
        }
    }
    const root = new THREE.Vector3(0, 0, 0);
    seg(root, new THREE.Vector3(0, 1.5, 0), .22, .16);
    for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + rnd();
        branch(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(Math.cos(a) * .8, .8, Math.sin(a) * .8).normalize(), 1.45, .155, 0);
    }
    const trunk = new THREE.Mesh(mergeGeos(parts),
        new THREE.MeshStandardMaterial({ color: 0x171413, roughness: .94, metalness: .0 }));
    trunk.castShadow = true;
    const leafGeo = new THREE.PlaneGeometry(.36, .36);
    const leafMat = new THREE.MeshStandardMaterial({
        color: 0x2b0406, side: THREE.DoubleSide,
        roughness: .86, metalness: 0, emissive: 0x080000, emissiveIntensity: .12
    });
    const per = 9;
    const inst = new THREE.InstancedMesh(leafGeo, leafMat, tips.length * per);
    const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q2 = new THREE.Quaternion(), sc = new THREE.Vector3();
    let k = 0;
    tips.forEach(t => {
        for (let i = 0; i < per; i++) {
            const p = new THREE.Vector3(t.x + (rnd() - .5) * .95, t.y + (rnd() - .5) * .8, t.z + (rnd() - .5) * .95);
            e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
            q2.setFromEuler(e);
            const s = .7 + rnd() * .75; sc.set(s, s, s);
            m4.compose(p, q2, sc);
            inst.setMatrixAt(k++, m4);
        }
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    const g = new THREE.Group();
    g.add(trunk); g.add(inst);
    g.position.set(x, 0, z); g.scale.setScalar(scale || 1);
    g.rotation.y = rnd() * TAU;
    scene.add(g);
    return g;
}
// Place procedural maples along the path sides
const maplePositions = [
    [-6, -15, .8], [7, -12, .7], [-7, -25, .9], [8, -20, .75],
    [-6, -35, .85], [7, -32, .7], [-8, -45, .95], [9, -42, .8],
    [-7, -55, .8], [8, -52, .75], [-6, -65, .9], [7, -62, .7],
    [-8, -75, .85], [9, -72, .8], [-7, -85, .9], [8, -82, .75],
    [-6, -95, .8], [7, -92, .7], [-8, -105, .85], [9, -102, .8],
    [-7, -115, .9], [8, -112, .75], [-6, -125, .8], [7, -122, .7],
    [-8, -135, .85], [9, -132, .8], [-7, -145, .9], [8, -142, .75],
];
maplePositions.forEach(([x, z, s], i) => buildMaple(100 + i * 37, x, z, s));

// ===================== FALLING LEAVES (instanced quads) =====================
const LEAF_N = 260;
const leafMat2 = new THREE.MeshStandardMaterial({
    color: 0x40080a, side: THREE.DoubleSide,
    roughness: .84, metalness: 0,
    emissive: 0x780200, emissiveIntensity: .72
});
const leafInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(.40, .40), leafMat2, LEAF_N);
leafInst.frustumCulled = false; leafInst.renderOrder = 5;
const leafList = [];
const leafRnd = mulberry32(404);
for (let i = 0; i < LEAF_N; i++) leafList.push({
    x: (leafRnd() - .5) * 60, z: -20 - leafRnd() * 190, y: leafRnd() * 26,
    fall: .5 + leafRnd() * .9,
    sway: .45 + leafRnd() * 1.5, swayPh: leafRnd() * TAU, swayAmp: .30 + leafRnd() * .95,
    spin: (leafRnd() - .5) * 2.6, roll: leafRnd() * TAU, rollSp: .5 + leafRnd() * 2.0,
    tilt: leafRnd() * TAU, s: .55 + leafRnd() * .9
});
scene.add(leafInst);
const _LM = new THREE.Matrix4(), _LQ = new THREE.Quaternion(), _LE = new THREE.Euler(), _LP = new THREE.Vector3(), _LS = new THREE.Vector3();


// ===================== TREES (simple pines) =====================
function buildPine(x, z, h, r) {
    const g = new THREE.Group();
    const trunkH = h * 0.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.1, trunkH, 6), matPineTrunk);
    trunk.position.set(0, trunkH / 2, 0); g.add(trunk);
    const layers = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < layers; i++) {
        const t = i / (layers - 1);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(lerp(r, r * 0.3, t), h * (0.28 + 0.12 * (1 - t)), 8), matPine);
        cone.position.set(0, trunkH + i * h * 0.15 + h * 0.15, 0); g.add(cone);
    }
    g.position.set(x, 0, z); g.rotation.y = rng() * Math.PI * 2; scene.add(g);
}
function buildCedar(x, z, h, r) {
    const g = new THREE.Group();
    const trunkH = h * 0.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.05, r * 0.08, trunkH, 6), matPineTrunk);
    trunk.position.set(0, trunkH / 2, 0); g.add(trunk);
    const foliage1 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, h * 0.65, 8), matCedar);
    foliage1.position.set(0, trunkH + h * 0.3, 0); g.add(foliage1);
    const foliage2 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, h * 0.25, 8), matCedar);
    foliage2.position.set(0, trunkH + h * 0.6, 0); g.add(foliage2);
    g.position.set(x, 0, z); g.rotation.y = rng() * Math.PI * 2; scene.add(g);
}
function buildBroadleaf(x, z, h, r) {
    const g = new THREE.Group();
    const trunkH = h * 0.35;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.1, trunkH, 6), matPineTrunk);
    trunk.position.set(0, trunkH / 2, 0); g.add(trunk);
    for (let i = 0; i < 3 + Math.floor(rng() * 2); i++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(r * (0.5 + rng() * 0.4), 8, 6), matCherry);
        c.position.set((rng() - 0.5) * r * 0.6, trunkH + h * 0.2 + rng() * h * 0.3, (rng() - 0.5) * r * 0.6);
        c.scale.y = 0.7; g.add(c);
    }
    g.position.set(x, 0, z); g.rotation.y = rng() * Math.PI * 2; scene.add(g);
}
function buildBamboo(x, z, h) {
    const g = new THREE.Group();
    for (let i = 0; i < 4 + Math.floor(rng() * 4); i++) {
        const sH = h * (0.7 + rng() * 0.3);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, sH, 6), matBamboo);
        stem.position.set((rng() - 0.5) * 0.6, sH / 2, (rng() - 0.5) * 0.6); g.add(stem);
    }
    g.position.set(x, 0, z); scene.add(g);
}

function placeTrees(positions, hRange, rRange) {
    positions.forEach(([x, z]) => {
        const type = rng();
        const h = hRange[0] + rng() * (hRange[1] - hRange[0]);
        const r = rRange[0] + rng() * (rRange[1] - rRange[0]);
        if (type < 0.3) buildPine(x, z, h, r);
        else if (type < 0.5) buildCedar(x, z, h, r);
        else if (type < 0.7) buildBroadleaf(x, z, h, r);
        else buildBamboo(x, z, h);
    });
}
placeTrees([[-5.5, -16], [5.5, -14], [-5.5, -24], [5.5, -22], [-5.5, -32], [5.5, -30], [-5.5, -40], [5.5, -38], [-5.5, -48], [5.5, -46], [-5.5, -56], [5.5, -54], [-5.5, -64], [5.5, -62], [-5.5, -72], [5.5, -70], [-5.5, -80], [5.5, -78], [-5.5, -88], [5.5, -86], [-5.5, -96], [5.5, -94], [-5.5, -104], [5.5, -102], [-5.5, -112], [5.5, -110], [-5.5, -120], [5.5, -118], [-5.5, -128], [5.5, -126], [-5.5, -136], [5.5, -134], [-5.5, -144], [5.5, -142], [-5.5, -152], [5.5, -150]], [2.5, 4], [0.6, 1.0]);
placeTrees([[-9, -18], [10, -15], [-9, -25], [10, -22], [-9, -32], [10, -29], [-9, -39], [10, -36], [-9, -46], [10, -43], [-9, -53], [10, -50], [-9, -60], [10, -57], [-9, -67], [10, -64], [-9, -74], [10, -71], [-9, -81], [10, -78], [-9, -88], [10, -85], [-9, -95], [10, -92], [-9, -102], [10, -99], [-9, -109], [10, -106], [-9, -116], [10, -113], [-9, -123], [10, -120], [-9, -130], [10, -127], [-9, -137], [10, -134], [-9, -144], [10, -141], [-9, -151], [10, -148]], [3.5, 5.5], [0.8, 1.4]);
placeTrees([[-16, -15], [17, -10], [-16, -25], [17, -20], [-16, -35], [17, -30], [-16, -45], [17, -40], [-16, -55], [17, -50], [-16, -65], [17, -60], [-16, -75], [17, -70], [-16, -85], [17, -80], [-16, -95], [17, -90], [-16, -105], [17, -100], [-16, -115], [17, -110], [-16, -125], [17, -120], [-16, -135], [17, -130], [-16, -145], [17, -140], [-16, -155], [17, -150], [-22, -25], [23, -18], [-22, -40], [23, -33], [-22, -55], [23, -48], [-22, -70], [23, -63], [-22, -85], [23, -78], [-22, -100], [23, -93], [-22, -115], [23, -108], [-22, -130], [23, -123], [-22, -145], [23, -138]], [4.5, 7], [1.0, 1.8]);

// ===================== ROCKS =====================
function buildRockCluster(x, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
        const s = 0.15 + rng() * 0.35;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rng() > 0.5 ? matRock : matRockLight);
        rock.position.set((rng() - 0.5) * 1.2, s * 0.5, (rng() - 0.5) * 1.0);
        rock.rotation.set(rng() * 0.3, rng() * Math.PI, rng() * 0.3);
        rock.scale.y = 0.6 + rng() * 0.3; g.add(rock);
    }
    g.position.set(x, 0, z); scene.add(g);
}
[[-3.5, -18], [3.8, -15], [-3.5, -24], [3.8, -21], [-3.5, -30], [3.8, -27], [-3.5, -36], [3.8, -33], [-3.5, -42], [3.8, -39], [-3.5, -48], [3.8, -45], [-3.5, -54], [3.8, -51], [-3.5, -60], [3.8, -57], [-3.5, -66], [3.8, -63], [-3.5, -72], [3.8, -69], [-3.5, -78], [3.8, -75], [-3.5, -84], [3.8, -81], [-3.5, -90], [3.8, -87], [-3.5, -96], [3.8, -93], [-3.5, -102], [3.8, -99], [-3.5, -108], [3.8, -105], [-3.5, -114], [3.8, -111], [-3.5, -120], [3.8, -117], [-3.5, -126], [3.8, -123], [-3.5, -132], [3.8, -129], [-3.5, -138], [3.8, -135], [-3.5, -144], [3.8, -141], [-3.5, -150], [3.8, -147], [-3.5, -156], [3.8, -153]].forEach(([x, z]) => buildRockCluster(x, z));

// ===================== GRASS =====================
if (!REDUCE_MOTION) {
    const grassGeo = new THREE.BoxGeometry(0.04, 0.2, 0.02);
    const grassMesh = new THREE.InstancedMesh(grassGeo, matGrass, 1000);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 1000; i++) {
        const angle = rng() * Math.PI * 2, dist = 4 + rng() * 60;
        dummy.position.set(Math.cos(angle) * dist, 0.1, -8 - rng() * 190);
        dummy.rotation.y = rng() * Math.PI;
        dummy.scale.set(1, 0.5 + rng() * 1.5, 1);
        dummy.updateMatrix(); grassMesh.setMatrixAt(i, dummy.matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true; scene.add(grassMesh);
}

// ===================== MOUNTAINS =====================
function buildMountainRange(zBase, count, maxHeight, width) {
    for (let i = 0; i < count; i++) {
        const w = width * (0.6 + rng() * 0.8), h = maxHeight * (0.3 + rng() * 0.7);
        const mountain = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matMountain.clone());
        mountain.material.color.setHSL(0.6, 0.1 + rng() * 0.08, 0.04 + rng() * 0.03);
        mountain.position.set((rng() - 0.5) * width * 1.5, h / 2 - 1, zBase - rng() * 20);
        mountain.rotation.y = (rng() - 0.5) * 0.15; scene.add(mountain);
    }
}
buildMountainRange(-250, 5, 18, 50);
buildMountainRange(-300, 4, 24, 60);
buildMountainRange(-340, 3, 14, 45);

// ===================== LEAVES =====================
const LEAF_COUNT = REDUCE_MOTION ? 0 : 250;
let leaves = null, leafSeed = null, leafBaseX = null, leafSpeed = null;
if (LEAF_COUNT > 0) {
    const positions = new Float32Array(LEAF_COUNT * 3);
    leafSeed = new Float32Array(LEAF_COUNT); leafBaseX = new Float32Array(LEAF_COUNT); leafSpeed = new Float32Array(LEAF_COUNT);
    for (let i = 0; i < LEAF_COUNT; i++) {
        const x = (Math.random() - 0.5) * 60;
        leafBaseX[i] = x; positions[i * 3] = x; positions[i * 3 + 1] = Math.random() * 25; positions[i * 3 + 2] = -Math.random() * 220;
        leafSeed[i] = Math.random() * Math.PI * 2; leafSpeed[i] = 0.3 + Math.random() * 0.45;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    leaves = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd1381f, size: 0.09, transparent: true, opacity: 0.85, fog: true }));
    scene.add(leaves);
}

// ===================== STARS =====================
const STAR_COUNT = REDUCE_MOTION ? 0 : 300;
let stars = null, starPhase = null, starBaseY = null;
if (STAR_COUNT > 0) {
    const positions = new Float32Array(STAR_COUNT * 3);
    starPhase = new Float32Array(STAR_COUNT); starBaseY = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 250;
        const y = 10 + Math.random() * 40; starBaseY[i] = y;
        positions[i * 3 + 1] = y; positions[i * 3 + 2] = -20 - Math.random() * 250;
        starPhase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffeedd, size: 0.12, transparent: true, opacity: 0.6, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(stars);
}

// ===================== GROUND FOG =====================
const fogPlaneMat = new THREE.MeshBasicMaterial({ color: 0x0a0d10, transparent: true, opacity: 0.35, fog: false, depthWrite: false, side: THREE.DoubleSide });
const fogPlane = new THREE.Mesh(new THREE.PlaneGeometry(40, 70), fogPlaneMat);
fogPlane.rotation.x = -Math.PI / 2; fogPlane.position.set(0, 0.12, -15); scene.add(fogPlane);
const fogPlane2Mat = new THREE.MeshBasicMaterial({ color: 0x080b0e, transparent: true, opacity: 0.2, fog: false, depthWrite: false, side: THREE.DoubleSide });
const fogPlane2 = new THREE.Mesh(new THREE.PlaneGeometry(35, 60), fogPlane2Mat);
fogPlane2.rotation.x = -Math.PI / 2; fogPlane2.position.set(0, 0.25, -18); scene.add(fogPlane2);

// ===================== LIGHT SHAFTS =====================
const lightShafts = [];
function buildLightShaft(x, y, z, angleY) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
        const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 5), new THREE.MeshBasicMaterial({ color: 0xffd9c2, transparent: true, opacity: 0.04 + rng() * 0.06, fog: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        shaft.position.set((i - 1) * 0.3, 0, 0); shaft.rotation.y = angleY + (i - 1) * 0.12;
        lightShafts.push(shaft); g.add(shaft);
    }
    g.position.set(x, y, z); scene.add(g);
}
buildLightShaft(-2.1, 2.6, -20, 0.15); buildLightShaft(2.1, 2.6, -20, -0.15);
buildLightShaft(-2.1, 2.6, -42, 0.15); buildLightShaft(2.1, 2.6, -42, -0.15);

// ===================== CAMERA =====================
// 11 waypoints: hero -> torii -> stairs -> landing -> temple -> doors -> inside
// Temple at (0, 6, -172), scale 2x: podium front z=-162, door z=-163.4
// Door bottom world = 8.6, door center = 10.6, z=-163.4
const CAM = [
    { p: [0, 5.0, 25], t: [0, 3.0, -10], fov: 44 },  // 0: hero wide
    { p: [0, 2.5, 2], t: [0, 2.0, -15], fov: 42 },  // 1: gate text
    { p: [0, 2.0, -15], t: [0, 1.8, -28], fov: 42 },  // 2: second torii
    { p: [0, 1.5, -30], t: [0, 1.5, -42], fov: 40 },  // 3: at second torii
    { p: [0, 1.5, -40], t: [0, 2.0, -55], fov: 38 },  // 4: approaching stairs
    { p: [0, 2.5, -55], t: [0, 5.0, -80], fov: 36 },  // 5: start climbing (tilted up)
    { p: [0, 4.5, -80], t: [0, 8.0, -105], fov: 34 },  // 6: mid-stairs (tilted up)
    { p: [0, 6.5, -110], t: [0, 10.0, -135], fov: 32 },  // 7: upper stairs (tilted up)
    { p: [0, 8.0, -135], t: [0, 10.5, -155], fov: 28 },  // 8: near top (tilted up)
    { p: [0, 8.5, -152], t: [0, 10.5, -160], fov: 24 },  // 9: approaching door (tilted up)
    { p: [0, 8.30, -157], t: [0, 10.5, -163], fov: 20 },  // 10: at door (tilted up)
];
const curveP = new THREE.CatmullRomCurve3(CAM.map(c => new THREE.Vector3(...c.p)), false, "catmullrom", 0.5);
const curveT = new THREE.CatmullRomCurve3(CAM.map(c => new THREE.Vector3(...c.t)), false, "catmullrom", 0.5);

// ===================== SCROLL MAPPING =====================
const SECS = [...document.querySelectorAll("[data-cam]")];
let anchors = [], maxScroll = 1;
function measure() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    anchors = SECS.map((el, i) => {
        if (i === 0) return 0;
        if (i === SECS.length - 1) return maxScroll;
        const r = el.getBoundingClientRect();
        const top = r.top + window.scrollY;
        return clamp(top + r.height * 0.5 - innerHeight * 0.5, 0, maxScroll);
    });
    for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
}
function progressFor(y) {
    if (y <= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) {
        if (y <= anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
    }
    return anchors.length - 1;
}
let smooth = 0, target = 0;
function onScroll() { target = progressFor(window.scrollY); }
window.addEventListener("scroll", onScroll, { passive: true });

// Cursor wisp emission
window.addEventListener('mousemove', (e) => {
    if (typeof wispData === 'undefined' || typeof wisps === 'undefined') return;
    const cx = (e.clientX / innerWidth) * 2 - 1;
    const cy = -(e.clientY / innerHeight) * 2 + 1;
    // project into camera space
    const dist = 3;
    const dir = new THREE.Vector3(cx, cy, -1).unproject(camera).sub(camera.position).normalize();
    const pt = camera.position.clone().addScaledVector(dir, dist);
    const dx = e.clientX - wispData.lx, dy = e.clientY - wispData.ly;
    const speed = Math.sqrt(dx * dx + dy * dy);
    wispData.lx = e.clientX; wispData.ly = e.clientY;
    wispData.acc += speed * .003;
    while (wispData.acc > 1 && wispData.list.length > 0) {
        wispData.acc -= 1;
        const w = wispData.list[wispData.i % WISP_N];
        w.x = pt.x + (Math.random() - .5) * .8;
        w.y = pt.y + (Math.random() - .5) * .6;
        w.z = pt.z + (Math.random() - .5) * .8;
        w.a = .4 + Math.random() * .6;
        wispData.i++;
    }
}, { passive: true });


// ===================== FADE TO WHITE + DOOR OPENING =====================
// White only when camera is right at the door (t >= 0.90)
const fadeOverlay = document.getElementById("fade-overlay");
const fadeStart = 0.90, fadeEnd = 0.98;
let hasNavigated = false;
const baseBgColor = new THREE.Color(0x060a0d);
const brightBgColor = new THREE.Color(0x1a1510);
const whiteBgColor = new THREE.Color(0xf5f0e8);

function updateEnding(dt) {
    const t = smooth / (CAM.length - 1);
    const doorT = clamp((t - 0.91) / 0.08, 0, 1);
    if (t >= fadeStart) {
        const brightT = clamp((t - fadeStart) / (fadeEnd - 0.88), 0, 1);
        scene.background.lerpColors(baseBgColor, brightBgColor, clamp(brightT * 2, 0, 1));
        if (brightT > 0.5) scene.background.lerp(whiteBgColor, (brightT - 0.5) * 2);
        scene.fog.color.copy(scene.background);
        scene.fog.density = lerp(scene.fog.density, 0.005, dt * 2);
        scene.children.forEach(c => {
            if (c.isHemisphereLight) c.intensity = lerp(1.2, 2.5, brightT);
            if (c.isDirectionalLight && c._baseIntensity === undefined) c._baseIntensity = c.intensity;
            if (c.isDirectionalLight) c.intensity = lerp(c._baseIntensity, c._baseIntensity * 3, brightT);
        });
        fogPlaneMat.opacity = lerp(fogPlaneMat.opacity, 0, dt * 2);
        fogPlane2Mat.opacity = lerp(fogPlane2Mat.opacity, 0, dt * 2);
        if (stars) stars.material.opacity = lerp(stars.material.opacity, 0, dt * 2);
        if (templeDoorPivotL && templeDoorPivotR) {
            templeDoorPivotL.rotation.y = -doorT * Math.PI * 0.35;
            templeDoorPivotR.rotation.y = doorT * Math.PI * 0.35;
        }
        if (templeDoorLight) {
            templeDoorLight.intensity = lerp(1.4, 5.0, doorT);
            templeDoorLight.distance = lerp(6, 18, doorT);
        }
        const overlayT = clamp((t - 0.96) / (fadeEnd - 0.96), 0, 1);
        fadeOverlay.style.opacity = overlayT;
        if (overlayT >= 1 && !hasNavigated) {
            hasNavigated = true;
            setTimeout(() => { window.location.href = "./after.html"; }, 400);
        }
    } else {
        fadeOverlay.style.opacity = 0;
        scene.background.copy(baseBgColor);
        scene.fog.color.copy(baseBgColor);
        if (templeDoorPivotL && templeDoorPivotR) {
            templeDoorPivotL.rotation.y = 0;
            templeDoorPivotR.rotation.y = 0;
        }
        if (templeDoorLight) { templeDoorLight.intensity = 1.4; templeDoorLight.distance = 6; }
        if (stars) stars.material.opacity = 0.6;
    }
}

// ===================== RESIZE + IO =====================
function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    measure(); onScroll();
}
window.addEventListener("resize", onResize); onResize();

const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("rv-in"); io.unobserve(e.target); }
    });
}, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
document.querySelectorAll(".eyebrow, .hero-sub, .h-sec, .sec-copy p, .h-fin, .body-lg")
    .forEach((el) => io.observe(el));

// ===================== RENDER LOOP =====================
const _p = new THREE.Vector3(), _t = new THREE.Vector3();
let prev = performance.now(), elapsed = 0;
function frame(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now; elapsed += dt;
    const damp = REDUCE_MOTION ? 1 : 1 - Math.pow(0.0015, dt);
    smooth += (target - smooth) * damp;
    const N = CAM.length - 1;
    const u = clamp(smooth / N, 0, 1);
    curveP.getPoint(u, _p); curveT.getPoint(u, _t);
    const i = clamp(Math.floor(smooth), 0, N - 1), f = clamp(smooth - i, 0, 1);
    const fov = lerp(CAM[i].fov, CAM[i + 1].fov, f);
    camera.position.copy(_p); camera.lookAt(_t);
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const tEnding = u;
    if (tEnding < fadeStart) scene.fog.density = lerp(0.016, 0.004, Math.pow(u, 2)) + Math.sin(elapsed * 0.3) * 0.002;
    // Temple lighting: brighten as camera approaches (u=0.5 is mid-stairs, u=0.8 is near door)
    if (tEnding < fadeStart) {
        const templeBright = clamp((u - 0.45) / 0.35, 0, 1);
        scene.children.forEach(c => {
            if (c.isHemisphereLight) c.intensity = lerp(1.2, 2.0, templeBright);
            if (c.isDirectionalLight && c._baseIntensity === undefined) c._baseIntensity = c.intensity;
            if (c.isDirectionalLight) c.intensity = lerp(c._baseIntensity, c._baseIntensity * 2.0, templeBright);
        });
    }
    fogPlane.position.z = _p.z - 3; fogPlane.position.x = _p.x;
    if (tEnding < fadeStart) fogPlaneMat.opacity = lerp(0.3, 0.12, u);
    fogPlane2.position.z = _p.z - 5; fogPlane2.position.x = _p.x + 1;
    if (tEnding < fadeStart) fogPlane2Mat.opacity = lerp(0.18, 0.06, u);
    if (leaves) {
        const pos = leaves.geometry.attributes.position;
        for (let k = 0; k < LEAF_COUNT; k++) {
            let y = pos.getY(k) - leafSpeed[k] * dt;
            if (y < -0.5) y = 25;
            pos.setY(k, y);
            pos.setX(k, leafBaseX[k] + Math.sin(now * 0.0006 + leafSeed[k]) * 1.1);
        }
        pos.needsUpdate = true;
    }
    if (stars) {
        const sArr = stars.geometry.attributes.position.array;
        for (let k = 0; k < STAR_COUNT; k++) sArr[k * 3 + 1] = starBaseY[k] + Math.sin(elapsed * 0.8 + starPhase[k]) * 0.03;
        stars.geometry.attributes.position.needsUpdate = true;
        if (tEnding < fadeStart) stars.material.opacity = 0.4 + Math.sin(elapsed * 0.5) * 0.2;
    }
    // Update falling leaves
    if (typeof leafInst !== 'undefined' && leafList.length > 0) {
        for (let k = 0; k < LEAF_N; k++) {
            const l = leafList[k];
            l.y -= l.fall * dt;
            l.roll += l.rollSp * dt;
            l.tilt += l.spin * dt;
            if (l.y < -2) { l.y = 26; l.x = (Math.random() - .5) * 60; l.z = -20 - Math.random() * 190; }
            const sw = Math.sin(elapsed * l.sway + l.swayPh);
            _LP.set(l.x + sw * l.swayAmp, l.y, l.z + Math.cos(elapsed * l.sway * .7 + l.swayPh) * l.swayAmp * .6);
            _LE.set(l.roll, l.tilt, sw * .55);
            _LQ.setFromEuler(_LE);
            _LS.setScalar(l.s);
            _LM.compose(_LP, _LQ, _LS);
            leafInst.setMatrixAt(k, _LM);
        }
        leafInst.instanceMatrix.needsUpdate = true;
    }
    for (const shaft of lightShafts) shaft.material.opacity = 0.04 + Math.sin(elapsed * 1.2 + shaft.position.x * 2) * 0.03;

    // Update embers
    if (typeof embers !== 'undefined' && emberMat.uniforms) {
        emberMat.uniforms.uT.value = elapsed;
    }
    // Update haze drift
    if (typeof hazePlanes !== 'undefined') {
        for (const h of hazePlanes) {
            const ud = h.userData;
            h.position.x = ud.x0 + Math.sin(elapsed * ud.sp + ud.ph) * 3;
            h.rotation.z = Math.sin(elapsed * ud.sp * .4 + ud.ph) * .08;
        }
    }
    // Update cursor wisps
    if (typeof wisps !== 'undefined' && wispData.list.length > 0) {
        const wp = wisps.geometry.attributes.position;
        const wa = wisps.geometry.attributes.aA;
        for (let k = 0; k < WISP_N; k++) {
            const w = wispData.list[k];
            if (w.a > 0) {
                w.a = Math.max(0, w.a - dt * .8);
                w.y += dt * .3;
            }
            wp.setXYZ(k, w.x, w.y, w.z);
            wa.setX(k, w.a);
        }
        wp.needsUpdate = true;
        wa.needsUpdate = true;
    }

    updateEnding(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);