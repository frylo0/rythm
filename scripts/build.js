const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawn } = require("child_process");

const root = process.cwd();
const vendorDir = path.join(root, "public", "vendor");
const iconDir = path.join(root, "public", "icons");
const requiredVendorFiles = [
  path.join(vendorDir, "bootstrap", "bootstrap.min.css"),
  path.join(vendorDir, "bootstrap-icons", "bootstrap-icons.min.css"),
  path.join(vendorDir, "bootstrap-icons", "fonts", "bootstrap-icons.woff2")
];

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function assertFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing vendor file: ${path.relative(root, filePath)}. Commit public/vendor or restore Bootstrap assets before building.`);
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function readClientManifest() {
  const manifestPath = path.join(root, "public", "assets", ".vite", "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const entry = manifest["src/client/main.ts"];
  if (!entry || !entry.file) {
    throw new Error("Vite manifest does not contain src/client/main.ts entry.");
  }
  return { manifest, entry };
}

function collectManifestAssets(manifest, entry) {
  const files = new Set();
  const visit = (chunk) => {
    if (!chunk) return;
    if (chunk.file) files.add(`/assets/${chunk.file}`);
    (chunk.css || []).forEach((file) => files.add(`/assets/${file}`));
    (chunk.assets || []).forEach((file) => files.add(`/assets/${file}`));
    (chunk.imports || []).forEach((key) => visit(manifest[key]));
    (chunk.dynamicImports || []).forEach((key) => visit(manifest[key]));
  };
  visit(entry);
  return Array.from(files).sort();
}

async function updateIndexHtml(entry) {
  const indexPath = path.join(root, "public", "index.html");
  const templatePath = path.join(root, "public", "index.template.html");
  const css = (entry.css || []).map((file) => `/assets/${file}`);
  const js = `/assets/${entry.file}`;
  const source = await fs.readFile(templatePath, "utf8");
  await fs.writeFile(
    indexPath,
    source
      .replace("    <!-- RYTHM_CLIENT_CSS -->", css.map((href) => `    <link rel="stylesheet" href="${href}">`).join("\n"))
      .replace("    <!-- RYTHM_CLIENT_JS -->", `    <script type="module" src="${js}"></script>`)
  );
}

async function updateServiceWorkerVersion(clientAssets) {
  const swPath = path.join(root, "public", "sw.js");
  const templatePath = path.join(root, "public", "sw.template.js");
  const shellAssets = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/vendor/bootstrap/bootstrap.min.css",
    "/vendor/bootstrap-icons/bootstrap-icons.min.css",
    "/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2",
    "/vendor/bootstrap-icons/fonts/bootstrap-icons.woff",
    "/icons/icon-32.png",
    ...clientAssets,
    "/icons/icon-192.png",
    "/icons/icon-512.png"
  ];
  const hashSource = crypto.createHash("sha256");
  for (const asset of shellAssets) {
    hashSource.update(asset);
    if (asset === "/") continue;
    hashSource.update(await fs.readFile(path.join(root, "public", asset)));
  }
  const hash = hashSource.digest("hex").slice(0, 12);
  const source = await fs.readFile(templatePath, "utf8");
  await fs.writeFile(
    swPath,
    source
      .replace("__RYTHM_CACHE_NAME__", `rythm-shell-${hash}`)
      .replace("__RYTHM_ASSETS__", JSON.stringify(shellAssets, null, 2))
  );
}

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mixColor(a, b, t) {
  return [
    mix(a[0], b[0], t),
    mix(a[1], b[1], t),
    mix(a[2], b[2], t),
    mix(a[3], b[3], t)
  ];
}

function setPixel(row, x, color) {
  const offset = 1 + x * 4;
  row[offset] = color[0];
  row[offset + 1] = color[1];
  row[offset + 2] = color[2];
  row[offset + 3] = color[3];
}

function createIcon(size) {
  const rows = [];
  const ink = [248, 250, 252, 255];
  const dark = [17, 24, 39, 255];
  const blue = [37, 99, 235, 255];
  const teal = [15, 118, 110, 255];
  const corner = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const rx = x < corner ? corner - x : x > size - corner ? x - (size - corner) : 0;
      const ry = y < corner ? corner - y : y > size - corner ? y - (size - corner) : 0;
      const outside = Math.sqrt(rx * rx + ry * ry) > corner;
      let color = [0, 0, 0, 0];

      if (!outside) {
        const diagonal = (x + y) / (size * 2);
        color = diagonal < 0.52
          ? mixColor(dark, blue, diagonal / 0.52)
          : mixColor(blue, teal, (diagonal - 0.52) / 0.48);

        const glow = Math.max(0, 1 - Math.sqrt((x / size) ** 2 + (y / size) ** 2) * 1.75);
        color = mixColor(color, [255, 255, 255, 255], glow * 0.16);
      }

      const stem = x >= size * 0.30 && x <= size * 0.41 && y >= size * 0.26 && y <= size * 0.76;
      const shoulder = x >= size * 0.38 && x <= size * 0.66 && y >= size * 0.26 && y <= size * 0.38;
      const bowl = x >= size * 0.57 && x <= size * 0.69 && y >= size * 0.34 && y <= size * 0.52;
      const notch = x >= size * 0.48 && x <= size * 0.58 && y >= size * 0.43 && y <= size * 0.53;
      const leg = x >= size * 0.46 && x <= size * 0.59 && y >= size * 0.48 && y <= size * 0.59 && x - size * 0.46 > (y - size * 0.48) * 0.45;

      if (!outside && (stem || shoulder || bowl || leg) && !notch) {
        color = ink;
      }

      setPixel(row, x, color);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

async function main() {
  await fs.mkdir(vendorDir, { recursive: true });
  await fs.mkdir(iconDir, { recursive: true });
  await Promise.all(requiredVendorFiles.map(assertFile));
  await run(path.join(root, "node_modules", ".bin", "vite"), ["build"]);
  const { manifest, entry } = await readClientManifest();
  const clientAssets = collectManifestAssets(manifest, entry);
  await updateIndexHtml(entry);
  await updateServiceWorkerVersion(clientAssets);
  await fs.writeFile(path.join(iconDir, "icon-32.png"), createIcon(32));
  await fs.writeFile(path.join(iconDir, "icon-192.png"), createIcon(192));
  await fs.writeFile(path.join(iconDir, "icon-512.png"), createIcon(512));
  console.log("Built Svelte client and PWA icons.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
