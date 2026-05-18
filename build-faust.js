import { FaustCompiler, FaustMonoDspGenerator } from "@grame/faustwasm";
import * as fs from "fs";

async function build() {
    const dspCode = fs.readFileSync("src/audio/engine.dsp", "utf-8");
    const compiler = new FaustCompiler(null); // Actually FaustCompiler is initialized differently in faustwasm? 
    console.log("Not sure if this will work");
}
