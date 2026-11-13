# CLAUDE.md

BoneBowl：B站直播礼物驱动的骨头掉落 OBS 叠加层。Electron + React 设置页，PixiJS + Rapier2D 物理叠加层，B站直播协议自实现。

## 常用命令

```bash
npm run dev        # Vite + Electron 全量开发（渲染层 5173，本地叠加服务 17800）
npm run dev:web    # 只起 Vite（5199）+ 预览用叠加层服务，浏览器预览界面，带模拟数据
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
  index.ts         窗口、IPC、礼物映射、生命周期
src/preload/       contextBridge API
src/renderer/src/
  settings/        设置页（直播间、礼物映射、叠加层、事件）
  overlay/         Pixi + Rapier 叠加场景（game.ts / sprites.ts）
src/shared/        主进程与渲染进程共享类型
```

## 关键约束

- **B站协议**：`getDanmuInfo` 需要 Wbi 签名与 Cookie 中的 `buvid3`；信息流是 WebSocket 二进制封包（protover 2/3，zlib/brotli），认证 op=7、心跳 op=2、消息 op=5。必须登录（配置里有 `sessdata`）才允许连接直播间，自动连接同样受此限制。
- **扫码登录**：`passport.bilibili.com/x/passport-login/web/qrcode/generate` 生成，poll 返回 0/86101/86090/86038。成功时保存 `SESSDATA`、`bili_jct` 和 poll 返回的 `refresh_token`，主进程同时清理登录 UID 缓存。设置页只提供扫码登录，不保留手动粘贴输入框。登录后必须用 `x/web-interface/nav` 在线校验 `isLogin`：设置页加载、扫码成功、连接直播间前都会校验；校验为失效时拒绝连接并提示重新扫码。二维码有效期 180 秒，弹窗内有倒计时并在归零时标记过期。
- **Cookie 自动续期**：校验/连接前调 `cookie/info` 检查，需要时用 JWK 公钥 RSA-OAEP(SHA-256) 生成 `CorrespondPath`，取 `refresh_csrf` 后调 `cookie/refresh` 与 `confirm/refresh`，把新的 `SESSDATA`/`bili_jct`/`refresh_token` 写回配置；任一步失败就退回原有的失效校验流程。`refresh_token` 一次性，必须同步保存新值。浏览器预览通过 `/bili-passport` 代理申请真实二维码，`/bili-poll` 与 `/bili-refresh`（`vite.devPlugin.ts`）在本地 dev 服务端复用同一套轮询与续期逻辑。
- **礼物事件**：B站现在主要下发 `SEND_GIFT_V2`：JSON 里 `data.pb` 是 base64 的 SendGiftV2 protobuf（字段 1 uid、2 uname、10 repeated GiftItem；GiftItem 1 gift_id、2 gift_name、3 num、5 price、8 coin_type、9 tid、10 timestamp），`client.ts` 内置最小 protobuf 解码并归一成 `SendGiftData`，旧的 JSON `SEND_GIFT` 仍兼容；按 `tid` 去重。映射规则见 `AppConfig.gifts`，**按礼物名称匹配**（`data.giftName` 去空白后与规则 `name` 比较），同名的多个 B站礼物 ID 视为同一礼物，列表与映射都按名称去重；`giftId` 仅保留在配置里，不参与匹配；单条最多 40 根骨头。每条规则用 `scale`（0.5–5.0，映射里的滑块或数字框）控制骨头大小，`GiftEvent.scale` 原样传给物理层；每条规则的 `item`（`bone` / `poop`）决定掉落骨头还是粑粑，默认 `bone`，叠加层按类型生成对应贴图。不再有全局大小配置。映射行右侧的烧瓶按钮按该规则试投。设置页「选择礼物」弹窗优先调用 `giftPanel/giftConfig?platform=pc`（完整礼物库，约 1000 条），为空时退回 `giftPanel/roomGiftList`（`platform` 必须传 `pc`，传 `web` 返回空列表）；礼物图标取 `webp`/`img_basic`，渲染时加 `referrerPolicy="no-referrer"`，否则图床按 Referer 返回 403；接口价格单位是金瓜子，界面按 1 电池 = 100 金瓜子换算展示。浏览器预览通过 `vite.preview.config.ts` 的 `/bili-live` 代理直连接口，代理未生效（例如改了配置没重启 dev server）时弹窗直接报错，不再回退到示例数据。
- **叠加层**：透明背景，1920×1080 设计坐标缩放适配；骨头用系统 🦴 字形生成贴图并裁剪，粑粑用随包 PNG 素材 `src/renderer/src/assets/poop.png`（四边泛洪去白底后裁剪，加载失败退回矢量）；碗的碰撞体是“外壁 + 碗口 + 内壁”的闭合截面，碗宽固定为画布宽度的 1/4（按碗沿外径量），精灵用 `BOWL_SPRITE_SCALE`，碰撞体换算设计坐标用 `BOWL_WORLD_SCALE`（额外乘 `BOWL_PIXEL_RATIO`，否则物理碗会比可见碗小一半）；碗前壁半透明（约 58%）；碗壁文字由 `bowlText` 配置（留空不显示），拉丁字形用系统 Ink Free、中文用随包的志莽行书（`src/renderer/src/assets/fonts/zhi-mang-xing.ttf`，绘制前经 FontFace 加载），超过 420 绘制像素自动缩字号；不给碗加隐形挡墙；画面底部有一层地面碰撞，溢出碗外的骨头落在上面按消失时长淡出，不会掉出画面；收到礼物只在碗里掉骨头，不在碗上方显示投喂文字；骨头数量上限 200，可设置消失时长（0–3600 秒，0 = 永不）。`OverlayServer.broadcast()` 返回实际广播到的客户端数，试投结果会带到设置页；设置页叠加层标题旁显示「OBS 已连接 / 未连接」。服务端每 15 秒 ping 一次并在下一轮清理不响应的半开连接，接入/断开都会打印日志和当前连接数。浏览器预览由 `vite.devPlugin.ts` 内嵌一个 `OverlayServer`（端口占用时自动顺延），`/dev-test-gift` 通过真实 WebSocket 广播试投并返回客户端数；叠加层地址带 `ws=<端口>`，未带时 5173/4173/5199 默认连 17800。
- **开发模式判断**：`process.env.ELECTRON_RENDERER_URL` 存在即 Vite 开发；主进程用 `app.isPackaged`。

## 约定

- 渲染层 UI 保持奶油白底 + 亮黄强调（`--color-sun`）、深棕文字、圆角胶囊按钮；不使用 emoji 作为 UI 图标（骨头贴图除外）。
- 主进程与渲染进程之间只通过 `src/shared/types.ts` 中的 IPC API 通信；新增字段必须同时更新 `AppConfig`、`normalize()`、模拟 API 与设置页。
- 配置文件只落本机 userData（`%APPDATA%\bonebowl\config.json`），不上传；浏览器预览通过 `vite.devPlugin.ts` 的 `/dev-config` 读写同一份文件，模拟 API 不再使用 localStorage。每次写入前会把上一版备份到 `config.json.bak`；测试时用环境变量 `BONEBOWL_CONFIG_PATH` 指向临时文件，**不要覆盖真实配置**。Electron 应用运行时会把配置缓存在内存里，两边同时改可能互相覆盖，改预览配置前先关掉应用。
- 每次完成一个任务后执行 `git add -A && git commit`，**不要推送**（用户明确要求）。
- 所有提交信息使用中文（Conventional Commits 前缀保留英文，例如 `fix: 修复…`）。
- 测试优先用 `npm run dev:web` 的模拟数据；涉及真实接口时先用临时脚本验证端点，再在应用里跑。
- 打最终 exe 用 `npm run dist`，产物在 `release/`；打包后启动一次确认 `http://127.0.0.1:17800/overlay` 返回 200。
