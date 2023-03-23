# 3DConvert

A command-line tool for converting 3D models between various formats. This tool uses the Three.js library to load and manipulate 3D models. Lots of new projects are using FBX format, but the world, especially the developing world has STL printers in operation. In a pinch - you may find success in using this utility to port FBX files to STL. Be advised that color instructions and some other features may be lost in the translation. 

Your mileage may vary, but I needed to use `node --experimental-specifier-resolution=node` as a prefix to the script name to make sure the pathing held up during execution. 

## Installation

1. Install Node.js from https://nodejs.org/
2. Clone this repository or download the zip file and extract it to a directory of your choice.
3. Open a terminal or command prompt in the `src` directory.
4. Run `npm install` to install the required dependencies.

## Usage

`node 3dconvert.mjs <input_file> [options]`

### Arguments

- `input_file` (required): The path to the input file. The file format is determined by the file extension.
- `options` (optional): Additional options to control the conversion process. See below for a list of available options.

### Options

- `-o <output_file>`: The path to the output file. The file format is determined by the file extension. If this option is not specified, the output will be saved to a file with the same name as the input file, but with a different file extension.
- `-t <output_format>`: The format to convert the input file to. Valid formats are `stl` (STereoLithography) and `obj` (Wavefront OBJ). If this option is not specified, the output format will be determined by the file extension of the output file.
- `-b <background_color>`: The background color of the output file in hexadecimal format (e.g. `#ffffff` for white). If this option is not specified, the background color will be black.

### Examples

Convert an FBX file to an STL file:

`node --experimental-specifier-resolution=node 3dconvert.mjs input.fbx -t stl -o output.stl`

Convert an OBJ file to an STL file with a white background:

`node --experimental-specifier-resolution=node 3dconvert.mjs input.obj -t stl -o output.stl -b #ffffff`

## License

MIT License. See `LICENSE.txt` for more information.


