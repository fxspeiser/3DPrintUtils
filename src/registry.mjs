// Format registry — maps file extensions to Three.js loaders and exporters

export const loaders = {
  '.3mf': {
    name: '3D Manufacturing Format',
    module: 'three/examples/jsm/loaders/3MFLoader.js',
    className: 'ThreeMFLoader',
    inputType: 'arraybuffer',
    parseResult: 'group',  // returns Group directly
  },
  '.amf': {
    name: 'Additive Manufacturing Format',
    module: 'three/examples/jsm/loaders/AMFLoader.js',
    className: 'AMFLoader',
    inputType: 'arraybuffer',
    parseResult: 'group',
  },
  '.fbx': {
    name: 'Autodesk FBX',
    module: 'three/examples/jsm/loaders/FBXLoader.js',
    className: 'FBXLoader',
    inputType: 'arraybuffer',
    parseResult: 'group',
    parseArgs: (data) => [data, ''],  // second arg is resourcePath
  },
  '.gltf': {
    name: 'glTF',
    module: 'three/examples/jsm/loaders/GLTFLoader.js',
    className: 'GLTFLoader',
    inputType: 'string',
    parseResult: 'callback',  // uses callback-based parse
  },
  '.glb': {
    name: 'glTF Binary',
    module: 'three/examples/jsm/loaders/GLTFLoader.js',
    className: 'GLTFLoader',
    inputType: 'arraybuffer',
    parseResult: 'callback',
  },
  '.obj': {
    name: 'Wavefront OBJ',
    module: 'three/examples/jsm/loaders/OBJLoader.js',
    className: 'OBJLoader',
    inputType: 'string',
    parseResult: 'group',
  },
  '.stl': {
    name: 'STereoLithography',
    module: 'three/examples/jsm/loaders/STLLoader.js',
    className: 'STLLoader',
    inputType: 'arraybuffer',
    parseResult: 'geometry',  // returns BufferGeometry, must wrap in Mesh
  },
  '.ply': {
    name: 'Polygon File Format',
    module: 'three/examples/jsm/loaders/PLYLoader.js',
    className: 'PLYLoader',
    inputType: 'arraybuffer',
    parseResult: 'geometry',
  },
  '.dae': {
    name: 'Collada',
    module: 'three/examples/jsm/loaders/ColladaLoader.js',
    className: 'ColladaLoader',
    inputType: 'string',
    parseResult: 'scene',  // returns { scene }
  },
};

export const exporters = {
  '.stl': {
    name: 'STereoLithography',
    module: 'three/examples/jsm/exporters/STLExporter.js',
    className: 'STLExporter',
    apiStyle: 'sync',
    defaultOptions: { binary: true },
  },
  '.obj': {
    name: 'Wavefront OBJ',
    module: 'three/examples/jsm/exporters/OBJExporter.js',
    className: 'OBJExporter',
    apiStyle: 'sync',
    defaultOptions: {},
  },
  '.gltf': {
    name: 'glTF',
    module: 'three/examples/jsm/exporters/GLTFExporter.js',
    className: 'GLTFExporter',
    apiStyle: 'async',
    defaultOptions: {},
  },
  '.glb': {
    name: 'glTF Binary',
    module: 'three/examples/jsm/exporters/GLTFExporter.js',
    className: 'GLTFExporter',
    apiStyle: 'async',
    defaultOptions: { binary: true },
  },
  '.ply': {
    name: 'Polygon File Format',
    module: 'three/examples/jsm/exporters/PLYExporter.js',
    className: 'PLYExporter',
    apiStyle: 'callback',
    defaultOptions: {},
  },
  '.dae': {
    name: 'Collada',
    module: 'three/examples/jsm/exporters/ColladaExporter.js',
    className: 'ColladaExporter',
    apiStyle: 'callback',
    defaultOptions: {},
  },
};

export function getSupportedInputExtensions() {
  return Object.keys(loaders);
}

export function getSupportedOutputExtensions() {
  return Object.keys(exporters);
}

export function getLoaderConfig(ext) {
  const key = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return loaders[key] || null;
}

export function getExporterConfig(ext) {
  const key = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return exporters[key] || null;
}
