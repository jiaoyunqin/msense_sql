import { directoryBlocks, moveDirectory, placeDirectory } from "./report-directory-data.js";
import { commitDirectoryNames } from "./report-directory-ui.js";

const drags = new WeakMap();
const marks = ".rd-dragging,.rd-drop-before,.rd-drop-after,.rd-drop-inside";
function clearDrag(container) {
  const drag = drags.get(container);
  drag?.editor.querySelectorAll(marks).forEach(element =>
    element.classList.remove("rd-dragging", "rd-drop-before", "rd-drop-after", "rd-drop-inside"));
  drag?.editor.classList.remove("rd-drag-active");
  drags.delete(container);
}
const focusSelector = (id, group) => `[data-rd-drag-id="${CSS.escape(id)}"][data-rd-drag-kind="${group ? "group" : "entry"}"]`;

// Return null for unrelated events; only a completed drop or keyboard move changes data.
export function directoryReorderEvent(event, container, directory) {
  const handle = event.target.closest("[data-rd-drag-id]");
  if (event.type === "keydown") {
    if (event.key === "Escape" && drags.has(container)) {
      clearDrag(container); event.preventDefault(); event.stopPropagation(); return { changed: false };
    }
    if (!handle || handle.disabled || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) || event.isComposing) return null;
    event.preventDefault(); event.stopPropagation();
    if (!commitDirectoryNames(container)) return { changed: false };
    const id = handle.dataset.rdDragId, group = handle.dataset.rdDragKind === "group";
    let changed = false;
    if (["ArrowUp", "ArrowDown"].includes(event.key)) changed = moveDirectory(directory, id, event.key === "ArrowUp" ? -1 : 1, group);
    else if (!group) {
      const entry = directory.entries.find(entry => entry.id === id);
      if (event.key === "ArrowLeft" && entry?.groupId) {
        changed = placeDirectory(directory, { id }, { id: entry.groupId, group: true, position: "after" });
      } else if (event.key === "ArrowRight" && entry && !entry.groupId) {
        const blocks = directoryBlocks(directory, true), index = blocks.findIndex(block => !block.group && block.id === id);
        const parent = blocks.slice(0, index).reverse().find(block => block.group) || blocks.slice(index + 1).find(block => block.group);
        if (parent) changed = placeDirectory(directory, { id }, { id: parent.id, group: true, position: "inside" });
      }
    }
    return { changed, focus: focusSelector(id, group) };
  }
  if (event.type === "dragend") {
    if (!drags.has(container)) return null;
    clearDrag(container); return { changed: false };
  }
  if (event.type === "dragstart") {
    if (!handle) return null;
    if (handle.disabled || !commitDirectoryNames(container)) { event.preventDefault(); return { changed: false }; }
    clearDrag(container);
    const group = handle.dataset.rdDragKind === "group";
    const editor = handle.closest(".rd-editor");
    const row = handle.closest(group ? ".rd-group" : ".rd-entry");
    drags.set(container, { editor, row, id: handle.dataset.rdDragId, group });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-msense-directory", handle.dataset.rdDragId);
    event.dataTransfer.setData("text/plain", handle.dataset.rdDragId);
    const ghost = group ? row.querySelector("header") : row;
    event.dataTransfer.setDragImage?.(ghost, 12, ghost.getBoundingClientRect().height / 2);
    row.classList.add("rd-dragging");
    editor.classList.add("rd-drag-active");
    event.stopPropagation();
    return { changed: false };
  }
  const drag = drags.get(container);
  if (!drag) return null;
  drag.editor.querySelectorAll(".rd-drop-before,.rd-drop-after,.rd-drop-inside").forEach(element =>
    element.classList.remove("rd-drop-before", "rd-drop-after", "rd-drop-inside"));
  if (event.target.closest(".rd-editor") !== drag.editor) return { changed: false };
  if (event.type === "dragleave") return { changed: false };
  const rootDrop = event.target.closest("[data-rd-drop-id]");
  let row = rootDrop || event.target.closest(".rd-entry,.rd-group");
  if (!row) return { changed: false };
  if (drag.group && !rootDrop) row = row.closest(".rd-group") || row;
  const group = rootDrop ? row.dataset.rdDropKind === "group" : row.matches(".rd-group");
  const id = rootDrop ? row.dataset.rdDropId : group ? row.dataset.rdGroup : row.dataset.rdEntry;
  if (id === drag.id || drag.group && drag.row.contains(row)) return { changed: false };
  const bounds = row.getBoundingClientRect();
  const position = rootDrop ? row.dataset.rdDropPosition : group && !drag.group ? "inside"
    : event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
  event.preventDefault(); event.stopPropagation();
  if (event.type === "dragenter" || event.type === "dragover") {
    event.dataTransfer.dropEffect = "move";
    row.classList.add(`rd-drop-${position}`);
    if (!rootDrop && !drag.group && !group) row.closest(".rd-group")?.classList.add("rd-drop-inside");
    const scroll = drag.editor.closest(".rd-dialog-body");
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      scroll.scrollTop += event.clientY < rect.top + 32 ? -16 : event.clientY > rect.bottom - 32 ? 16 : 0;
    }
    return { changed: false };
  }
  if (event.type !== "drop") return { changed: false };
  const changed = placeDirectory(directory, { id: drag.id, group: drag.group }, { id, group, position });
  clearDrag(container);
  return { changed, focus: focusSelector(drag.id, drag.group) };
}
