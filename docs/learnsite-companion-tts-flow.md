# AI 学伴朗读（Edge TTS）说明

日期：2026-10-27
状态：首版已实现

## 1. 功能定位

为学生 / 学伴场景提供「AI 回复朗读」能力：学生在 AI 学伴悬浮窗中，可对任意一条 AI 回复点击「朗读」，系统使用 Edge TTS（微软在线语音）把回复文本合成为 MP3 并直接播放；再次点击可停止。

设计假设（无既有规格，按学生端学伴场景优先）：

1. 朗读入口只出现在学生端 / 教师端通用 AI 学伴悬浮窗（FloatingAiCompanion）。
2. 合成依赖 edge-tts 访问微软在线服务，需服务器可出网；离线环境调用会返回明确错误提示。
3. 首版不做音色选择 UI，仅预留后端音色白名单参数。

## 2. 后端

### 2.1 服务层

新增 `apps/api/app/services/companion_tts.py`：

| 能力 | 说明 |
|---|---|
| `synthesize_speech(text, voice=None)` | 同步合成入口，内部 `asyncio.run` 驱动 edge-tts |
| 音色白名单 | `zh-CN-XiaoxiaoNeural`（默认）/ `YunxiNeural` / `YunyangNeural` / `XiaoyiNeural` |
| 文本上限 | 600 字（超长返回明确错误） |
| 进程内 LRU 缓存 | 最多 64 条（音色+文本 → mp3 bytes），避免重复合成 |
| 错误收口 | 网络失败等统一转译为 `CompanionTtsError("朗读服务暂不可用…")` |

### 2.2 端点

`POST /api/v1/assistants/companion/tts`

| 项 | 说明 |
|---|---|
| 鉴权 | `get_current_user`（学生 / 教师通用） |
| 入参 | `{ "text": string(必填，去空格后非空), "voice": string? }` |
| 成功 | 直接返回 `audio/mpeg` 二进制（不走 code/data envelope） |
| 400 | 文本为空 / 超过朗读上限 / 音色不在白名单 |
| 502 | edge-tts 网络失败或未返回音频 |

## 3. 前端

`apps/web/src/components/FloatingAiCompanion.vue`：

1. assistant 消息气泡右下角新增「朗读 / 停止朗读 / 合成中…」按钮（回复流式生成中不显示）。
2. 朗读前把 Markdown 转纯文本：代码块替换为「（代码略）」、剥离链接/图片/标记符号，避免朗读出 Markdown 语法。
3. 调用 `apiPostBlob('/assistants/companion/tts', ...)` 拿 MP3 blob，`URL.createObjectURL` + `HTMLAudioElement` 播放。
4. 播放结束自动复位按钮；组件卸载（关闭抽屉 / 退出页面）时停止播放并释放 objectURL。

## 4. 验证

1. 后端 smoke：`test_ai_companion_tts_returns_audio_and_validates_input`（成功 200 audio/mpeg、空文本 400、合成失败 502、未登录 401）。
2. edge-tts 联网合成实测：`.eval-scratch/tts-smoke.py` 生成 21KB MP3 成功。
3. 前端：`npm run typecheck:web` / `npm run build:web`。

## 5. 已知边界

1. 长回复超过 600 字时朗读会被拒绝——前端按钮触发后提示错误，不自动截断（保留完整语义，由用户自行决定）。
2. 服务器无法访问微软语音服务时，朗读不可用（错误提示明确）。
3. 缓存为进程内存级，重启后失效；首版不做持久化音频存储。
