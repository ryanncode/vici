import fs from 'fs';
import * as faustwasm from './node_modules/@grame/faustwasm/dist/cjs/index.js';

const { instantiateFaustModuleFromFile, LibFaust, FaustCompiler, FaustMonoDspGenerator } = faustwasm;

async function compile() {
    console.log("Instantiating Faust module...");
    const faustModule = await instantiateFaustModuleFromFile('./node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js');
    const libFaust = new LibFaust(faustModule);
    const compiler = new FaustCompiler(libFaust);
    const generator = new FaustMonoDspGenerator();
    
    console.log("Compiling engine.dsp...");
    const dspCode = fs.readFileSync('src/audio/engine.dsp', 'utf8');
    
    await generator.compile(compiler, "engine", dspCode, "");
    const factory = generator.factory;
    
    if (!factory) {
        console.error("Failed to compile DSP:", compiler.getErrorMessage());
        process.exit(1);
    }
    
    const wasm = factory.wasm;
    const meta = factory.json;
    
    fs.mkdirSync('public/faust', { recursive: true });
    fs.writeFileSync('public/faust/dsp-module.wasm', Buffer.from(wasm));
    fs.writeFileSync('public/faust/dsp-meta.json', meta);
    
    console.log("Successfully compiled to public/faust/dsp-module.wasm and dsp-meta.json");
}

compile().catch(console.error);


