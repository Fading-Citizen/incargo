import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
mkdirSync('../logistica-1.0.0/panel-assets',{recursive:true});
await build({entryPoints:['src/main.tsx'],bundle:true,minify:true,format:'iife',target:['es2020'],outfile:'../logistica-1.0.0/panel-assets/panel.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
execFileSync('node_modules/.bin/tailwindcss',['-i','src/styles.css','-o','../logistica-1.0.0/panel-assets/panel.css','--minify'],{stdio:'inherit'});
