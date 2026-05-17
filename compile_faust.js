import { FaustCompiler, FaustMonoDspGenerator } from '@grame/faustwasm';
import fs from 'fs';
import path from 'path';

async function compileFaust() {
  const dspCode = fs.readFileSync('src/audio/engine.dsp', 'utf8');
  
  const compiler = new FaustCompiler();
  const generator = new FaustMonoDspGenerator();
  await generator.compile(compiler, 'engine', dspCode, '');
  
  const factory = generator.getFactory();
  if (factory) {
     const wasmBuffer = Buffer.from(factory.code);
     fs.writeFileSync('public/faust/dsp-module.wasm', wasmBuffer);
     fs.writeFileSync('public/faust/dsp-meta.json', factory.json);
     console.log("Written successfully to public/faust");
  } else {
     console.error("Failed to generate factory");
  }
}

compileFaust();