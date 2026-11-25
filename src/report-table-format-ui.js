import { completeSource, moduleScope, moduleMetrics } from "./report-complete-data.js";
import { dataBarColumn } from "./report-table-formatting.js";
import { tableFormat as sharedFormat, formatPanel as sharedPanel, tableFormatEvent as sharedEvent } from "./report-table-format-controls.js";

export { formatButton } from "./report-table-format-controls.js";
export const formatMetrics = module => moduleMetrics(module)
  .filter(metric => metric.columns.some(column => dataBarColumn(module, column)));
const context = { source: completeSource, metrics: formatMetrics, scope: moduleScope };
export const tableFormat = (view, module) => sharedFormat(view, module, context);
export const formatPanel = (module, view, format) => sharedPanel(module, view, format, { metrics: formatMetrics(module) });
export const tableFormatEvent = (event, view) => sharedEvent(event, view, context);
