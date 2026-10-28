# 学生端页面改造契约（必须逐条遵守）

本轮只改学生端模板与页面内样式。技术栈不变：Vue 3 + naive-ui + lucide + 现有 API 封装。
**绝对不要**新增依赖、不要改路由、不要改任何请求/提交/轮询/上传/答题/AI 调用、不要改状态机。
只允许删掉「纯装饰、重复信息、纯说明文字」的模板块和随之失效的 import / 计算属性。

## 一、目标

每页只回答一个问题，最大的区块就是答案，主操作一键可达。
现状问题是：顶部 4 张等权指标卡 + 图表 + 面板层层堆叠，同一数字出现 2-4 次，
说明文字与说明性小标题占掉首屏，真正的「现在该做什么」被挤到下面。

## 二、必用的共享组件（已存在，直接 import）

```ts
import StudentPageHead from '@/components/student/StudentPageHead.vue';
import StudentPanel from '@/components/student/StudentPanel.vue';
import StudentStatStrip, { type StudentStatItem } from '@/components/student/StudentStatStrip.vue';
import StudentEmpty from '@/components/student/StudentEmpty.vue';
```

- `StudentPageHead`：props `title`（**页面唯一的 h1，名词**）、`sub`（一行事实，不写功能介绍）；
  插槽 `#back`（返回链接，用 `<button class="sw-back">` 或 RouterLink）、`#actions`（最多一个主按钮 + 一个次按钮）。
- `StudentPanel`：props `title`、`count`（如 `'3 份'`）、`flush`（列表用，行自己贴边）；插槽 `#actions`。
- `StudentStatStrip`：props `items: [{ label, value, unit?, note? }]`；只在「一条被分隔线切开的统计带」合适时使用，
  每页最多一条，最多 4 格，**不要再用 4 张卡片**。
- `StudentEmpty`：props `text`、`box`。

页面里禁止再出现：`SaPageHeader`、`SaPanel`、`metric-grid`、`metric-tile`、`mini-panel`、
`student-card-icon` 图标方块、`n-timeline`、`section-note` 这类说明小字块。

## 三、样式只允许用这些 class（定义在 styles/student-workspace.css）

- 骨架：`sw-page-head`、`sw-panel`、`sw-strip`、`sw-now`、`sw-split`（1fr + 320px 侧栏）、`sw-grid-2`
- 行：`sw-row`、`sw-row--link`、`sw-row__main`、`sw-row__title`、`sw-row__meta`、`sw-row__value`、`sw-row__action`
- 状态：`sw-chip` + `sw-chip--now / --done / --todo / --warn / --danger`
- 进度：`sw-progress`、`sw-progress__track`、`sw-progress__fill`、`sw-progress__label`
- 空态：`StudentEmpty`（不要自己造）
- 其他：`sw-back`、`sw-link`、`sw-empty`

页面自己的 `scoped` 样式只写布局微调（如某个列表的行高、图表容器高度），
**不要**再写新的圆角卡片、阴影、渐变、图标方块、彩色标签。

颜色只用 `var(--sw-*)`：`--sw-ink` 正文、`--sw-muted` 次要、`--sw-line` 描边、
`--sw-accent`（品牌绿，只给「当前这一步」/进度/唯一主操作数据）、`--sw-surface`、`--sw-ground`。
数字用 `font-variant-numeric: tabular-nums`（`.sw-row__value`、`.sw-strip__value` 已带）。

## 四、每页的结构（按此执行，不要自创）

### WorkListPage（作品工坊）
问题：我交过哪些作品、老师评了没有、还能不能重交。
1. `StudentPageHead`：h1「作品」；sub「共 N 份，M 份已评阅」；actions：刷新（次按钮）。
2. 一条 `StudentStatStrip`：作品 / 已评阅 / 待评阅 / 可重交（4 格，数字来自 summary，**不要**再画状态环图）。
3. `StudentPanel title="作品记录" count="N 份" flush`：表格或 `sw-row` 列表。保留 SaDataTable 也可以，
   但去掉卡片式外框、去掉重复的 summary 图表。行内动作保留「查看详情 / 再次提交 / 撤销评阅」。
4. 删除两张图表（状态环图与 metric 卡重复；课程柱线图若保留，只能作为表格上方的一条窄图，高度 ≤160px，
   且表格必须仍在首屏）。优先直接删除，表格就是答案。

### WorkDetailPage（作品详情）
问题：这份作品什么状态、老师说了什么、附件在哪。
1. `StudentPageHead`：h1 = 任务标题；sub = 提交时间 + 提交方式 + 状态文字；`#back` 返回作品列表；
   `#actions` 只放一个主操作（可重交 → 再次提交；否则不放）。
2. 把原来的 5 张指标卡压成一行 `sw-row__meta` 式的信息行或一条 3 格 `StudentStatStrip`
   （状态 / 教师评分 / 互评得分），不要 5 张卡。
3. `sw-split`：左 = 任务信息 + 作品说明 + 教师评语（`StudentPanel`，正文 14px/1.7）；
   右 = 附件列表（`StudentPanel flush`，每行文件名 + 大小 + 下载文字按钮）。
4. 删除右栏「下一步」面板（与页头动作重复）、删除 n-descriptions 8 行表格式说明。

### QuizHomePage（随堂测验）
问题：现在能开始哪一场、我上次考了多少。
1. `StudentPageHead`：h1「随堂测验」；sub「今天 N 人已参与，我的排名第 M」；actions：查看今日排行榜（次按钮）。
2. **首屏最大块**：`StudentPanel title="可开始"`，每场一个 60px 行：标题 + 题数/时限 + 右侧主按钮「开始测验」。
3. 一条 `StudentStatStrip`：平均分 / 最佳 / 测验次数 / 今日排名。
4. `sw-split`：左 = 最近测验记录（行列表，分数右对齐）；右 = 今日榜前 5（`StudentPanel flush`）。
5. 删除「成绩趋势」折线图与「今日参与」饼图；保留答题弹窗及其全部逻辑。

### QuizRankingsPage（测验排行）
问题：今天班里谁考得最好、还有谁没考。
1. `StudentPageHead`：h1「今日测验榜」；sub = 班级 + 生成时间；actions：返回测验（次按钮）。
2. `StudentStatStrip` 4 格：参与 / 待参与 / 最高分 / 平均分（从 items 现算）。
3. 左（主）：完整排行榜表，名次列右对齐，前三名只用数字区分，不要彩色徽章。
   右：未参与名单（`StudentPanel flush`，一行一个名字）。
4. 删除参与饼图；分数段柱图可保留为右栏下方一张 140px 小图，或直接删除。

### TypingHomePage（打字训练）
问题：现在练哪一篇、我上次速度多少。
1. `StudentPageHead`：h1「打字训练」；sub「上次 X 字/分 · 正确率 Y%」；actions：查看排行榜（次按钮）。
2. 首屏最大块：练习清单，每篇一行：名称 + 难度/字数/模式 + 右侧「开始练习」按钮。
3. 一条 4 格 `StudentStatStrip`：平均速度 / 最佳速度 / 最佳正确率 / 今日排名。
4. `sw-split`：左 = 最近练习记录；右 = 班级榜前 5。
5. 练习弹窗与计时、提交逻辑完全保留，只把弹窗内的三张卡改成一行数字 + 分隔线。

### TypingRankingsPage（打字排行）
问题：谁打得快、准确率如何。
1. `StudentPageHead`：h1「打字排行」；sub = 范围说明；actions：范围 `n-select`（次）+ 返回训练。
2. 主块：速度柱 + 准确率折线的组合图（高度 240px，作为页面唯一图表与唯一数据主色），
   图上方一行说明「前 12 名」。删除 4 张指标卡，把人数/最高速度放进图标题的 count 里。
3. 下方：完整榜表（左）+ 未参与名单（右）。

### ResourcePage（课程资源）
问题：这个知识点有哪些材料、打开哪一篇。
1. `StudentPageHead`：h1「课程资源」；sub「N 个分类 · M 份材料」；无主按钮。
2. 三栏：左 200px 分类列表（行，选中用中性灰底），中 300px 资源列表（标题 + 类型 + 更新日期），
   右 = 详情（标题、摘要、正文、相关推荐）。窄屏退化为「分类行 + 列表 → 详情」的单栏。
3. 删除 4 张指标卡与「推荐资源」三张大卡（推荐并入中栏顶部一行「推荐」分组或直接去掉重复入口）。
4. 保留 `route.query.resourceId` 定位、自动选中链与外链打开逻辑。

### DrivePage（共享网盘）
问题：还剩多少空间、上传/下载/删除。
1. `StudentPageHead`：h1「网盘」；sub「个人空间 · 已用 X / Y · N 个文件」；actions 只放一个主按钮「上传文件」。
2. 用量用一行 `sw-progress` 放在页头下方，删除「空间使用情况」面板与 4 张指标卡。
3. 主块 = 文件表（名称 / 大小 / 更新时间 / 操作），待上传文件作为表上方一行提示条 + 「开始上传」。
4. 个人/小组用 `n-tabs`（line 类型）切换，删除重复的「选择文件」按钮（只保留页头那一个）。
5. 隐藏的 file input、上传/下载/删除逻辑、`route.query.tab` 同步全部保留。

### GroupPage（小组协作）
问题：我组里有哪些人、今天到课没、组网盘有什么。
1. `StudentPageHead`：h1 = 小组名；sub = 我的角色 + 组长 + 今日到课情况；actions：打开小组网盘（主按钮）。
2. 一条 4 格 `StudentStatStrip`：成员 / 今日到课 / 共享文件 / 组网盘已用。
3. `sw-grid-2`：左 = 成员表（姓名 / 角色 / 今日状态），右 = 共享网盘最近文件（行 + 大小）。
4. 底部一个 `StudentPanel title="最近动态"`：把「课堂动态」与「操作日志」合并成一条时间线列表
   （保留两者的数据来源，按时间倒序合并），删除其中一份重复列表。
5. 修掉日志里出现的乱码「路」，改为「·」。

### ProfilePage（我的档案）
问题：我的资料对不对、怎么改。
1. `StudentPageHead`：h1「我的档案」；sub = 班级 + 学号 + 座位；无主按钮。
2. 用 `n-tabs`（line）分：资料 / 签到 / 安全 / 修改申请（把姓名、性别、相片、班级四个 tab 合并为「修改申请」下的分组）。
   保留 `route.params.section` 与 `security` 别名、`switchToSection` 的路由规则，只调整 tab 名称映射。
3. 顶部一条 3-4 格 `StudentStatStrip`（班级 / 累计签到 / 今日状态 / 座位）。
4. 删除「常用入口」三张 tip 卡、「密码规则」「上传说明」「温馨提示」纯说明块；
   规则类文字压缩成字段旁的 12px 一行。
5. 所有表单、上传、校验、门控逻辑原样保留。

## 五、文案

- h1 是名词，不是「欢迎回来」；不使用 eyebrow、不使用感叹号、不使用 emoji。
- 说明句只保留会改变学生下一步动作的那一句；页面不要再用「这一页展示…」的说明书口吻。
- 空态一句话说清「为什么空 + 接下来能做什么」。
- 所有数字保留原有格式函数（分数、时间、字节），不要另造。

## 六、完成标准

1. `cd apps/web && npx vue-tsc --noEmit` 通过（允许项目原有的无关报错，但不能新增）。
2. 页面在 1440 宽度首屏能看到：h1、答案块、主操作；滚动前不出现第二组等权卡片。
3. 1440 / 768 / 390 三档无横向滚动；手机上左右栏堆叠、表单单列。
4. 删除的只是展示块；所有 `apiGet/apiPost/apiUpload/apiDelete`、事件处理、路由跳转、
   `watch`、`onMounted`、`onBeforeUnmount` 行为不变。

## 七、交付

回复一份简短清单：每个文件改了哪些区块、删了哪些重复块、保留/合并了哪些动作，
以及 typecheck 结果。不要粘贴大段代码。
