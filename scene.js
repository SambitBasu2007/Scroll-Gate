import * as THREE from "./vendor/three.module.min.js";

const REDUCE_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const srand = (seed) => { let s = seed; return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; }; };
const rng = srand(42);

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(1.75, devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const BG = 0x05070a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, 0.018);

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

const moonTex = tex(512, (ctx, s) => {
    ctx.fillStyle = "#e8ddd0"; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, d = 0.15 + Math.random() * 0.35;
        const cx = s / 2 + Math.cos(a) * s * d * 0.4, cy = s / 2 + Math.sin(a) * s * d * 0.4;
        const rr = s * (0.08 + Math.random() * 0.18);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        g.addColorStop(0, "rgba(120,110,100,0.25)"); g.addColorStop(1, "rgba(120,110,100,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    for (let i = 0; i < 60; i++) {
        const cx = s * (0.12 + Math.random() * 0.76), cy = s * (0.12 + Math.random() * 0.76);
        const r = s * (0.008 + Math.random() * 0.04);
        ctx.globalAlpha = 0.15 + Math.random() * 0.2; ctx.fillStyle = "#8a7d70";
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.12 + Math.random() * 0.15; ctx.fillStyle = "#5a5048";
        ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.85, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.08 + Math.random() * 0.1; ctx.fillStyle = "#f0e8de";
        ctx.beginPath(); ctx.arc(cx + r * 0.15, cy + r * 0.15, r * 1.05, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 200; i++) {
        ctx.globalAlpha = 0.06 + Math.random() * 0.12;
        ctx.fillStyle = Math.random() > 0.5 ? "#b0a598" : "#7a7068";
        ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
});
const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 48, 32),
    new THREE.MeshBasicMaterial({ map: moonTex, fog: false })
);
moon.position.set(25, 30, -350);
scene.add(moon);

const haloTex = tex(256, (ctx, s) => {
    const r = s / 2;
    const g = ctx.createRadialGradient(r, r, r * 0.1, r, r, r);
    g.addColorStop(0, "rgba(255,230,210,0.4)"); g.addColorStop(0.4, "rgba(255,200,170,0.15)");
    g.addColorStop(1, "rgba(255,180,150,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
});
const halo = new THREE.Mesh(
    new THREE.CircleGeometry(6, 32),
    new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
halo.position.copy(moon.position);
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
    const g = new THREE.Group();
    const pillarGeo = new THREE.CylinderGeometry(0.22 * scale, 0.26 * scale, 5.2 * scale, 12);
    const pL = new THREE.Mesh(pillarGeo, matVermilion);
    const pR = new THREE.Mesh(pillarGeo, matVermilion);
    pL.position.set(-2.1 * scale, 2.6 * scale, 0);
    pR.position.set(2.1 * scale, 2.6 * scale, 0);
    g.add(pL, pR);
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(5.6 * scale, 0.34 * scale, 0.7 * scale), matVermilion);
    kasagi.position.set(0, 5.15 * scale, 0); g.add(kasagi);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(5.9 * scale, 0.22 * scale, 0.9 * scale), matVermilionDark);
    shimaki.position.set(0, 5.42 * scale, 0); g.add(shimaki);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(4.9 * scale, 0.28 * scale, 0.34 * scale), matVermilionDark);
    nuki.position.set(0, 3.7 * scale, 0); g.add(nuki);
    const gakuzuka = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 1.1 * scale, 0.3 * scale), matWood);
    gakuzuka.position.set(0, 4.3 * scale, 0); g.add(gakuzuka);
    g.position.z = z;
    scene.add(g);
    return g;
}
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
    const podium = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 10), matStoneLight);
    podium.position.y = 0.4; g.add(podium);
    const podium2 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 9), matStone);
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
    // 5-tier pagoda roof
    const tiers = 5, tierBaseY = 1.3 + bodyH;
    for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const tierW = lerp(8.6, 3.2, t), tierD = lerp(7.4, 2.8, t);
        const yOff = tierBaseY + i * lerp(0.75, 0.55, t);
        const eave = new THREE.Mesh(new THREE.BoxGeometry(tierW + 0.8, 0.12, tierD + 0.6), matRoofEdge);
        eave.position.y = yOff; g.add(eave);
        for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const corner = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), matRoofEdge);
            corner.position.set(cx * (tierW / 2 + 0.3), yOff + 0.06, cz * (tierD / 2 + 0.2));
            corner.rotation.z = cx * 0.12; corner.rotation.x = cz * 0.08; g.add(corner);
        }
        const rafterCount = Math.floor(tierW * 2);
        for (let r = 0; r < rafterCount; r++) {
            const rx = -tierW / 2 + (tierW / (rafterCount - 1)) * r;
            const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, tierD / 2 + 0.4), matWood);
            rafter.position.set(rx, yOff - 0.06, 0); g.add(rafter);
        }
        if (i < tiers - 1) {
            const roofH = lerp(1.0, 0.6, t);
            const roofBody = new THREE.Mesh(new THREE.ConeGeometry(tierW * 0.42, roofH, 4), matRoof);
            roofBody.rotation.y = Math.PI / 4; roofBody.position.y = yOff + roofH / 2 + 0.06; g.add(roofBody);
        }
    }
    const shinbashira = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 8), matVermilion);
    shinbashira.position.y = tierBaseY + tiers * 0.6 + 0.5; g.add(shinbashira);
    const finialBase = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 8), matVermilion);
    finialBase.position.y = tierBaseY + tiers * 0.6 + 1.3; g.add(finialBase);
    for (let i = 0; i < 4; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08 + i * 0.015, 0.015, 6, 12), matVermilionDark);
        ring.position.y = tierBaseY + tiers * 0.6 + 1.5 + i * 0.12;
        ring.rotation.x = Math.PI / 2; g.add(ring);
    }
    const jewel = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 })
    );
    jewel.position.y = tierBaseY + tiers * 0.6 + 2.1; g.add(jewel);
}
buildTemple(templeGroup);
scene.add(templeGroup);

// ===================== TREES =====================
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

// ===================== FADE TO WHITE + DOOR OPENING =====================
// White only when camera is right at the door (t >= 0.90)
const fadeOverlay = document.getElementById("fade-overlay");
const fadeStart = 0.90, fadeEnd = 0.98;
let hasNavigated = false;
const baseBgColor = new THREE.Color(BG);
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
    if (tEnding < fadeStart) scene.fog.density = lerp(0.018, 0.025, u) + Math.sin(elapsed * 0.3) * 0.003;
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
    for (const shaft of lightShafts) shaft.material.opacity = 0.04 + Math.sin(elapsed * 1.2 + shaft.position.x * 2) * 0.03;
    updateEnding(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);