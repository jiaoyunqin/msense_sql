// Local display fixtures transcribed from the user's reference screenshots.
// These are configuration examples, not production capabilities or fetched results.
export const templateReferenceModules = [
  {
    id: "reference-coupon-batch-users", name: "领券核销情况-分批次ID多维度核销用户分布",
    description: "分析领券核销漏斗", source: "coupon-overall", version: 3,
    metrics: [["coupon_2", "核销用户数"], ["coupon_5", "核销GMV"]],
    dimensions: ["券批次ID × 消费水平", "券批次ID × 用户人群分类", "券批次ID × 用户价值等级"]
  },
  {
    id: "reference-gmv-source", name: "增量GMV来源-多维度分布", description: "", source: "core-summary", version: 2,
    metrics: [["gmv_delta", "增量支付GMV"], ["gmv_significance", "人均支付GMV显著性", "significance"]],
    dimensions: ["常驻城市等级", "消费力分层", "电商人群八分层", "基于LLM的用户价值标签"]
  },
  {
    id: "reference-redeem-count", name: "领券核销张数分布-核销张数分布", source: "coupon-overall",
    metrics: [["coupon_3", "核销张数"]], dimensions: ["核销张数分布"]
  },
  {
    id: "reference-redeem-interval", name: "领券核销间隔", source: "coupon-overall",
    metrics: [["coupon_3", "核销张数"]], dimensions: ["领券核销间隔"]
  },
  {
    id: "reference-claim-count", name: "领券核销张数分布-领券张数分布", source: "coupon-overall",
    metrics: [["coupon_1", "领券张数"]], dimensions: ["领券张数分布"]
  },
  {
    id: "reference-category-entry", name: "跨品类分层扭转情况-入组跨品类身份", source: "core-summary",
    description: "品类增长方向实验需要观测用户的跨品类分层扭转情况",
    metrics: [["core_0", "进组用户数"], ["core_6", "人均支付GMV"]], dimensions: ["入组跨品类身份"]
  },
  {
    id: "reference-category-overall", name: "跨品类分层扭转情况-整体", source: "core-summary",
    description: "品类增长方向实验需要观测用户的跨品类分层扭转情况",
    metrics: [["core_0", "进组用户数"], ["core_6", "人均支付GMV"]], dimensions: []
  },
  {
    id: "reference-repurchase-eight", name: "次月复购表现-电商人群八分层", source: "core-summary",
    metrics: [["repurchase_users", "次月复购用户数"], ["repurchase_rate", "次月复购率"]], dimensions: ["电商人群八分层"]
  },
  {
    id: "reference-repurchase-overall", name: "次月复购表现-整体", source: "core-summary",
    metrics: [["repurchase_users", "次月复购用户数"], ["repurchase_rate", "次月复购率"]], dimensions: []
  },
  {
    id: "reference-coupon-batch", name: "领券核销情况-券批次分布", source: "coupon-overall",
    description: "覆盖平台老客提频复购的全部",
    metrics: [["coupon_0", "领券用户数"], ["coupon_2", "核销用户数"]], dimensions: ["券批次ID"]
  },
  {
    id: "reference-coupon-distribution", name: "领券核销情况-领券核销张数分布", source: "coupon-overall",
    metrics: [["coupon_1", "领券张数"], ["coupon_3", "核销张数"]], dimensions: ["领券张数分布", "核销张数分布"]
  },
  {
    id: "reference-coupon-interval-distribution", name: "领券核销情况-领券核销间隔", source: "coupon-overall",
    metrics: [["coupon_2", "核销用户数"], ["coupon_3", "核销张数"]], dimensions: ["领券核销间隔"]
  }
];
