import { readFileSync, writeFileSync } from "node:fs";
const f = "package.json";
let t = readFileSync(f, "utf8");
t = t.replace('"check:mirror-js": "npm --workspace apps/web run check:mirror-js",', '"check:mirror-js": "npm --workspace apps/web run check:mirror-js",\r\n    "check:no-element": "npm --workspace apps/web run check:no-element",');
t = t.replace('"build:release": "npm run typecheck:web && npm run check:api && npm run build:web"', '"build:release": "npm run typecheck:web && npm run check:no-element && npm run check:api && npm run build:web"');
writeFileSync(f, t, "utf8");
console.log(t.split("\n").filter(l => l.includes("no-element") || l.includes("build:release")).join("\n"));
