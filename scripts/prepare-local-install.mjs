import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const stamp = `${Date.now()}-${process.pid}`;
const stageRoot = path.join(root, ".local-install", `${pkg.version}-${stamp}`);
await mkdir(stageRoot, { recursive: true });
for (const entry of ["dist", "package.json", "README.md", "LICENSE"]) {
  await cp(path.join(root, entry), path.join(stageRoot, entry), { recursive: true });
}
await writeFile(path.join(stageRoot, ".staged-from"), `${root}\n`, "utf8");
process.stdout.write(stageRoot + "\n");
