const path = require('path');

import pkg from './package.json'
import { terser } from "rollup-plugin-terser"


export default {
  input: path.resolve(__dirname, 'lib/index.js'), // __dirname指的是当前文件所在文件夹的绝对路径。

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
