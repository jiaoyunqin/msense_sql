import { directoryBlocks } from "./report-directory-data.js";
import "./report-directory.css";

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const pencil = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></svg>';
const grip = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.25"/><circle cx="11" cy="3" r="1.25"/><circle cx="5" cy="8" r="1.25"/><circle cx="11" cy="8" r="1.25"/><circle cx="5" cy="13" r="1.25"/><circle cx="11" cy="13" r="1.25"/></svg>';
const action = (scope, name, label, id = "", disabled = false) =>
  `<button type="button" data-rd-action="${name}" data-rd-scope="${scope}" data-rd-id="${esc(id)}" ${disabled ? "disabled" : ""}>${label}</button>`;
const dragHandle = (id, label, group = false) =>
  `<button type="button" class="rd-drag-handle" draggable="true" data-rd-drag-id="${esc(id)}" data-rd-drag-kind="${group ? "group" : "entry"}"
    aria-label="拖动调整${esc(label)}${group ? "顺序" : "顺序与分组"}" title="${group ? "拖动调整分组顺序；也可用上下方向键" : "拖动调整顺序与分组；上下方向键排序，右方向键归组，左方向键移出分组"}">${grip}</button>`;
const rootDrop = (block, position) => `<div class="rd-root-drop" data-rd-drop-id="${esc(block.id)}" data-rd-drop-kind="${block.group ? "group" : "entry"}" data-rd-drop-position="${position}" aria-hidden="true"><span>放在这里，作为一级章节</span></div>`;

export function directoryNameHTML(value, original, scope, field, id, extra = "") {
  const label = field === "group-title" ? "分组名称" : `${original}显示标题`;
  return `<div class="rd-name" data-rd-name="${esc(id)}">
    <span class="rd-name-text" title="${esc(value || original)}">${esc(value || original)}</span>${extra}
    <input hidden data-rd-field="${field}" data-rd-scope="${scope}" data-rd-id="${esc(id)}" data-rd-saved="${esc(value)}"
      value="${esc(value)}" placeholder="${esc(original)}" maxlength="${field === "group-title" ? 80 : 120}" aria-label="${esc(label)}">
    <button type="button" class="rd-icon rd-rename" data-rd-rename aria-label="编辑${esc(label)}" title="编辑名称">${pencil}</button>
    <div class="rd-name-confirm" hidden><button type="button" class="rd-icon" data-rd-rename-save aria-label="确认名称" title="确认">✓</button>
      <button type="button" class="rd-icon" data-rd-rename-cancel aria-label="取消改名" title="取消">×</button></div>
  </div>`;
}

export function beginDirectoryRename(name) {
  if (!name) return;
  const input = name.querySelector("input");
  input.value = input.dataset.rdSaved || input.placeholder;
  input.setCustomValidity("");
  name.classList.add("is-editing");
  input.hidden = false;
  name.querySelector(".rd-name-confirm").hidden = false;
  input.focus(); input.select();
}

function finishDirectoryRename(name, save) {
  const input = name.querySelector("input");
  if (save && input.dataset.rdField === "group-title" && !input.value.trim()) {
    input.setCustomValidity("请填写分组名称。"); input.reportValidity(); input.focus(); return false;
  }
  input.setCustomValidity("");
  name.classList.remove("is-editing");
  input.hidden = true; name.querySelector(".rd-name-confirm").hidden = true;
  if (save) {
    input.value = input.value.trim();
    if (input.dataset.rdField === "entry-title" && input.value === input.placeholder) input.value = "";
    input.dataset.rdSaved = input.value;
    input.dispatchEvent(new input.ownerDocument.defaultView.CustomEvent("rd-rename", { bubbles: true }));
  } else input.value = input.dataset.rdSaved;
  name.querySelector("[data-rd-rename]")?.focus({ preventScroll: true });
  return true;
}

export function commitDirectoryNames(container) {
  for (const name of container?.querySelectorAll(".rd-name.is-editing") || [])
    if (!finishDirectoryRename(name, true)) return false;
  return true;
}

export function directoryNameEvent(event) {
  const name = event.target.closest(".rd-name");
  if (!name) return false;
  if (event.type === "click") {
    if (event.target.closest("[data-rd-rename]")) {
      if (commitDirectoryNames(name.closest(".mt-modules,.rd-dialog"))) beginDirectoryRename(name);
    }
    else if (event.target.closest("[data-rd-rename-save]")) finishDirectoryRename(name, true);
    else if (event.target.closest("[data-rd-rename-cancel]")) finishDirectoryRename(name, false);
    else return false;
  } else if (event.type === "keydown" && event.target.matches("input") && !event.isComposing && ["Enter", "Escape"].includes(event.key)) {
    finishDirectoryRename(name, event.key === "Enter");
  } else return false;
  event.preventDefault(); event.stopPropagation();
  return true;
}

export function syncDirectoryNames(container, directory, items) {
  const defaults = new Map(items.map(item => [item.id, item.title]));
  container.querySelectorAll(".rd-name").forEach(name => {
    const input = name.querySelector("input"), group = input.dataset.rdField === "group-title";
    const item = (group ? directory.groups : directory.entries).find(item => item.id === input.dataset.rdId);
    if (!item) return;
    const title = item.title || defaults.get(item.id) || "未命名分组";
    name.querySelector(".rd-name-text").textContent = title;
    name.querySelector(".rd-name-text").title = title;
    input.dataset.rdSaved = item.title;
    if (!name.classList.contains("is-editing")) input.value = item.title;
  });
}

export function directoryEditorHTML(directory, items, scope, hasSummary = true) {
  const defaults = new Map(items.map(item => [item.id, item.title]));
  const blocks = directoryBlocks(directory, true);
  const entryHTML = entry => `<div class="rd-entry" data-rd-entry="${esc(entry.id)}">${dragHandle(entry.id, defaults.get(entry.id))}
    ${directoryNameHTML(entry.title, defaults.get(entry.id), scope, "entry-title", entry.id)}
    </div>`;
  return `<div class="rd-editor" data-rd-editor="${scope}"><div class="rd-editor-top"><p>拖动章节调整顺序和分组，点击铅笔改名。</p>${action(scope, "add-group", "+ 新增分组")}</div>
    <div class="rd-workspace"><div class="rd-structure">
    <div class="rd-pinned"><span aria-hidden="true">◈</span><strong>${hasSummary ? "实验核心结论" : "报告表头"}</strong><small>固定在报告开头</small></div>
    <div class="rd-blocks">${blocks.map((block, index) => `<div class="rd-root-block">${rootDrop(block, "before")}${block.group ? `<section class="rd-group" data-rd-group="${esc(block.id)}"><header>${dragHandle(block.id, block.title || "分组", true)}${directoryNameHTML(block.title, "未命名分组", scope, "group-title", block.id)}${action(scope, "remove-group", '<span aria-hidden="true">×</span><span class="rd-sr">删除分组</span>', block.id)}</header>
      ${block.entries.length ? block.entries.map(entryHTML).join("") : '<p class="rd-empty">拖入章节到此分组</p>'}</section>` : entryHTML(block.entries[0])}${index === blocks.length - 1 ? rootDrop(block, "after") : ""}</div>`).join("") || '<p class="rd-empty">添加模块后可设置目录</p>'}</div>
    </div>
    <div class="rd-preview"><strong>目录预览</strong><ol>${hasSummary ? "<li>实验核心结论</li>" : ""}${blocks.filter(block => block.entries.length).map(block => block.group
      ? `<li>${esc(block.title || "未命名分组")}<ol>${block.entries.map(entry => `<li>${esc(entry.title || defaults.get(entry.id))}</li>`).join("")}</ol></li>`
      : `<li>${esc(block.entries[0].title || defaults.get(block.id))}</li>`).join("")}</ol></div></div></div>`;
}

export function reportDirectoryHeaderHTML(editable = false) {
  return `<header class="rd-toc-header"><strong>目录</strong>${editable
    ? `<button type="button" class="rd-toc-edit" data-rd-open="directory" aria-label="编辑目录与章节" aria-haspopup="dialog" title="编辑目录与章节">${pencil}<span>编辑</span></button>`
    : ""}</header>`;
}

export function reportDirectoryDialogHTML(draft, items, errors = [], hasSummary = true) {
  return `<div class="rd-overlay" data-rd-modal><div class="rd-backdrop" data-rd-close></div>
    <section class="rd-dialog" role="dialog" aria-modal="true" aria-labelledby="rd-dialog-title" tabindex="-1"><header><div><h2 id="rd-dialog-title">编辑目录章节</h2><p>保存后同步更新目录和正文。</p></div><button type="button" data-rd-close aria-label="关闭目录编辑">×</button></header>
      <div class="rd-dialog-body">${errors.length ? `<div class="rd-errors" role="alert">${errors.map(error => `<p>${esc(error)}</p>`).join("")}</div>` : ""}
        <label class="rd-report-title"><span>报告标题</span><input data-rd-report-title value="${esc(draft.reportTitle)}" maxlength="160"></label>
        ${directoryEditorHTML(draft.directory, items, "report", hasSummary)}</div>
      <footer><span>仅修改本报告的展示</span><button type="button" data-rd-close>取消</button><button type="button" class="rd-primary" data-rd-save>保存修改</button></footer></section></div>`;
}
