import { createIcons, icons } from "lucide";
import "./style.css";
import { mountComposer } from "./composer-ui.js";
import { businessGoal } from "./composer-data.js";

const capabilities = [
  {
    id: "experiment-config",
    title: "实验背景与配置",
    description:
      "查询实验基础信息、实验周期、业务目标、实验组与对照组、计划流量和营销配置。",
    metrics: [
      ["实验时间", "实验的开始日期和结束日期，格式为 YYYY-MM-DD 至 YYYY-MM-DD。"],
      ["实验流量", "当前实验组分配的流量比例，取值范围为 0 至 1。"],
      ["发券面额", "当前实验组配置的券面额或券包内容；多个券规则使用分号分隔。"],
      ["发券时效", "优惠券领取后的有效期规则。"],
      ["券可用范围", "优惠券允许使用的商品、店铺或平台范围。"],
      ["领取次数", "同一用户允许领取优惠券的次数限制。"],
      ["发券点位", "优惠券的投放入口；多个点位使用分号分隔。"]
    ],
    dimensions: []
  },
  {
    id: "pre-aa",
    title: "PreAA指标",
    description: "查看实验启动前的核心经营指标，辅助判断实验组与对照组是否均衡。",
    metrics: [
      ["PreAA GMV", "实验开始前观察窗口内的成交金额。"],
      ["PreAA 订单量", "实验开始前观察窗口内的支付订单数。"],
      ["PreAA 支付用户数", "实验开始前观察窗口内的支付用户数量。"]
    ],
    dimensions: ["实验分组"]
  },
  {
    id: "core-summary",
    title: "核心指标汇总",
    description: "汇总实验周期内的核心经营、转化与补贴指标。",
    metrics: [
      ["GMV", "实验周期内的成交金额。"],
      ["支付订单量", "实验周期内成功支付的订单数量。"],
      ["支付用户数", "实验周期内产生支付行为的去重用户数。"],
      ["补贴金额", "实验周期内产生的营销补贴总额。"]
    ],
    dimensions: ["实验分组"]
  },
  {
    id: "core-drilldown",
    title: "核心指标单维度下钻",
    description: "选择一个业务维度，下钻查看各实验组核心指标表现。",
    metrics: [
      ["GMV", "所选维度下的成交金额。"],
      ["支付订单量", "所选维度下的支付订单数。"],
      ["支付用户数", "所选维度下的支付用户数。"]
    ],
    dimensions: ["城市等级", "用户生命周期", "流量来源"]
  },
  {
    id: "coupon-overall",
    title: "领券核销整体情况",
    description: "查看优惠券领取、使用和核销转化的整体表现。",
    metrics: [
      ["领券用户数", "成功领取优惠券的去重用户数。"],
      ["核销用户数", "使用优惠券完成支付的去重用户数。"],
      ["核销率", "核销券张数占领取券张数的比例。"]
    ],
    dimensions: ["实验分组"]
  },
  {
    id: "coupon-drilldown",
    title: "领券核销单维度下钻",
    description: "按单一业务维度查看领券与核销表现。",
    metrics: [
      ["领券张数", "所选维度下成功领取的优惠券张数。"],
      ["核销张数", "所选维度下完成核销的优惠券张数。"],
      ["核销率", "所选维度下的优惠券核销比例。"]
    ],
    dimensions: ["券面额", "发券点位", "用户生命周期"]
  },
  {
    id: "next-month-repurchase",
    title: "次月复购",
    description: "观察实验用户在次月的购买与复购表现。",
    metrics: [
      ["次月支付用户数", "实验用户中次月产生支付行为的用户数。"],
      ["次月复购率", "次月支付用户占实验期支付用户的比例。"],
      ["次月人均 GMV", "次月支付用户的人均成交金额。"]
    ],
    dimensions: ["实验分组"]
  },
  {
    id: "coupon-interval",
    title: "领券核销间隔分布",
    description: "查看从领券到完成核销的时间间隔分布。",
    metrics: [
      ["当日核销", "领券当日完成核销的券张数。"],
      ["1-3 日核销", "领券后 1 至 3 日内完成核销的券张数。"],
      ["4 日及以上核销", "领券 4 日后完成核销的券张数。"]
    ],
    dimensions: ["实验分组"]
  },
  {
    id: "coupon-count",
    title: "领券/核销张数分布",
    description: "查看用户领取与核销优惠券张数的分布情况。",
    metrics: [
      ["领券张数分布", "按用户领取优惠券张数统计用户分布。"],
      ["核销张数分布", "按用户核销优惠券张数统计用户分布。"]
    ],
    dimensions: ["实验分组"]
  }
].map((capability) => ({ ...capability, sourceType: "builtin_rpc", goal: businessGoal }));

const sidebarGroups = [
  {
    label: "工作台",
    items: [
      ["chart-no-axes-combined", "实验分析"],
      ["history", "过往分析报告"]
    ]
  },
  {
    label: "管理端",
    items: [
      ["file-text", "实验报告模板"],
      ["flask-conical", "实验分析模块"],
      ["database", "取数能力", true]
    ]
  }
];

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" aria-label="主导航">
      <div class="sidebar-brand">
        <button class="brand-button" type="button">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-label">M-Sense</span>
          <i data-lucide="chevrons-up-down" class="brand-chevron"></i>
        </button>
      </div>

      <nav class="sidebar-nav">
        ${sidebarGroups
          .map(
            (group) => `
              <section class="nav-group">
                <div class="nav-label">${group.label}</div>
                <ul class="nav-list">
                  ${group.items
                    .map(
                      ([icon, label, active]) => `
                        <li>
                          <a class="nav-item ${active ? "active" : ""}" href="#" aria-current="${
                            active ? "page" : "false"
                          }">
                            <i data-lucide="${icon}"></i>
                            <span>${label}</span>
                          </a>
                        </li>
                      `
                    )
                    .join("")}
                </ul>
              </section>
            `
          )
          .join("")}
      </nav>

      <footer class="sidebar-footer">
        <span class="avatar" aria-hidden="true">秦</span>
        <button class="profile-button" type="button">
          <span class="profile-copy">
            <strong>秦娇芸</strong>
            <small>sheriqin.01@bytedance.com</small>
          </span>
          <i data-lucide="more-vertical"></i>
        </button>
      </footer>
    </aside>
    <button class="sidebar-scrim" type="button" aria-label="关闭侧栏"></button>

    <div class="workspace">
      <header class="topbar">
        <div class="topbar-start">
          <button class="icon-button sidebar-toggle" type="button" aria-label="切换侧栏" title="切换侧栏">
            <i data-lucide="panel-left"></i>
          </button>
          <button class="command-trigger" type="button">
            <i data-lucide="search"></i>
            <span>搜索</span>
            <kbd>⌘</kbd><kbd>J</kbd>
          </button>
        </div>
        <div class="c-topbar-tools">
          <button class="c-environment" type="button" data-action="environment" title="示例数据 · 仅当前浏览器保存">演示环境</button>
          <button class="theme-button" type="button" aria-label="切换主题" title="切换主题">
            <i data-lucide="moon"></i>
          </button>
        </div>
      </header>

      <main class="main-content">
        <section class="capability-page">
          <header class="page-header">
            <div>
              <h1>取数能力</h1>
              <p>按业务目标查看可用能力，选择指标和维度后可直接试跑。</p>
            </div>
            <span class="capability-count">
              <i data-lucide="database"></i>
              9 项能力
            </span>
          </header>

          <div class="catalog-toolbar">
            <label class="search-field toolbar-search">
              <i data-lucide="search"></i>
              <input id="catalog-search" type="search" aria-label="搜索能力名称、Key、指标或维度" placeholder="搜索能力名称、Key、指标或维度" />
            </label>
          </div>

          <div class="capability-list" id="capability-list"></div>
          <div class="empty-results" id="empty-results" hidden>
            未找到匹配的取数能力
          </div>
        </section>
      </main>
    </div>

    <div class="command-dialog" aria-hidden="true">
      <button class="dialog-backdrop" type="button" aria-label="关闭搜索"></button>
      <section class="command-panel" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <div class="command-input-row">
          <i data-lucide="search"></i>
          <input type="search" placeholder="搜索页面并快速跳转。" />
          <kbd>ESC</kbd>
        </div>
        <div class="command-body">
          <p id="command-title">全局搜索</p>
          <button type="button"><i data-lucide="database"></i><span>取数能力</span></button>
          <button type="button"><i data-lucide="flask-conical"></i><span>实验分析模块</span></button>
          <button type="button"><i data-lucide="file-text"></i><span>实验报告模板</span></button>
        </div>
      </section>
    </div>

    <div class="toast" role="status" aria-live="polite"></div>
  </div>
`;

const capabilityList = document.querySelector("#capability-list");
const catalogSelection = new Map();
const expansion = new Map([["experiment-config", true]]);
let prototype;

function renderCards() {
  capabilityList.innerHTML = capabilities
    .map((capability) => cardTemplate(capability, expansion.get(capability.id) || false))
    .join("");
  capabilityList.querySelectorAll(".capability-panel").forEach(updatePanelSelection);
  document.querySelector("#empty-results").hidden = capabilities.length > 0;
  createIcons({ icons });
}

function cardTemplate(capability, expanded) {
  return `
    <article class="capability-panel ${expanded ? "expanded" : ""}" data-capability-id="${
      capability.id
    }">
      <header class="capability-summary">
        <div class="c-catalog-heading">
          <button class="summary-button" type="button" aria-expanded="${expanded}">
            <span class="capability-type">取数能力</span>
            <strong title="${capability.title}">${capability.title}</strong>
            <span class="selected-summary">提供 ${capability.metrics.length} 个指标</span>
          </button>
          <div class="c-catalog-meta" aria-label="来源、版本和更新时间"></div>
        </div>
        <span class="summary-actions">
          <button class="outline-button expand-button" type="button" aria-expanded="${expanded}" aria-controls="details-${capability.id}">
            <i data-lucide="${expanded ? "chevron-up" : "eye"}"></i>
            <span>${expanded ? "收起" : "查看"}</span>
          </button>
          <span class="c-action-hint" tabindex="0" title="请先在查看中选择至少一个指标" aria-label="请先在查看中选择至少一个指标"><button class="outline-button run-button" type="button" disabled>
            <i data-lucide="flask-conical"></i>
            试跑
          </button></span>
        </span>
      </header>

      <div class="capability-content" id="details-${capability.id}" ${expanded ? "" : "hidden"}>
        <div class="capability-details">
          <p>${capability.description}</p>
          <dl class="selection-overview">
            <div>
              <dt>指标</dt>
              <dd class="overview-value">暂未选择指标</dd>
            </div>
          </dl>
        </div>

        <div class="selection-columns">
          <section class="selection-group metric-group">
            <header class="selection-group-header">
              <div>
                <h3>指标</h3>
                <span class="group-count">已选 0/${capability.metrics.length}</span>
              </div>
              <button class="select-all-button" type="button">全选</button>
            </header>
            <label class="search-field metric-search">
              <i data-lucide="search"></i>
              <input type="search" placeholder="搜索指标名称、Key 或口径" />
            </label>
            <div class="selection-grid">
              ${capability.metrics
                .map(
                  ([name, description]) => `
                    <label class="selection-option">
                      <input type="checkbox" value="${name}" ${(catalogSelection.get(capability.id)?.metrics || []).includes(name) ? "checked" : ""} />
                      <span class="checkbox-ui" aria-hidden="true"></span>
                      <span class="option-copy">
                        <strong>${name}</strong>
                        <small>${description}</small>
                      </span>
                    </label>
                  `
                )
                .join("")}
            </div>
          </section>

          <section class="selection-group dimension-group">
            <header class="selection-group-header">
              <div>
                <h3>下钻维度</h3>
                <span class="dimension-count">已选 0/${capability.dimensions.length}</span>
              </div>
            </header>
            ${
              capability.dimensions.length
                ? `
                  <div class="selection-grid dimension-grid">
                    ${capability.dimensions
                      .map(
                        (dimension) => `
                          <label class="selection-option compact-option">
                            <input type="checkbox" value="${dimension}" ${(catalogSelection.get(capability.id)?.dimensions || []).includes(dimension) ? "checked" : ""} />
                            <span class="checkbox-ui" aria-hidden="true"></span>
                            <span class="option-copy"><strong>${dimension}</strong></span>
                          </label>
                        `
                      )
                      .join("")}
                  </div>
                `
                : `<p class="selection-empty">暂无下钻维度</p>`
            }
          </section>
        </div>
      </div>
    </article>
  `;
}

function refreshIcons() {
  createIcons({ icons });
}

function setExpanded(panel, expanded) {
  expansion.set(panel.dataset.capabilityId, expanded);
  panel.classList.toggle("expanded", expanded);
  const content = panel.querySelector(".capability-content");
  const summaryButton = panel.querySelector(".summary-button");
  const expandButton = panel.querySelector(".expand-button");
  const icon = expandButton.querySelector("svg");

  content.hidden = !expanded;
  summaryButton.setAttribute("aria-expanded", String(expanded));
  expandButton.setAttribute("aria-expanded", String(expanded));
  expandButton.querySelector("span").textContent = expanded ? "收起" : "查看";
  icon?.replaceWith(iconPlaceholder(expanded ? "chevron-up" : "eye"));
  refreshIcons();
}

function iconPlaceholder(name) {
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", name);
  return icon;
}

function updatePanelSelection(panel) {
  const checkedMetrics = [...panel.querySelectorAll(".metric-group input[type='checkbox']:checked")];
  const checkedDimensions = [...panel.querySelectorAll(".dimension-group input[type='checkbox']:checked")];
  const totalMetrics = panel.querySelectorAll(".metric-group input[type='checkbox']").length;
  const totalDimensions = panel.querySelectorAll(".dimension-group input[type='checkbox']").length;
  const metricNames = checkedMetrics.map((input) => input.value);
  catalogSelection.set(panel.dataset.capabilityId, {
    metrics: metricNames,
    dimensions: checkedDimensions.map((input) => input.value)
  });
  prototype?.syncPresetSelection(panel.dataset.capabilityId, catalogSelection.get(panel.dataset.capabilityId));

  panel.querySelector(".selected-summary").textContent = `提供 ${totalMetrics} 个指标`;
  const runButton = panel.querySelector(".run-button"), hint = runButton.parentElement;
  runButton.disabled = !checkedMetrics.length;
  hint.title = checkedMetrics.length ? `试跑已选的 ${checkedMetrics.length} 个指标` : "请先在查看中选择至少一个指标";
  hint.setAttribute("aria-label", hint.title);
  if (checkedMetrics.length) hint.removeAttribute("tabindex");
  else hint.setAttribute("tabindex", "0");
  panel.querySelector(".group-count").textContent = `已选 ${checkedMetrics.length}/${totalMetrics}`;
  panel.querySelector(".dimension-count").textContent = `已选 ${checkedDimensions.length}/${totalDimensions}`;
  panel.querySelector(".overview-value").textContent = metricNames.length
    ? metricNames.join("、")
    : "暂未选择指标";
  panel.querySelector(".select-all-button").textContent =
    checkedMetrics.length === totalMetrics && totalMetrics > 0 ? "取消全选" : "全选";
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

capabilityList.addEventListener("click", (event) => {
  const panel = event.target.closest("[data-capability-id]");
  if (!panel) return;

  if (event.target.closest(".summary-button") || event.target.closest(".expand-button")) {
    setExpanded(panel, !panel.classList.contains("expanded"));
    return;
  }

  if (event.target.closest(".select-all-button")) {
    const checkboxes = [...panel.querySelectorAll(".metric-group input[type='checkbox']")];
    const shouldCheck = checkboxes.some((checkbox) => !checkbox.checked);
    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldCheck;
    });
    updatePanelSelection(panel);
    return;
  }

  if (event.target.closest(".run-button")) {
    const selection = catalogSelection.get(panel.dataset.capabilityId);
    if (!selection?.metrics.length) { showToast("请先选择至少一个指标"); return; }
    prototype.openTrial("preset", panel.dataset.capabilityId);
  }
});

capabilityList.addEventListener("change", (event) => {
  const panel = event.target.closest("[data-capability-id]");
  if (panel && event.target.matches("input[type='checkbox']")) updatePanelSelection(panel);
});

capabilityList.addEventListener("input", (event) => {
  if (!event.target.matches(".metric-search input")) return;
  const query = event.target.value.trim().toLocaleLowerCase("zh-CN");
  const panel = event.target.closest(".capability-panel");
  panel.querySelectorAll(".metric-group .selection-option").forEach((option) => {
    option.hidden = !option.textContent.toLocaleLowerCase("zh-CN").includes(query);
  });
});

document.querySelector(".sidebar-toggle").addEventListener("click", () => {
  document.querySelector(".app-shell").classList.toggle("sidebar-collapsed");
});

document.querySelector(".sidebar-scrim").addEventListener("click", () => {
  document.querySelector(".app-shell").classList.remove("sidebar-collapsed");
});

document.querySelector(".theme-button").addEventListener("click", () => {
  const shell = document.querySelector(".app-shell");
  const dark = shell.classList.toggle("dark");
  const current = document.querySelector(".theme-button svg");
  current?.replaceWith(iconPlaceholder(dark ? "sun" : "moon"));
  refreshIcons();
});

const dialog = document.querySelector(".command-dialog");
const commandInput = dialog.querySelector("input");

function openCommandDialog() {
  dialog.classList.add("open");
  dialog.setAttribute("aria-hidden", "false");
  window.setTimeout(() => commandInput.focus(), 20);
}

function closeCommandDialog() {
  dialog.classList.remove("open");
  dialog.setAttribute("aria-hidden", "true");
  commandInput.value = "";
}

document.querySelector(".command-trigger").addEventListener("click", openCommandDialog);
document.querySelector(".dialog-backdrop").addEventListener("click", closeCommandDialog);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
    event.preventDefault();
    openCommandDialog();
  }
  if (event.key === "Escape") closeCommandDialog();
});

renderCards();
refreshIcons();
prototype = mountComposer({
  capabilities, showToast,
  applyPresetSelection(id, selection, expand = false) {
    catalogSelection.set(id, selection);
    if (expand) expansion.set(id, true);
    const panel = capabilityList.querySelector(`[data-capability-id="${id}"]`);
    if (panel) {
      panel.querySelectorAll(".metric-group input[type='checkbox']").forEach((el) => { el.checked = selection.metrics.includes(el.value); });
      panel.querySelectorAll(".dimension-group input[type='checkbox']").forEach((el) => { el.checked = selection.dimensions.includes(el.value); });
      if (expand) setExpanded(panel, true);
      updatePanelSelection(panel);
    }
  }
});
