/**
 * Utility script — run with: node src/utils/inspectModel.js
 * Lists all mesh names and material info from a GLB file.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Minimal GLB parser — reads the JSON chunk to extract node/mesh/material names
const filePath = resolve('public/3008.glb');
const buffer = readFileSync(filePath);

// GLB header: magic(4) + version(4) + length(4) + chunkLength(4) + chunkType(4)
const jsonLength = buffer.readUInt32LE(12);
const jsonStr = buffer.toString('utf-8', 20, 20 + jsonLength);
const gltf = JSON.parse(jsonStr);

console.log('=== NODES ===');
(gltf.nodes || []).forEach((n, i) => {
  if (n.mesh !== undefined || n.name) {
    console.log(`  Node[${i}]: "${n.name || '(unnamed)'}" mesh:${n.mesh ?? '-'}`);
  }
});

console.log('\n=== MESHES ===');
(gltf.meshes || []).forEach((m, i) => {
  console.log(`  Mesh[${i}]: "${m.name || '(unnamed)'}" primitives:${m.primitives?.length}`);
  m.primitives?.forEach((p, j) => {
    console.log(`    Prim[${j}] material:${p.material ?? '-'}`);
  });
});

console.log('\n=== MATERIALS ===');
(gltf.materials || []).forEach((m, i) => {
  const pbr = m.pbrMetallicRoughness || {};
  const alpha = m.alphaMode || 'OPAQUE';
  const baseColor = pbr.baseColorFactor || [1,1,1,1];
  console.log(`  Mat[${i}]: "${m.name || '(unnamed)'}" alpha:${alpha} baseColor:[${baseColor.map(v=>v.toFixed(2)).join(',')}] metallic:${pbr.metallicFactor ?? '-'} roughness:${pbr.roughnessFactor ?? '-'}`);
});
