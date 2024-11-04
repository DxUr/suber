import { readFileSync } from "fs";
import SupParser from "../src/sup_parser";


const buff = readFileSync("test/subtitles.sup");

const parser = new SupParser(buff.buffer);

while (true) {
    const packet = parser.getNext();
    if (!packet) break;
    console.log(packet);
}

