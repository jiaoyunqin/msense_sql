import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const output = path.join(root, "deliverables/msense-sql-prototype-v3/msense-sql-composer.html");
const html = await fs.readFile(path.join(dist, "index.html"), "utf8");
const entry = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/);
if (!entry || !style) throw new Error("无法识别构建入口，请先运行 npm run build。");

const asset = (url) => path.join(dist, url.replace(/^\//, ""));
let javascript = await fs.readFile(asset(entry[1]), "utf8");
const css = await fs.readFile(asset(style[1]), "utf8");
const workerURL = /new Worker\(new URL\("([^"]*\/sql-worker-[^"]+\.js)",import\.meta\.url\),\{type:"module"\}\)/g;
const workers = [...javascript.matchAll(workerURL)];
if (workers.length !== 1) throw new Error("SQL Worker 构建格式变化，停止导出以避免生成不可运行文件。");
const worker = await fs.readFile(asset(workers[0][1]), "utf8");
if (!worker.trimStart().startsWith("(function()")) throw new Error("离线导出要求 Vite 的自包含 IIFE Worker 构建。");
// Bundled IIFE workers need no module imports. A classic Blob worker also loads
// under Chrome's file:// opaque origin, where a module worker is rejected.
javascript = javascript.replace(workerURL, () => `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:"text/javascript"})))`);
if (/\bimport\s*\(|\/assets\//.test(javascript)) throw new Error("仍有独立资源引用，不能导出为单文件。");

// HTML parses a closing script token even inside JavaScript string literals.
const safeScript = javascript.replace(/<\/script/gi, "<\\/script");
const safeStyle = css.replace(/<\/style/gi, "<\\/style");
const offline = html
  .replace(entry[0], "")
  .replace(style[0], () => `<style>${safeStyle}</style>`)
  .replace("</body>", () => `<script type="module">${safeScript}</script>\n</body>`);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, offline);
console.log(`已导出 ${path.relative(root, output)} · ${Buffer.byteLength(offline).toLocaleString()} bytes`);
