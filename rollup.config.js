const path = require('path');

import pkg from './package.json'
import { terser } from "rollup-plugin-terser"


export default {
  input: path.resolve(__dirname, 'lib/index.js'),

  plugins: [
    terser({ compress: {} })
  ],
  output: [
    {
      file: pkg.main,
      format: `esm`
    },
  ],
}
