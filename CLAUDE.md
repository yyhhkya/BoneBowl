# CLAUDE.md

BoneBowl：B站直播礼物驱动的骨头掉落 OBS 叠加层。Electron + React 设置页，PixiJS + Rapier2D 物理叠加层，B站直播协议自实现。

## 常用命令

```bash
npm run dev        # Vite + Electron 全量开发（渲染层 5173，本地叠加服务 17800）
npm run dev:web    # 只起 Vite（5199），浏览器预览界面，带模拟数据
npm run typecheck  # tsc --noEmit
npm run build      # 构建 out/
npm run dist       # 构建并打包 Windows（NSIS 安装版 + 便携 exe，输出 release/）
```

界面预览：

- 设置页 `http://localhost:5199/`
- 叠加层 `http://localhost:5199/overlay?test=1&debug=1`（`test=1` 自动投喂演示骨头，`lifetime=秒数` 覆盖消失时长）

Electron 二进制缺失时执行 `node node_modules/electron/install.js`。

## 结构

```
src/main/          Electron 主进程
  bilibili/        Wbi 签名、REST、信息流 WebSocket、扫码登录
  config.ts        userData/config.json 读写与字段归一化
  server.ts        127.0.0.1 上的静态服务 + /ws 广播
  updater.ts       electron-updater 封装
  index.ts         窗口、IPC、礼物映射、生命周期
src/preload/       contextBridge API
src/renderer/src/
  settings/        设置页（直播间、礼物映射、叠加层、更新、事件）
  overlay/         Pixi + Rapier 叠加场景（game.ts / sprites.ts）
src/shared/        主进程与渲染进程共享类型
docs/              README 截图
```

## 关键约束

- **B站协议**：`getDanmuInfo` 需要 Wbi 签名与 Cookie 中的 `buvid3`；信息流是 WebSocket 二进制封包（protover 2/3，zlib/brotli），认证 op=7、心跳 op=2、消息 op=5。必须登录（配置里有 `sessdata`）才允许连接直播间，自动连接同样受此限制。
- **扫码登录**：`passport.bilibili.com/x/passport-login/web/qrcode/generate` 生成，poll 返回 0/86101/86090/86038。成功后从 Set-Cookie 取 SESSDATA，主进程保存并清理登录 UID 缓存。设置页只提供扫码登录，不保留手动粘贴输入框。
- **礼物事件**：`SEND_GIFT`，按 `tid` 去重；映射规则见 `AppConfig.gifts`，单条最多 40 根骨头。
- **叠加层**：透明背景，1920×1080 设计坐标缩放适配；骨头用系统 🦴 字形生成贴图并裁剪；碗的碰撞体是“外壁 + 碗口 + 内壁”的闭合截面；碗前壁半透明（约 58%）；不加隐形挡墙；骨头数量上限 100，可设置消失时长（0 = 永不）。
- **自动更新**：electron-updater generic 源，仅对 NSIS 安装版有效；feed 地址来自配置 `updateFeedUrl`，默认空不检查。打包配置里的 `build.publish` 是占位地址，发布前需要替换。
- **开发模式判断**：`process.env.ELECTRON_RENDERER_URL` 存在即 Vite 开发；主进程用 `app.isPackaged`。

## 约定

- 渲染层 UI 保持奶油白底 + 亮黄强调（`--color-sun`）、深棕文字、圆角胶囊按钮；不使用 emoji 作为 UI 图标（骨头贴图除外）。
- 主进程与渲染进程之间只通过 `src/shared/types.ts` 中的 IPC API 通信；新增字段必须同时更新 `AppConfig`、`normalize()`、模拟 API 与设置页。
- 配置文件只落本机 userData，不上传。
- 每次完成一个任务后执行 `git add -A && git commit`，**不要推送**（用户明确要求）。
- 测试优先用 `npm run dev:web` 的模拟数据；涉及真实接口时先用临时脚本验证端点，再在应用里跑。
- 打最终 exe 用 `npm run dist`，产物在 `release/`；打包后启动一次确认 `http://127.0.0.1:17800/overlay` 返回 200。
