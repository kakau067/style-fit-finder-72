import * as THREE from "three";

export type FitGarment = "camisa" | "blazer" | "camiseta" | "vestido" | "calca" | "saia";

const BINS = 48;

type Ring = { center: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; radii: number[] };

/** Collect the deformed body surface (morphs applied) in the frame's local space. */
function samplePoints(model: THREE.Object3D, frame: THREE.Object3D) {
  frame.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const points: THREE.Vector3[] = [];
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const position = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
    if (!position) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) {
      points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(matrix));
    }
  });
  return points;
}

/** First contiguous cluster of values (sorted ascending) separated by a gap. */
function firstCluster<T>(items: T[], value: (item: T) => number, gap: number) {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  const out: T[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && value(sorted[i]!) - value(sorted[i - 1]!) > gap) break;
    out.push(sorted[i]!);
  }
  return out;
}

function smoothCircular(values: number[], passes = 2) {
  let current = values;
  for (let p = 0; p < passes; p++) {
    current = current.map((v, i) => (current[(i - 1 + current.length) % current.length]! + 2 * v + current[(i + 1) % current.length]!) / 4);
  }
  return current;
}

/** Max radius per angular bin around an axis, gaps filled by interpolation. */
function radialProfile(points: THREE.Vector3[], center: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, fallback: number) {
  const radii = new Array<number>(BINS).fill(-1);
  const d = new THREE.Vector3();
  for (const p of points) {
    d.subVectors(p, center);
    const x = d.dot(u);
    const y = d.dot(v);
    const bin = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * BINS) % BINS;
    radii[bin] = Math.max(radii[bin]!, Math.hypot(x, y));
  }
  const known = radii.map((r, i) => (r > 0 ? i : -1)).filter((i) => i >= 0);
  if (!known.length) return new Array<number>(BINS).fill(fallback);
  for (let i = 0; i < BINS; i++) {
    if (radii[i]! > 0) continue;
    let a = i, b = i, da = 0, db = 0;
    while (radii[a]! <= 0) { a = (a - 1 + BINS) % BINS; da++; }
    while (radii[b]! <= 0) { b = (b + 1) % BINS; db++; }
    radii[i] = (radii[a]! * db + radii[b]! * da) / (da + db);
  }
  return smoothCircular(radii);
}

function ringsToMesh(rings: Ring[], material: THREE.Material, ease: number, offset: number) {
  // Vertical smoothing keeps the fabric from reproducing every body crease.
  const smoothed = rings.map((ring, i) => ({
    ...ring,
    radii: ring.radii.map((r, b) => {
      const prev = rings[Math.max(0, i - 1)]!.radii[b]!;
      const next = rings[Math.min(rings.length - 1, i + 1)]!.radii[b]!;
      return (prev + 2 * r + next) / 4;
    }),
  }));
  const positions: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  smoothed.forEach((ring) => {
    for (let b = 0; b <= BINS; b++) {
      const angle = ((b % BINS) + 0.5) / BINS * Math.PI * 2 - Math.PI;
      const r = ring.radii[b % BINS]! * ease + offset;
      p.copy(ring.center).addScaledVector(ring.u, Math.cos(angle) * r).addScaledVector(ring.v, Math.sin(angle) * r);
      positions.push(p.x, p.y, p.z);
    }
  });
  const row = BINS + 1;
  for (let i = 0; i < smoothed.length - 1; i++) {
    for (let b = 0; b < BINS; b++) {
      const a = i * row + b, c = (i + 1) * row + b;
      index.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds a garment shell directly from the deformed body surface, in the
 * coordinate frame of `frame`. Every ring follows the real body cross-section,
 * so the garment shares the body's transform, scale and measurements exactly.
 */
export function buildFittedGarment(model: THREE.Object3D, frame: THREE.Object3D, kind: FitGarment, material: THREE.Material) {
  const group = new THREE.Group();
  const points = samplePoints(model, frame);
  if (points.length < 100) return group;
  const box = new THREE.Box3().setFromPoints(points);
  const H = box.max.y - box.min.y;
  const cx = (box.min.x + box.max.x) / 2;
  const y0 = box.min.y;
  const gap = H * 0.012;
  const band = H / 90;
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const slice = (y: number) => points.filter((p) => Math.abs(p.y - y) <= band);
  const at = (f: number) => y0 + H * f;

  // Crotch: lowest height where the inner thighs meet the body centre line.
  let crotch = at(0.47);
  for (let f = 0.36; f < 0.56; f += 0.005) {
    if (slice(at(f)).some((p) => Math.abs(p.x - cx) < H * 0.006)) { crotch = at(f); break; }
  }

  const torsoRing = (y: number): Ring => {
    const cluster = firstCluster(slice(y), (p) => Math.abs(p.x - cx), gap);
    const zc = cluster.length ? cluster.reduce((s, p) => s + p.z, 0) / cluster.length : 0;
    const center = new THREE.Vector3(cx, y, zc);
    return { center, u: X, v: Z, radii: radialProfile(cluster, center, X, Z, H * 0.08) };
  };
  const torso = (from: number, to: number, steps: number) =>
    Array.from({ length: steps + 1 }, (_, i) => torsoRing(from + ((to - from) * i) / steps));

  const neck = at(0.815);
  const waist = at(0.6);
  const offset = H * 0.006;

  const legRing = (side: -1 | 1, y: number): Ring => {
    const cluster = firstCluster(
      slice(y).filter((p) => side * (p.x - cx) > -H * 0.005),
      (p) => side * (p.x - cx),
      gap,
    );
    const center = cluster.length
      ? cluster.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(cluster.length).setY(y)
      : new THREE.Vector3(cx + side * H * 0.06, y, 0);
    return { center, u: X, v: Z, radii: radialProfile(cluster, center, X, Z, H * 0.04) };
  };

  const sleeve = (side: -1 | 1, fraction: number, ease: number) => {
    const armpit = at(0.72);
    const torsoHalf = (y: number) => firstCluster(slice(y), (p) => Math.abs(p.x - cx), gap).reduce((m, p) => Math.max(m, Math.abs(p.x - cx)), 0);
    const arm = points.filter((p) => p.y > crotch && p.y < neck && side * (p.x - cx) > torsoHalf(p.y) + gap * 0.5 && side * (p.x - cx) > 0);
    if (arm.length < 20) return;
    const shoulder = new THREE.Vector3(cx + side * torsoHalf(armpit) * 0.82, at(0.79), 0);
    let tip = arm[0]!;
    for (const p of arm) if (p.distanceToSquared(shoulder) > tip.distanceToSquared(shoulder)) tip = p;
    const axis = tip.clone().sub(shoulder);
    const length = axis.length();
    axis.normalize();
    const u = new THREE.Vector3().crossVectors(axis, Z).normalize();
    const v = new THREE.Vector3().crossVectors(u, axis).normalize();
    const rings: Ring[] = [];
    const steps = 14;
    const reach = length * fraction;
    const start = -length * 0.03;
    for (let i = 0; i <= steps; i++) {
      const t = start + ((reach - start) * i) / steps;
      const center = shoulder.clone().addScaledVector(axis, t);
      const near = arm.filter((p) => Math.abs(p.clone().sub(shoulder).dot(axis) - t) < length * 0.035);
      const local = near.length > 6 ? near.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(near.length) : center;
      // Keep the ring on the axis plane but follow the arm's actual centre.
      const c = local.clone().sub(axis.clone().multiplyScalar(local.clone().sub(center).dot(axis)));
      const radii = radialProfile(near, c, u, v, H * 0.03).map((r) => Math.max(r, H * 0.022));
      rings.push({ center: c, u, v, radii });
    }
    // The upper rings are dominated by shoulder mass; relax them into the torso.
    rings[0]!.radii = rings[0]!.radii.map((r) => Math.max(r, H * 0.05));
    group.add(ringsToMesh(rings, material, ease, offset));
  };

  const top = kind === "camisa" || kind === "blazer" || kind === "camiseta";
  if (top) {
    const ease = kind === "blazer" ? 1.07 : kind === "camisa" ? 1.04 : 1.02;
    const hem = kind === "camiseta" ? crotch + H * 0.03 : crotch - H * 0.01;
    group.add(ringsToMesh(torso(hem, neck, 36), material, ease, offset * (kind === "blazer" ? 2 : 1)));
    for (const side of [-1, 1] as const) sleeve(side, kind === "camiseta" ? 0.3 : 0.8, ease);
  }

  if (kind === "vestido") {
    const bodice = torso(crotch + H * 0.02, neck, 30);
    const skirtRings: Ring[] = [];
    let previous = bodice[0]!.radii;
    for (let i = 1; i <= 18; i++) {
      const y = crotch + H * 0.02 - ((crotch + H * 0.02 - at(0.3)) * i) / 18;
      const ring = torsoRing(y);
      ring.center.x = cx;
      // A-line: fabric never narrows below the hips.
      const flare = 1 + i * 0.008;
      ring.radii = ring.radii.map((r, b) => Math.max(r, previous[b]!) * (i === 1 ? 1 : 1) );
      previous = ring.radii;
      ring.radii = ring.radii.map((r) => r * flare);
      skirtRings.push(ring);
    }
    group.add(ringsToMesh([...skirtRings.reverse(), ...bodice], material, 1.03, offset));
    for (const side of [-1, 1] as const) sleeve(side, 0.18, 1.03);
  }

  if (kind === "saia") {
    const hip = torso(crotch + H * 0.02, waist, 12);
    const rings: Ring[] = [];
    let previous = hip[0]!.radii;
    for (let i = 1; i <= 14; i++) {
      const ring = torsoRing(crotch + H * 0.02 - ((crotch + H * 0.02 - at(0.32)) * i) / 14);
      ring.center.x = cx;
      ring.radii = ring.radii.map((r, b) => Math.max(r, previous[b]!));
      previous = ring.radii;
      ring.radii = ring.radii.map((r) => r * (1 + i * 0.007));
      rings.push(ring);
    }
    group.add(ringsToMesh([...rings.reverse(), ...hip], material, 1.03, offset));
  }

  if (kind === "calca") {
    group.add(ringsToMesh(torso(crotch - H * 0.01, waist, 12), material, 1.03, offset));
    for (const side of [-1, 1] as const) {
      const rings = Array.from({ length: 29 }, (_, i) => legRing(side, at(0.045) + ((crotch + H * 0.005 - at(0.045)) * i) / 28));
      group.add(ringsToMesh(rings, material, 1.05, offset));
    }
  }

  return group;
}
