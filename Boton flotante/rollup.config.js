import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { tampermonkeyHeader } from './src/config/tampermonkey.js';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/chess_button_analyzer.js',
    format: 'iife',
    banner: tampermonkeyHeader + '\n'
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    terser({
      compress: {
        drop_console: true,
        keep_fnames: false
      },
      format: {
        beautify: false,
        comments: /==\/?UserScript==|^ @/
      }
    })
  ]
};
