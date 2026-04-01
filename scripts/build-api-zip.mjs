/**
 * Writes public/api.zip from integration-client + docs.
 * Run via prebuild (npm run build) and before next dev so /api.zip is always fresh.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public");
const outFile = path.join(outDir, "api.zip");

fs.mkdirSync(outDir, { recursive: true });

const output = fs.createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

await new Promise((resolve, reject) => {
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);

  const readme = path.join(root, "integration-client", "README_NOTE.md");
  if (fs.existsSync(readme)) {
    archive.file(readme, { name: "README_NOTE.md" });
  }
  const aovDir = path.join(root, "integration-client", "aovpro-files");
  if (fs.existsSync(aovDir)) {
    for (const name of fs.readdirSync(aovDir)) {
      const fp = path.join(aovDir, name);
      if (fs.statSync(fp).isFile()) {
        archive.file(fp, { name: `aovpro-files/${name}` });
      }
    }
  }
  for (const doc of ["imgui-integration.md", "imgui-license-gate-example.cpp"]) {
    const fp = path.join(root, "docs", doc);
    if (fs.existsSync(fp)) {
      archive.file(fp, { name: `docs/${doc}` });
    }
  }

  void archive.finalize();
});

// eslint-disable-next-line no-console -- build script
console.log(`[build-api-zip] ${outFile} (${archive.pointer()} bytes)`);
