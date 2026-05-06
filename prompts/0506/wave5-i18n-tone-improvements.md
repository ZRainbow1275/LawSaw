# Wave 5 — 翻译腔候选改进清单（B8 参考用）

> 生成时间：2026-05-06
> 生成者：i18n-cleaner（B4 standby 期间预备）
> 状态：**仅候选，主要供 B8 review** — 改不改、改成什么由 B8/B9 决定

## 重要免责声明

1. 本扫描使用 **静态正则启发式**（12 个 buckets，见 `.tmp/check-tone-deeper.mjs`），无法理解上下文。某些 "中文句号 + 中文字符" 的命中是合法的（中文也用句号分句）。
2. 修改翻译文案不会引入 i18n missing key（key 是英文），但会改变最终用户看到的文字。**任何 zh 改动都应过一次产品 / 法务（如有合规要求）的快速 review**。
3. 测试 / Storybook 中的固定文案断言可能因翻译改写而失败 — 改之前请先 `pnpm --filter @law-eye/web test --grep i18n` 跑一轮。

## 扫描方法

脚本：`.tmp/check-tone-deeper.mjs`
完整 dump：`.tmp/tone-findings.json`

| Bucket | 命中数 | 真实信号强度 |
| --- | --- | --- |
| 句号位于中文句中（中文也合法） | 55 | **低**（多数误报） |
| Stilted 进行+verb | 2 | 高 |
| `或...或` 双连堆叠 | 1 | 高 |
| 的-stacking（≥2 在 8 字内） | 2 | 中 |
| 您 vs 你 mixing | 0 | — |
| 它 reflexive (literal "it") | 0 | — |
| 把字句 ≥2 | 0 | — |
| 通过...的方式 | 0 | — |
| 对于+短语 | 0 | — |
| 可以 redundancy | 0 | — |
| 是 echo (≥3) | 0 | — |
| 句号+作出/做出弱名词 | 0 | — |

**真实可改进强候选 ≈ 5 条**，剩余 55 条句号命中是中文断句习惯，不算翻译腔。

---

## A. 强候选（明显翻译腔，建议改）

### A.1 Stilted "进行 + 动词" → 直接用动词

| key (en) | 当前 zh | 建议 zh | 原因 |
| --- | --- | --- | --- |
| `Filter real tenant templates by cadence, then open one for editing or create a new operational baseline.` | 按周期筛选真实租户模板，然后打开**进行编辑**，或创建新的运营基线。 | 按周期筛选真实租户模板，然后打开**编辑**，或创建新的运营基线。 | "进行编辑" 是典型 verb-noun 化，"编辑" 已是动词 |
| `Use the latest relation id or an existing tuple id to remove a relation.` | 请使用最近创建的关系 ID 或现有关系元组 ID **进行删除**。 | 请使用最近创建的关系 ID 或现有关系元组 ID **执行删除**。**或更佳**：请使用最近创建的关系 ID 或现有关系元组 ID **删除关系**。 | 同上；"进行删除" 啰嗦 |

### A.2 "或 ... 或 ..." 双连 → 用顿号

| key (en) | 当前 zh | 建议 zh | 原因 |
| --- | --- | --- | --- |
| `Leave empty for a global banner, or select one or more channels.` | 留空表示全局横幅，**或选择一个或多个**频道。 | 留空表示全局横幅，**或选择一个、多个**频道。**或更自然**：留空表示全局横幅，或选择一个或若干频道。 | 中文 "或...或..." 重复连用读起来卡 |

### A.3 "的" 字堆叠（中等优先级）

| key (en) | 当前 zh | 建议 zh | 原因 |
| --- | --- | --- | --- |
| `Personalized news based on your role and channel subscriptions` (key="My feed page subtitle") | 基于**您的**角色和频道订阅**的**个性化资讯 | 基于您当前角色与频道订阅生成的个性化资讯 | "您的...的" 双"的"，可以拆 |
| `Saving creates a new active version; previous versions are archived.` | 保存将创建一个新**的**生效版本，先前**的**版本会被归档。 | 保存后会创建新的生效版本，旧版本会自动归档。 | 两个"的"在 8 字内紧密相邻；同时 "先前的版本" 改 "旧版本" 更口语化 |

---

## B. 中等候选（更地道改写，可选）

这些不是严格翻译腔，但有更自然的本地化版本：

| 当前 zh 文案 | 建议 zh | 改进点 |
| --- | --- | --- |
| 您有新通知 | 您有新消息 | "新消息" 比 "新通知" 更口语；微信、钉钉都用前者 |
| 是否确定？/ 您确定吗？ | 确定要继续吗？ / 确认操作？ | 减少疑问句"吗"叠加 |
| 加载中... | 加载中… | 用中文省略号"…"代替三个英文点（已部分采用，可统一） |
| 系统将...... | 系统将...（一段省略号即可） | 同上 |
| 已成功保存 | 保存成功 | 中文倾向 V+成功 而非 已+V+成功 |
| 操作成功 | 完成 / 已完成 | "操作成功" 偏机器，可视场景简化 |
| 删除失败：{reason} | 删除失败（{reason}） | 冒号后接动态句子时，括号或破折号更稳 |
| 请稍后重试 | 请稍后再试 | "重试" 偏书面；"再试" 更通顺 |
| 请联系管理员 | 如有问题，请联系管理员 | 添加引导 |
| 该操作不可撤销 | 此操作无法撤销 | "该 / 此 / 这" 中 "此" 更书面正式 |

> 上述 B 类需要在 zh.json 中 grep 实际命中后再决定。许多是泛化建议，未必每条都已存在。

---

## C. 不建议改的"看起来像翻译腔"误报

下列模式**不应改**，因为是合法的中文表达：

1. **句号在中文句中**（55 命中）
   例：`API 密钥用于程序化访问系统。请妥善保管，勿与他人分享。`
   → 中文也用句号分句，连续两个短句完全合法，**不要改**。

2. **`已...请...` 句式**
   例：`新的 API 密钥已就绪。请在关闭此面板前复制原始密钥。`
   → 这是中文的标准提示语序：状态 + 请求动作。

3. **专有名词 + ID/Token 的英文混排**
   例：`API 密钥` / `B.6a 保留` / `super_admin`
   → 这些是产品专有词或代码 enum，**保持原样**。

---

## D. 推荐处理流程（给 B8）

1. **优先级**：先改 A.1 + A.2 + A.3 共 5 条强候选 — 改动最小、收益最高。
2. **B 类**：纯优化建议，B8 时间充裕再考虑；不充裕则跳过给后续维护周期。
3. **C 类**：**不要改**。

修改步骤：

```bash
# 1. 用 Edit 工具改 zh.json 中的对应 value
# 2. 跑 i18n 验证（key 不变所以应该全绿）
cd apps/web && pnpm check:i18n

# 3. 在 dev 模式快速过一遍受影响页面
#    - admin/reports → A.1 第一条
#    - admin/relations 删除关系流 → A.1 第二条
#    - admin/banners/new → A.2
#    - me/feed → A.3 第一条
#    - admin/reports/templates/[id] 保存 → A.3 第二条

# 4. commit
git commit -m "i18n(zh): smoothen 5 translation-tone phrases (wave 5 polish)"
```

---

## E. 调用脚本复现

```bash
# 重新生成 tone 候选
node .tmp/check-tone-deeper.mjs

# 完整 JSON dump
cat .tmp/tone-findings.json
```

---

**End of file. 强候选 5 条，可选改进 ~10 条，明确不改的 55 条误报。**
