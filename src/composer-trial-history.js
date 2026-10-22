import { trialRuns, trialRecordStatus, trialRecordTime, trialExperiment } from "./composer-trial-records.js";

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function historyRows(obj) {
  return trialRuns(obj).map((run) => {
    const experiment = trialExperiment(run), label = experiment ? `实验 ${experiment}` : "实验未记录";
    const time = trialRecordTime(run), status = trialRecordStatus(run);
    const tone = run?.status === "success" ? "green" : run?.status === "running" ? "blue" : "amber";
    return `<article class="c-trial-history-entry"><div class="c-trial-history-identity"><i data-lucide="flask-conical" aria-hidden="true"></i><div><strong>${esc(label)}</strong><time>${esc(time)}</time></div></div><span class="p-badge ${tone}">${esc(status)}</span><button type="button" class="p-button link" data-action="view-trial-record" data-id="${esc(obj.id)}" data-run-id="${esc(run?.id ?? "")}" aria-label="${esc(`查看试跑记录 · ${label} · ${time}`)}">查看<i data-lucide="arrow-up-right" aria-hidden="true"></i></button></article>`;
  }).join("");
}

export function createTrialHistory(outlet) {
  let objectId, open = false, scroll = 0, generation = 0, revision = "", pendingFocus, pendingRestore = false;

  function currentDetails() {
    const details = outlet.querySelector("#ability-trial-history > details.c-trial-history");
    return details?.dataset.trialHistory === String(generation) && details.dataset.objectId === objectId ? details : null;
  }
  function remember() {
    const details = currentDetails();
    if (!details) return;
    open = details.open;
    details.querySelector("summary").setAttribute("aria-expanded", String(open));
    if (open && !pendingRestore) scroll = details.querySelector(".c-trial-history-list").scrollTop;
  }
  function focusKey(details) {
    const active = outlet.ownerDocument.activeElement;
    if (!details?.contains(active)) return undefined;
    return active.tagName === "SUMMARY" ? { summary: true } : { runId: active.dataset.runId };
  }
  function restoreFocus(details, key) {
    if (!key || !details.open && !key.summary) return;
    const button = key.runId === undefined ? null : [...details.querySelectorAll("[data-run-id]")]
      .find((candidate) => candidate.dataset.runId === key.runId);
    (button || details.querySelector("summary")).focus({ preventScroll: true });
  }
  function toggle(details) {
    remember();
    details.open = !details.open;
    remember();
  }

  outlet.addEventListener("toggle", (event) => {
    if (event.target === currentDetails()) remember();
  }, true);
  outlet.addEventListener("scroll", (event) => {
    if (event.target === currentDetails()?.querySelector(".c-trial-history-list")) remember();
  }, true);
  outlet.addEventListener("click", (event) => {
    const details = currentDetails(), summary = event.target.closest?.("summary");
    if (!details || summary?.parentElement !== details || event.button !== 0) return;
    event.preventDefault();
    toggle(details);
  });
  outlet.addEventListener("keydown", (event) => {
    if (!["Enter", " ", "Spacebar"].includes(event.key)) return;
    const details = currentDetails(), summary = event.target.closest?.("summary");
    if (!details || summary?.parentElement !== details) return;
    event.preventDefault();
    if (!event.repeat) toggle(details);
  });

  function reset() {
    objectId = undefined; open = false; scroll = 0; revision = ""; pendingFocus = undefined;
    pendingRestore = false;
    generation++;
  }
  function render(obj) {
    const id = String(obj.id);
    if (id === objectId) {
      remember();
      pendingFocus = focusKey(currentDetails());
    } else {
      reset();
      objectId = id;
    }
    generation++;
    const runs = trialRuns(obj);
    if (!runs.length) {
      open = false; scroll = 0; revision = ""; pendingFocus = undefined;
      return "";
    }
    const rows = historyRows(obj);
    revision = rows;
    pendingRestore = true;
    return `<details class="c-trial-history c-trial-history-config" data-object-id="${esc(id)}" data-trial-history="${generation}"${open ? " open" : ""}><summary aria-expanded="${open}"><span class="c-trial-history-title">试跑记录 · ${runs.length} 次</span></summary><p class="c-trial-history-scope">仅保存在当前模块，不进入用户侧报告列表。</p><div class="c-trial-history-list">${rows}</div></details>`;
  }
  function refresh(obj) {
    const target = outlet.querySelector("#ability-trial-history");
    // A catalog trial can run above a different owner's configuration page.
    if (!target || target.dataset.objectId !== String(obj.id)) return false;
    let details = currentDetails(), changed = false;
    if (!trialRuns(obj).length || !details) {
      const html = render(obj);
      if (target.innerHTML !== html) { target.innerHTML = html; changed = true; }
      details = currentDetails();
    } else {
      remember();
      const rows = historyRows(obj);
      if (rows !== revision) {
        const key = focusKey(details);
        details.querySelector(".c-trial-history-list").innerHTML = rows;
        details.querySelector(".c-trial-history-title").textContent = `试跑记录 · ${trialRuns(obj).length} 次`;
        revision = rows; changed = true;
        restoreFocus(details, key);
      }
    }
    if (details) {
      details.querySelector(".c-trial-history-list").scrollTop = scroll;
      restoreFocus(details, pendingFocus);
    }
    pendingRestore = false;
    pendingFocus = undefined;
    return changed;
  }
  return { render, reset, refresh };
}
