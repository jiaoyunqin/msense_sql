import { publicationProgress } from "./composer-progress.js";

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const publishedTime = (value) => {
  const time = value ? new Date(value) : null;
  return time && !Number.isNaN(time.getTime()) ? time.toLocaleString("zh-CN", { hour12: false }) : "—";
};

export function createPublicationHistory(outlet) {
  let objectKey, objectType, open = false, generation = 0;

  function currentDetails() {
    const details = outlet.querySelector("details.c-publication-history");
    return details?.dataset.publicationHistory === String(generation) ? details : null;
  }

  outlet.addEventListener("toggle", (event) => {
    const details = currentDetails();
    // Detached or superseded nodes may still have a queued toggle event.
    if (details && event.target === details) open = details.open;
  }, true);

  outlet.addEventListener("keydown", (event) => {
    if (!["Enter", " ", "Spacebar"].includes(event.key)) return;
    const details = currentDetails(), summary = event.target.closest?.("summary");
    if (!details || summary?.parentElement !== details) return;
    event.preventDefault();
    if (event.repeat) return;
    details.open = !details.open;
    open = details.open;
  });

  function reset() {
    objectKey = undefined;
    objectType = undefined;
    open = false;
    generation++;
  }

  function render(obj, type, versionRowsHTML) {
    const key = obj.id ?? obj.key ?? obj;
    if (key === objectKey && type === objectType) {
      // Read before the caller replaces the old DOM, even before toggle fires.
      const details = currentDetails();
      if (details) open = details.open;
    } else {
      open = false;
    }
    objectKey = key;
    objectType = type;
    generation++;
    const progress = publicationProgress(obj);
    if (!progress.hasVersions) {
      open = false;
      return "";
    }
    return `<details class="c-publication-history" data-publication-history="${generation}"${open ? " open" : ""}><summary><span class="c-publication-title">发布记录 · ${progress.versionCount} 个版本</span><span class="c-publication-latest">最新 v${esc(progress.latestNumber ?? "—")} · ${esc(publishedTime(progress.publishedAt))}</span></summary><div class="c-publication-versions">${versionRowsHTML}</div></details>`;
  }

  return { render, reset };
}
