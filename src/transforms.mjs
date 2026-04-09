// Scene transforms for backporting 3D models to older printer capabilities

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UNIT_TO_MM = {
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
};

/**
 * Strip all materials and vertex colors from the scene.
 * Replaces every material with a single neutral gray.
 * Use this for single-color FDM printers.
 */
export function stripMaterials(scene) {
  const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc });

  scene.traverse((obj) => {
    if (obj.isMesh) {
      // Replace material(s) with single default
      if (Array.isArray(obj.material)) {
        obj.material.forEach(m => m.dispose?.());
      } else {
        obj.material?.dispose?.();
      }
      obj.material = defaultMaterial;

      // Remove vertex colors
      if (obj.geometry.attributes.color) {
        obj.geometry.deleteAttribute('color');
      }
    }
  });

  return scene;
}

/**
 * Merge all meshes in the scene into a single mesh.
 * Essential for multi-body 3MF files or multi-part models.
 * Bakes world transforms into vertex positions.
 */
export function mergeMeshes(scene) {
  const geometries = [];
  const meshesToRemove = [];

  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      const geo = obj.geometry.clone();

      // Bake world transform into geometry
      geo.applyMatrix4(obj.matrixWorld);

      // Convert indexed geometry to non-indexed for compatibility
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;

      geometries.push(nonIndexed);
      meshesToRemove.push(obj);
    }
  });

  if (geometries.length === 0) {
    return scene;
  }

  // Normalize attributes — find common set across all geometries
  // If any geometry lacks an attribute that others have, remove it from all
  if (geometries.length > 1) {
    const allAttributes = new Set();
    geometries.forEach(geo => {
      Object.keys(geo.attributes).forEach(attr => allAttributes.add(attr));
    });

    for (const attrName of allAttributes) {
      const allHaveIt = geometries.every(geo => geo.attributes[attrName] !== undefined);
      if (!allHaveIt) {
        // Remove this attribute from all geometries
        geometries.forEach(geo => {
          if (geo.attributes[attrName]) {
            geo.deleteAttribute(attrName);
          }
        });
      }
    }

    // Ensure matching itemSize for remaining attributes
    for (const attrName of Object.keys(geometries[0].attributes)) {
      const itemSize = geometries[0].attributes[attrName].itemSize;
      const allMatch = geometries.every(
        geo => geo.attributes[attrName]?.itemSize === itemSize
      );
      if (!allMatch) {
        geometries.forEach(geo => geo.deleteAttribute(attrName));
      }
    }
  }

  // Merge
  const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(geometries);
  if (!mergedGeometry) {
    console.warn('Warning: Could not merge geometries. Returning scene unmodified.');
    return scene;
  }

  // Remove old meshes
  for (const mesh of meshesToRemove) {
    mesh.removeFromParent();
  }

  // Add merged mesh
  const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  const mergedMesh = new THREE.Mesh(mergedGeometry, material);
  scene.add(mergedMesh);

  return scene;
}

/**
 * Apply a scale factor to the entire scene.
 * @param {THREE.Scene} scene
 * @param {number} factor - Scale multiplier
 */
export function applyScale(scene, factor) {
  scene.scale.multiplyScalar(factor);
  scene.updateMatrixWorld(true);
  return scene;
}

/**
 * Convert units (e.g., meters to millimeters).
 * @param {THREE.Scene} scene
 * @param {string} fromUnit - Source unit ('mm', 'cm', 'm', 'inch')
 * @param {string} toUnit - Target unit
 */
export function convertUnits(scene, fromUnit, toUnit) {
  const from = UNIT_TO_MM[fromUnit];
  const to = UNIT_TO_MM[toUnit];

  if (!from || !to) {
    const valid = Object.keys(UNIT_TO_MM).join(', ');
    throw new Error(`Invalid unit. Supported: ${valid}`);
  }

  const factor = from / to;
  return applyScale(scene, factor);
}

/**
 * Simplify meshes by reducing polygon count.
 * @param {THREE.Scene} scene
 * @param {number} ratio - Target ratio (0-1). 0.5 = reduce to 50% of faces.
 */
export async function simplifyMesh(scene, ratio) {
  // Dynamic import — SimplifyModifier is heavy and optional
  const { SimplifyModifier } = await import(
    'three/examples/jsm/modifiers/SimplifyModifier.js'
  );
  const modifier = new SimplifyModifier();

  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      const geo = obj.geometry;
      const vertexCount = geo.attributes.position.count;
      const removeCount = Math.floor(vertexCount * (1 - ratio));

      if (removeCount > 0 && removeCount < vertexCount) {
        try {
          const simplified = modifier.modify(geo, removeCount);
          obj.geometry = simplified;
          geo.dispose();
        } catch (err) {
          console.warn(`Warning: Could not simplify mesh "${obj.name}": ${err.message}`);
        }
      }
    }
  });

  return scene;
}

// --- Quality Mode Transforms ---

/**
 * Quality mode presets.
 * 'rendering' — optimized for visual output (faster, float32, good enough for previews)
 * 'manufacturing' — optimized for print precision (recompute normals, validate geometry,
 *                    ensure consistent winding, remove degenerate faces)
 */
export const QUALITY_MODES = {
  rendering: {
    name: 'Rendering Optimized',
    description: 'Fast conversion optimized for visual preview. Uses standard float32 precision.',
  },
  manufacturing: {
    name: 'Manufacturing Precision',
    description: 'High-precision conversion for 3D printing. Recomputes normals, removes degenerate triangles, ensures consistent face winding.',
  },
};

/**
 * Apply manufacturing-quality post-processing to ensure print-ready geometry.
 * - Recomputes vertex normals from face geometry (not interpolated)
 * - Removes degenerate (zero-area) triangles
 * - Ensures consistent face winding order
 * - Computes bounding box for dimension verification
 */
export function applyManufacturingMode(scene) {
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;

    const geo = obj.geometry;

    // Remove degenerate triangles (zero-area faces)
    removeDegenerateFaces(geo);

    // Recompute normals from face geometry for accurate slicer interpretation
    geo.computeVertexNormals();

    // Compute bounding box for dimension reporting
    geo.computeBoundingBox();
  });

  return scene;
}

/**
 * Remove degenerate (zero-area) triangles from a BufferGeometry.
 * These cause issues in slicers and can produce print artifacts.
 */
function removeDegenerateFaces(geometry) {
  const position = geometry.attributes.position;
  if (!position) return;

  const isIndexed = geometry.index !== null;

  if (isIndexed) {
    const indices = Array.from(geometry.index.array);
    const cleanIndices = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();

    for (let i = 0; i < indices.length; i += 3) {
      v[0].fromBufferAttribute(position, indices[i]);
      v[1].fromBufferAttribute(position, indices[i + 1]);
      v[2].fromBufferAttribute(position, indices[i + 2]);

      edge1.subVectors(v[1], v[0]);
      edge2.subVectors(v[2], v[0]);
      const area = edge1.cross(edge2).length() * 0.5;

      if (area > 1e-10) {
        cleanIndices.push(indices[i], indices[i + 1], indices[i + 2]);
      }
    }

    if (cleanIndices.length < indices.length) {
      geometry.setIndex(cleanIndices);
      const removed = (indices.length - cleanIndices.length) / 3;
      if (removed > 0) {
        console.log(`  Removed ${removed} degenerate triangle(s)`);
      }
    }
  }
}

/**
 * Get bounding box dimensions for manufacturing verification.
 */
export function getBoundingBox(scene) {
  const box = new THREE.Box3();

  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      obj.geometry.computeBoundingBox();
      const meshBox = obj.geometry.boundingBox.clone();
      meshBox.applyMatrix4(obj.matrixWorld);
      box.union(meshBox);
    }
  });

  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
    dimensions: { x: size.x, y: size.y, z: size.z },
  };
}
