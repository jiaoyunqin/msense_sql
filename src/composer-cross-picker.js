const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// A single shared popover keeps the selection panel stable while its row updates.
export function createCrossDimensionPicker({ root, shell, getState, onChange, onError = () => {}, limit = 3 }) {
  const panel = document.createElement("div");
  panel.id = "cross-dimension-options";
  panel.className = "c-cross-options";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "选择交叉维度");
  panel.hidden = true;
  const nativePopover = typeof panel.showPopover === "function";
  if (nativePopover) panel.setAttribute("popover", "auto");
  shell.append(panel);
  let activeId = "", query = "", positionFrame = 0;
  const trigger = (id = activeId) => root.querySelector(`[data-action="single-cross-select"][data-id="${CSS.escape(id)}"]`);
  const expanded = (value) => trigger()?.setAttribute("aria-expanded", String(value));

  function close(restoreFocus = true) {
    const button = trigger();
    expanded(false);
    activeId = "";
    query = "";
    if (nativePopover && panel.matches(":popover-open")) panel.hidePopover();
    panel.hidden = true;
    if (restoreFocus && button?.isConnected && !button.disabled) button.focus({ preventScroll: true });
  }
  function position() {
    if (!activeId || panel.hidden) return;
    const anchor = trigger()?.closest(".c-cross-select");
    if (!anchor) { close(false); return; }
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { close(false); return; }
    const width = Math.min(Math.max(rect.width, 280), 520, window.innerWidth - 24);
    const below = window.innerHeight - rect.bottom - 18, above = rect.top - 18;
    const flip = below < 260 && above > below;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.min(380, Math.max(140, flip ? above : below), window.innerHeight - 24)}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(flip ? rect.top - height - 6 : rect.bottom + 6, window.innerHeight - height - 12))}px`;
  }
  function filterOptions() {
    const needle = query.trim().toLocaleLowerCase("zh-CN");
    const options = [...panel.querySelectorAll(".c-cross-option")];
    options.forEach((option) => { option.hidden = !option.dataset.search.includes(needle); });
    panel.querySelector(".c-cross-options-empty").hidden = options.some((option) => !option.hidden);
    position();
  }
  function refresh() {
    if (!activeId) return;
    const state = getState(activeId);
    if (!state || state.disabled || !trigger()) { close(false); return; }
    const focus = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusedKey = focus?.dataset.crossOption, searchFocused = focus?.classList.contains("c-cross-options-search");
    const selected = state.selected.filter(Boolean), full = selected.length >= limit;
    panel.innerHTML = `<header class="c-cross-options-header"><input class="c-cross-options-search" type="search" aria-label="搜索交叉维度" placeholder="搜索维度名称或 Key" value="${esc(query)}" autocomplete="off"></header>
      <div class="c-cross-options-list" role="group" aria-label="可选维度">${state.options.map((option) => {
        const checked = selected.includes(option.key);
        return `<label class="c-cross-option" data-search="${esc([option.name, option.key, option.description || ""].join(" ").toLocaleLowerCase("zh-CN"))}">
          <input type="checkbox" data-cross-option="${esc(option.key)}" ${checked ? "checked" : ""} ${full && !checked ? "disabled" : ""}>
          <span><strong>${esc(option.name)}</strong>${option.description ? `<small>${esc(option.description)}</small>` : ""}</span></label>`;
      }).join("")}<p class="c-cross-options-empty" hidden>没有匹配的维度</p></div>
      <footer><span class="c-cross-options-status" role="status" aria-live="polite">${full ? `已选 ${selected.length} 项，已达上限` : `已选 ${selected.length} 项，最多 ${limit} 项`}</span><button type="button" class="p-button link" data-cross-done>完成</button></footer>`;
    expanded(true);
    filterOptions();
    if (searchFocused) panel.querySelector(".c-cross-options-search").focus({ preventScroll: true });
    else if (focusedKey) {
      panel.querySelector(`[data-cross-option="${CSS.escape(focusedKey)}"]:not(:disabled)`)?.focus({ preventScroll: true });
    }
  }
  function open(id, focusOptions = false) {
    if (activeId === id && !panel.hidden) { close(); return; }
    close(false);
    const state = getState(id);
    if (!state || state.disabled) return;
    activeId = id;
    refresh();
    panel.hidden = false;
    if (nativePopover) panel.showPopover();
    position();
    const first = focusOptions ? panel.querySelector('[data-cross-option]:not(:disabled)') : null;
    (first || panel.querySelector(".c-cross-options-search"))?.focus({ preventScroll: true });
  }
  panel.addEventListener("input", (event) => {
    if (!event.target.matches(".c-cross-options-search")) return;
    query = event.target.value;
    filterOptions();
  });
  panel.addEventListener("change", (event) => {
    const key = event.target.dataset.crossOption;
    if (!key || !activeId) return;
    const state = getState(activeId);
    if (!state || state.disabled) { close(false); return; }
    const selected = state.selected.filter(Boolean);
    const next = event.target.checked ? [...new Set([...selected, key])] : selected.filter((member) => member !== key);
    try {
      if (next.length > limit) throw new Error(`最多选择 ${limit} 个维度。`);
      onChange(activeId, next);
      refresh();
    } catch (error) {
      refresh();
      panel.querySelector(".c-cross-options-status").textContent = error.message;
    }
  });
  panel.addEventListener("click", (event) => { if (event.target.closest("[data-cross-done]")) close(); });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (event.target.matches(".c-cross-options-search") && event.key !== "ArrowDown") return;
    const options = [...panel.querySelectorAll(".c-cross-option:not([hidden]) input:not(:disabled)")];
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
    options[next].focus({ preventScroll: true });
  });
  panel.addEventListener("focusout", () => {
    setTimeout(() => {
      if (activeId && !panel.contains(document.activeElement) && !trigger()?.closest(".c-cross-select")?.contains(document.activeElement)) close(false);
    }, 0);
  });
  if (nativePopover) panel.addEventListener("toggle", (event) => { if (event.newState === "closed" && activeId) close(false); });
  document.addEventListener("pointerdown", (event) => {
    if (!activeId || panel.contains(event.target) || trigger()?.closest(".c-cross-select")?.contains(event.target)) return;
    close(false);
  });
  const reposition = () => {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(position);
  };
  window.addEventListener("resize", reposition);
  document.addEventListener("scroll", reposition, true);
  root.addEventListener("keydown", (event) => {
    const button = event.target.closest('[data-action="single-cross-select"]');
    if (!button || button.disabled) return;
    if (event.key === "ArrowDown") { event.preventDefault(); open(button.dataset.id, true); }
    if (event.key === "Escape" && activeId) { event.preventDefault(); close(); }
    if (event.key === "Backspace") {
      const state = getState(button.dataset.id), selected = state?.selected.filter(Boolean);
      if (state && !state.disabled && selected.length) {
        event.preventDefault();
        try {
          onChange(button.dataset.id, selected.slice(0, -1));
          trigger(button.dataset.id)?.focus({ preventScroll: true });
        } catch (error) { onError(error.message); }
      }
    }
  });
  return { open, close, refresh };
}
