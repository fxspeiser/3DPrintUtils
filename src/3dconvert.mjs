import { fbxToStl } from './converters/fbx2stl.mjs';

(async () => {
  const inputFilePath = process.argv[2];
  const outputFilePath = inputFilePath.replace(/\.fbx$/, '.stl');

  try {
    await fbxToStl(inputFilePath, outputFilePath);
    console.log(`STL file saved to: ${outputFilePath}`);
  } catch (error) {
    console.error(`Error converting FBX to STL: ${error.message}`);
  }
})();
