# naive-ui 迁移实施手册（P1 交付物）

> 面向执行迁移的开发/代理。**先读完全文再动手**。
> 目标：把 `apps/web/src` 中全部 Element Plus 用法替换为 naive-ui（+ 共享适配层），行为与视觉不回退。

---

## 0. 铁律

1. **只改 UI 层**。业务逻辑、接口调用、类型定义、computed 逻辑、事件顺序一律保持原样搬移；不做「顺手重构」。
2. **禁止新增 Element**：迁移后文件里不得出现 `<el-`、`element-plus`、`@element-plus/icons-vue`、`v-loading`。
3. **naive-ui 组件必须显式 import**：项目没有配置 naive 的自动导入（只有 ElementPlusResolver），模板里写 `n-button` 而不 import 会直接渲染失败。
   ```ts
   import { NButton, NTag, NModal } from 'naive-ui';
   ```
4. **形状优先复用共享层**：页面头用 `SaPageHeader`，卡片用 `SaPanel`，表格用 `SaDataTable` + `SaTableColumn`。
5. **反馈 API 只从 `@/ui/feedback` 导入**：`import { ElMessage, ElMessageBox } from '@/ui/feedback';`（已在 P1 完成 27 个文件的来源替换，签名与 Element 一致）。新写的提示优先用 `notify.success(...)`。
6. **不动共享层**：`src/ui/feedback.ts`、`src/components/sa/*` 由架构负责人维护；发现缺陷在交付报告里说明，不要自行改动语义。
7. **不做 git 提交**：工作区保留改动即可。
8. **文件编码必须是 UTF-8（无 BOM）**。用 `edit` / `write` 工具改文件；若必须用 PowerShell，读写都要带 `-Encoding UTF8`，否则中文会变乱码。

---

## 1. 组件映射表

| Element | naive-ui | 关键差异 |
|---|---|---|
| `el-button` | `n-button` | `plain` → `secondary`；`link` → `text`；`type="primary"` 一致；`size="small"` 一致 |
| `el-tag` | `n-tag` | `type` 取值一致（success/warning/error/info/primary/default）；`round`、`size` 一致 |
| `el-card` | `SaPanel` | 标题/说明走 `title` / `description`，操作走 `#actions`；`#header` 自定义头部照旧可用 |
| `el-table` + `el-table-column` | `SaDataTable` + `SaTableColumn` | 见 §3 |
| `el-pagination` | `SaDataTable` 的 `pagination` 或 `n-pagination` | 事件 `current-change` → `update:page`；`size-change` → `update:pageSize` |
| `el-form` / `el-form-item` | `n-form` / `n-form-item` | `label-position="top"` → `label-placement="top"`；`prop` → `path`；`label-width` → `label-width`（配合 `label-placement="left"`） |
| `el-input` | `n-input` | `show-password` → `type="password" show-password-on="click"`；`type="textarea"` 一致；`:rows` 一致 |
| `el-input-number` | `n-input-number` | `:precision`/`:min`/`:max`/`:step` 一致；清空值用 `null` |
| `el-select` / `el-option` | `n-select`（`options` 数组） | `v-model` → **`v-model:value`**；`el-option` 子节点改为 `:options="[{label,value}]"`；`el-option-group` → `{ type:'group', label, key, children:[...] }`；`@change` → `@update:value` |
| `el-switch` | `n-switch` | `active-text` / `inactive-text` → `#checked` / `#unchecked` 插槽；`@change` → `@update:value` |
| `el-radio-group` / `el-radio` / `el-radio-button` | `n-radio-group` / `n-radio` / `n-radio-button` | **`label` 是显示文案，`value` 才是值**（Element 里 `label` 即值，最易踩坑）；`@change` → `@update:value` |
| `el-checkbox` | `n-checkbox` | `label` 是显示文案、`value` 是值；`v-model` 一致 |
| `el-tabs` / `el-tab-pane` | `n-tabs` / `n-tab-pane` | `label` → `tab`；`name` 一致；`v-model` → `v-model:value`；分段式用 `type="segment"`，下划线式 `type="line"`（默认） |
| `el-dialog` | `n-modal preset="card"` | **`v-model` → `v-model:show`**；`:title` 一致；`width="520px"` → `style="width: 520px"`；`#footer` 放按钮；`close-on-click-modal` → `mask-closable`（默认都为 true，只有显式 false 时才需要写）；`destroy-on-close` → `:display-directive="'if'"` 或保留挂载（优先保证状态不残留：需要时用 `v-if` 控制） |
| `el-drawer` | `n-drawer` + `n-drawer-content` | `v-model:show`；`size` → `:width`；`with-header` → `:native-scrollbar="false"` + 自管头部 |
| `el-alert` | `n-alert` | `:title` 一致；`:closable="false"` 一致；`description` 用插槽 |
| `el-empty` | `n-empty` | `description` 一致 |
| `el-skeleton` | `n-skeleton` | Element 的 `:loading` + `#template`/`#default` 双插槽模式 → 改成 `v-if="loading"` 显示 `<n-skeleton :rows="6" animated />`，`v-else` 显示内容 |
| `el-space` | `n-space` | `wrap` → `:wrap="true"`；也可直接用 CSS `display:flex; gap` |
| `el-row` / `el-col` | `n-grid` / `n-gi` 或纯 CSS Grid | 项目已大量使用 CSS Grid，**优先纯 CSS**，减少组件层级 |
| `el-descriptions` / `el-descriptions-item` | `n-descriptions` / `n-descriptions-item` | `:column` 一致；`label` → `label`；`border` → `bordered` |
| `el-divider` | `n-divider` | `content-position` → `title-placement` |
| `el-collapse` / `el-collapse-item` | `n-collapse` / `n-collapse-item` | `name` 一致；`title` 插槽改 `#header` |
| `el-timeline` / `el-timeline-item` | `n-timeline` / `n-timeline-item` | `timestamp` → `time`；`type`/`color` 语义相近 |
| `el-progress` | `n-progress` | `percentage` 一致；`type="circle"` 一致；`status` → `status` |
| `el-badge` | `n-badge` | `value` 一致 |
| `el-date-picker` | `n-date-picker` | **返回时间戳**；保持字符串语义用 `v-model:formatted-value` + `value-format="yyyy-MM-dd"`，事件用 `@update:formatted-value` |
| `el-dropdown` / `el-dropdown-menu` / `el-dropdown-item` | `n-dropdown` | 菜单改为 `options: DropdownOption[]` 数组 + `@select`（参考 `SessionActionMenu.vue`） |
| `el-scrollbar` | 删除 | 交给容器 `overflow` |
| `el-icon` + `@element-plus/icons-vue` | `AppIcon` + `lucide-vue-next` | `<AppIcon :icon="Loading" :size="18" />`；旋转动画加 `class="is-loading"` 或 `n-spin` |
| `v-loading` | `n-spin :show` | 用 `<n-spin :show="loading">` 包住内容；或 `n-skeleton` |
| `ElMessage` | `ElMessage` / `notify` | `import { ElMessage } from '@/ui/feedback'` |
| `ElMessageBox` | `ElMessageBox` / `confirmBox` | 同上，`confirm/alert/prompt` 签名对齐，取消时 reject（`try/catch` 语义不变） |

> **语义等价优先于像素一致**：naive 的间距/圆角由 `--ls-*` 主题变量派生，视觉细节允许微调，但信息层级、按钮主次、危险操作红色不能丢。

---

## 2. 共享适配层 API

### `SaPageHeader`（替代 `.hero-panel` 页面头）

```vue
<SaPageHeader eyebrow="签到管理" title="教师签到与出勤" description="按班级和日期查看签到状态。">
  <template #actions>
    <n-button type="primary" :loading="isLoading" @click="load">刷新</n-button>
    <n-button secondary>导出</n-button>
  </template>
</SaPageHeader>
```
- 原先 `.hero-panel` 内的**筛选下拉、日期选择**放在 `#actions`；纯文本说明放 `description`。
- 插槽默认位用于补充自定义内容（如额外的说明块）。

### `SaPanel`（替代 `el-card.soft-card` / `section.soft-card`）

```vue
<SaPanel title="历史报告" description="点击左侧列表查看" body-class="history-body">
  <template #actions><n-button size="small">刷新</n-button></template>
  内容…
  <template #footer>…</template>
</SaPanel>
```
- 无标题的纯容器：`<SaPanel body-class="...">…</SaPanel>`。
- 需要保留原 `.soft-card` 的自定义类：`panel-class="report-card"`。
- Element 的 `:deep(.el-card__body)` 样式选择器要改成 `.sa-panel__body`（`body-class` 会加在 body 上，可直接用）。

### `SaDataTable` + `SaTableColumn`（替代 `el-table`）

```vue
<SaDataTable
  :data="filteredRecords"
  :loading="isLoading"
  :pagination="{ page, pageSize, itemCount: total }"
  row-key="user_id"
  stripe
  empty-text="当前日期没有签到数据"
  @update:page="handlePageChange"
  @update:pageSize="handlePageSizeChange"
  v-model:checkedRowKeys="selectedIds"
>
  <SaTableColumn label="学号" min-width="110" prop="student_no" />
  <SaTableColumn type="selection" width="48" />
  <SaTableColumn label="状态" min-width="110">
    <template #default="{ row }">
      <n-tag :type="row.status === 'present' ? 'success' : 'warning'" round>…</n-tag>
    </template>
  </SaTableColumn>
  <SaTableColumn label="操作" fixed="right" min-width="200">
    <template #default="{ row, $index }">…</template>
  </SaTableColumn>
</SaDataTable>
```

支持与 `el-table-column` 一致的属性：`prop`、`label`、`width`、`min-width`、`fixed`、`align`、`header-align`、`sortable`、`resizable`、`show-overflow-tooltip`、`formatter`、`className`、`type="selection|index"`。
单元格插槽参数：`{ row, column, $index, index }`。

差异点（必须处理）：
- `@selection-change="rows => ..."` → `@selection-change` 仍然可用（SaDataTable 会 emit 选中行数组）；或改用 `v-model:checkedRowKeys`（拿到的是 key 数组）。
- `row-key` 必须存在（默认 `id`）；若表格行没有 `id`，显式传 `row-key="user_id"` 之类。
- 表格自带滚动容器，`height` / `max-height` 用 `:max-height="480"`。
- 分组表头、列筛选等复杂场景可以直接传 `:columns-config`（naive 原生列数组）。
- 固定列需要 `:scroll-x="1200"` 才能生效（横向总宽）。

### `notify` / `confirmBox`（推荐）与 `ElMessage` / `ElMessageBox`（兼容）

```ts
import { notify, confirmBox } from '@/ui/feedback';

notify.success('已保存');
const ok = await confirmBox.confirm('确认删除？', '删除确认');   // 返回 boolean，不抛异常
const input = await confirmBox.prompt('请输入备注', '审核', { inputType: 'textarea' });
if (input) { /* input.value */ }
```

---

## 3. 表格迁移细则

1. 先确认行数据唯一键：`id` / `user_id` / `question_id` …，作为 `row-key`。
2. 纯文本列 → `<SaTableColumn prop="xxx" label="xxx" min-width="120" />`（不要保留 `#default` 只做字符串输出的插槽，能省则省；有格式化逻辑的保留插槽）。
3. 有 `fixed="right"` 的操作列：给 `SaDataTable` 补 `:scroll-x="<各列 width/min-width 之和>"`。
4. 分页：
   - 若页面原先是「表格 + 独立 `el-pagination`」，把分页配置并入 `SaDataTable` 的 `pagination`（字段 `page`/`pageSize`/`itemCount`），删除原 `el-pagination`。
   - 若分页逻辑复杂（跨页选择、跳页副作用），保留独立 `<n-pagination>`，表格不传 `pagination`。
5. 空态：`el-empty` 与表格二选一的写法，改成表格 `empty-text` 或 `#empty` 插槽。
6. `el-table` 的 `stripe` → `stripe`；`border` → `bordered`；`size="small"` → `size="small"`。

---

## 4. 弹窗与表单细则

- 弹窗标题用 `n-modal` 的 `preset="card"` + `:title`；底部按钮放进 `#footer`，主按钮 `type="primary"`，危险操作 `type="error"`。
- `v-model` → `v-model:show`；`@close` → `@after-leave`（需要清理表单时）或 `@update:show`。
- 表单：`n-form` + `n-form-item`，`label-placement="top"`；校验 `:rules` + `path`；需要编程校验时：
  ```ts
  const formRef = ref<FormInst | null>(null);
  await formRef.value?.validate();
  ```
- `el-select` 的空值：naive 需要 `null`（不要用空字符串），清空用 `clearable`。
- `el-input-number` 允许为空时显式 `:value="form.value ?? null"`。

---

## 5. 样式清理

- 页面 `<style scoped>` 里针对 Element 内部类名的选择器必须同步替换：`.el-card__body` → `.sa-panel__body`、`.el-table__*`、`.el-dialog__*`、`.el-tag`、`.el-button`、`--el-color-*` 变量等。
- `--el-color-danger` 等变量改用项目变量：`--ls-danger`（若不存在，用 `#d03050`）。禁止再引用 `--el-*`。
- 保留业务类名（`.history-item`、`.metric-tile`）与布局逻辑，只替换与组件库绑定的选择器。
- **不得写死颜色**（深色模式已开启）：卡片/浮层底用 `--ls-card` / `--ls-panel` / `--ls-elevated`，输入类用 `--ls-input-bg`，胶囊用小色块用 `--ls-chip-bg`，文字用 `--ls-ink` / `--ls-text` / `--ls-muted`，描边用 `--ls-border`。深浅由 `<html data-scheme>` 切换，硬编码的 `#fff`/深灰字在深色下会变成白块或看不见的字。例外：承载学生作品的预览/`iframe` 保留白底，彩色渐变上的白字保留 `#fff`。

---

## 6. 自检（提交前必须做）

```powershell
cd D:\code\mycode-ai\learnsite-ai02\apps\web
node ./scripts/check-no-element.mjs src/modules/<你的模块目录>   # 必须 0 命中，退出码 0
```
- 不要跑 `npm run build`（会写 dist，和其他并行任务冲突）；类型检查由主控统一执行。
- 逐一自查：首屏加载 / 空态 / 分页 / 表单校验 / 弹窗开关 / 批量操作二次确认 / 危险操作按钮色 / 窄屏布局。

---

## 7. 交付报告格式（回复正文，≤1200 字）

```
模块：<name>
改动文件：<file: 主要变更一句话>
迁移标签数：<n> → 0
适配层使用：SaPageHeader x / SaPanel x / SaDataTable x / SaTableColumn x
行为等价性说明：<哪些交互细节按 naive 语义改写，例如 el-radio-button label→value>
已知风险/未覆盖：<如无写「无」>
自检：check-no-element = 0 命中
```
