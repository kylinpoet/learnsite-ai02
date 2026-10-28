# LearnSite 平台配色方案规范

> 状态：已评审确定，共 3 套方案。**默认方案：方案 A · 校徽配色（浅色侧栏）**。
>
> 配色来源：方案 A 取自温州市瓯海区外国语学校校徽（主绿 `#1E7A57` + 描边金 `#C9A469`）；方案 B 为通用教育平台配色；方案 C 来自 ui-ux-pro-max 技能库 Claymorphism 粘土风风格规范（官方标注适用儿童与教育应用）。

## 方案总览

| 方案 | 名称 | 主色 | 强调色 | 风格定位 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A | 校徽配色 · 浅色侧栏 | `#1E7A57` | `#C9A469` | 品牌定制、明亮干净 | **默认** |
| B | 青禾成长 | `#0D9488` | `#F59E0B` | 亲和活力、贴合学生成长主题 | 备选 |
| C | 粘土童趣 | `#F97316` | `#2563EB` | Claymorphism 可爱软萌风 | 备选 |

---

## 方案 A · 校徽配色（浅色侧栏）——默认方案

主色取校徽图形绿，强调色取校徽外圈描边金。绿色承担所有主操作与选中态；金色饱和度低，仅小面积点缀（徽章、高亮、Logo 文字），大面积使用会显脏。

### 色值表

| 语义 | 色值 | 用途 |
| --- | --- | --- |
| 主色（primary） | `#1E7A57` | 主按钮、导航选中态、链接、进度条、进行中标签 |
| 主色-深（primary-deep） | `#155C40` | 主色 hover/active、浅绿底上的正文文字 |
| 主色-浅底（primary-soft） | `#E4F1EA` | 标签底色、头像底色、图表次要柱 |
| 强调金（accent-gold） | `#C9A469` | Logo 文字、图表高亮柱、荣誉/积分类点缀 |
| 强调金-深（gold-deep） | `#8A6A32` | 金浅底上的文字 |
| 强调金-浅底（gold-soft） | `#F5EBD8` | 金色标签底色（如"已发布""已评价"） |
| 页面背景（background） | `#F6F9F7` | 页面底色（带绿意的暖白） |
| 卡片表面（surface） | `#FFFFFF` | 卡片、侧栏、弹窗 |
| 正文（text） | `#22302A` | 标题与正文 |
| 次要文字（muted） | `#6D7F76` | 说明文字、单位、时间戳 |
| 边框（border） | `#E1EAE5` | 卡片描边、分隔线、进度条轨道 |
| 侧栏文字 | `#41544B` | 白色侧栏上的导航文字 |
| 成功/正向增量 | `#1E7A57` | 与主色共用 |

### 应用要点

1. 白色侧栏贴近校徽白底观感，整体明亮干净，投影使用绿色调（`rgba(20, 60, 45, .16)`）。
2. 状态徽章双色制：进行中/通过类用绿浅底，待办/已发布类用金浅底。
3. 图表中最高值柱用主绿，次强调柱用金色，其余用绿浅底。

---

## 方案 B · 青禾成长（备选）

青绿 + 暖橙，亲和有活力，贴合学生"成长"主题。适合突出学生端激励场景（积分、徽章、待办）。ui-ux-pro-max 色板库中"在线课程/E-learning"色板（Progress teal + achievement orange）与该方案一致，经数据库验证合理。

### 色值表

| 语义 | 色值 |
| --- | --- |
| 主色（primary） | `#0D9488` |
| 主色-深 | `#0F766E` |
| 主色-浅底 | `#D9F2EE` |
| 强调橙（accent） | `#F59E0B` |
| 强调橙-深 | `#B45309` |
| 强调橙-浅底 | `#FEF3C7` |
| 侧栏（深青） | `#134E4A` |
| 侧栏文字 | `#99F6E4` |
| 页面背景（暖白） | `#FAF9F5` |
| 卡片表面 | `#FFFFFF` |
| 正文 | `#292524` |
| 次要文字 | `#78716C` |
| 边框 | `#E7E5DF` |

### 应用要点

1. 深青侧栏 + 白色内容区对比清晰；侧栏 Logo 与标题用白色，导航文字用浅青。
2. 橙色用于积分、待提交、提醒类元素，与绿色形成"成长 + 收获"的语义配对。

---

## 方案 C · 粘土童趣（备选，可爱型）

来自 ui-ux-pro-max 风格库 Claymorphism 规范：软 3D、圆胖、玩具感、果冻弹性。奶油底 + 活力橙主色 + 信任蓝点缀，粉彩薄荷/粉彩蓝做辅助色。适合学生端低年级场景与活动页。

### 色值表

| 语义 | 色值 |
| --- | --- |
| 主色（primary） | `#F97316` |
| 主色-深 | `#9A3412` |
| 主色-浅底 | `#FFEDD5` |
| 强调蓝（accent） | `#2563EB` |
| 强调蓝-深 | `#1E40AF` |
| 强调蓝-浅底 | `#DBEAFE` |
| 粉彩辅助-薄荷 | `#98FF98` |
| 粉彩辅助-粉蓝 | `#ADD8E6` |
| 页面背景（奶油底） | `#FFF7ED` |
| 卡片表面 | `#FFFFFF` |
| 正文 | `#9A3412` |
| 次要文字 | `#B45309` |
| 边框 | `#F5D9B8` |
| 成功/正向 | `#22C55E` |

### 应用要点（Claymorphism 风格规范）

1. 圆角统一加大：容器 `20px`，按钮/导航 `16px`，图表柱 `8px`。
2. 卡片使用双阴影（内 + 外）：`inset -2px -2px 8px rgba(249,115,22,.06), 4px 4px 10px rgba(154,52,18,.10)`；主按钮带 `3px` 粗描边和按压内阴影。
3. 动效使用软弹跳曲线 `cubic-bezier(0.34, 1.56)`，按压 `200ms ease-out`；需尊重 `prefers-reduced-motion`。
4. 粉彩辅助色（薄荷/粉蓝）仅用于分类标签、装饰图形，不做大面积填充。
5. 注意可访问性：粉彩底色上的文字必须使用对应深色（`#9A3412` / `#1E40AF`），保证 4.5:1 对比度。

---

## 落地建议（Naive UI + 全局 CSS 变量）

各方案统一映射为一套语义 Token，切换主题时只需替换变量值：

```css
:root {
  --color-primary: #1E7A57;
  --color-primary-deep: #155C40;
  --color-primary-soft: #E4F1EA;
  --color-accent: #C9A469;
  --color-accent-deep: #8A6A32;
  --color-accent-soft: #F5EBD8;
  --color-background: #F6F9F7;
  --color-surface: #FFFFFF;
  --color-text: #22302A;
  --color-muted: #6D7F76;
  --color-border: #E1EAE5;
  --color-sidebar: #FFFFFF;
  --color-sidebar-text: #41544B;
}
```

Naive UI 主题定制对应关系：

| CSS 变量 | Naive UI `themeOverrides` 键 |
| --- | --- |
| `--color-primary` | `common.primaryColor` / `primaryColorHover`（hover 用 `-deep`）/ `primaryColorPressed`（用 `-deep`） |
| `--color-primary-soft` | `common.primaryColorSuppl` 及各组件的 `color` 浅底态 |
| `--color-background` | `common.bodyColor` |
| `--color-surface` | `common.cardColor` / `popoverColor` |
| `--color-text` | `common.textColorBase` / `textColor1` |
| `--color-muted` | `common.textColor2` / `textColor3` |
| `--color-border` | `common.borderColor` / `dividerColor` |

如需多主题切换，将三套方案的变量值各存为一份定义（`emblem` / `growth` / `clay`），运行时按用户选择注入 `themeOverrides` 并同步根节点 CSS 变量。
