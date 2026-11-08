# BoneBowl

B站直播间礼物驱动的骨头掉落叠加层。观众投喂指定礼物，骨头会掉进碗里，带真实的碰撞、堆叠和弹跳。画面通过 OBS 浏览器源叠加到直播中。

![设置页](docs/screenshot-settings.png)

![叠加层](docs/screenshot-overlay.png)

## 技术栈

- Electron + Vite + TypeScript，打包为 Windows 可执行文件
- React + Tailwind CSS + Framer Motion，设置界面
- PixiJS 渲染，Rapier2D（WASM）物理
- B站直播信息流协议自实现：Wbi 签名 + WebSocket 封包解析，不依赖第三方直播库

## 开发

```bash
npm install
npm run dev
```

只预览界面（不启动 Electron，使用内置模拟数据）：

```bash
npm run dev:web
```

浏览器打开 `http://localhost:5199` 查看设置页，`http://localhost:5199/overlay?test=1&debug=1` 查看叠加层（`test=1` 会自动投喂演示骨头）。

## 构建与打包

```bash
npm run build
npm run dist
```

`npm run dist` 使用 electron-builder 输出 Windows 安装版（NSIS）和便携版 exe，产物在 `release/`。

Electron 二进制如果没有随 `npm install` 下载成功，执行：

```bash
node node_modules/electron/install.js
```

## 使用

1. 启动应用，在「直播间」填写直播间号（示例 `30866874`）。需要显示观众昵称时点「扫码登录」，用 B站手机客户端扫码确认；也可以手动粘贴 SESSDATA。
2. 点击「连接直播间」。成功后面板显示「直播中」，内置自动重连。
3. 在「礼物映射」添加规则：礼物 ID、每份骨头数量、大小。也可以点「导入礼物」从当前直播间的礼物面板拉取列表（通常需要填写 SESSDATA）。
4. 在「叠加层」复制浏览器源地址，填进 OBS 的「浏览器」来源，宽高 1920 × 1080，勾选「场景激活时刷新浏览器」。同一页可以调骨头大小和骨头消失时长（0 表示一直保留，达到 100 根上限后才清理最旧的）。
5. OBS 不需要色键，页面背景本身透明。不要用窗口采集。
6. 直播期间保持应用运行；最小化不影响叠加层，关闭应用会断开连接与本地服务。

自动更新：安装版（NSIS）支持在「应用更新」里填写 generic 更新源，启动时检查并下载；便携版 exe 需要手动替换。更新源目录需包含 `latest.yml` 与安装包，可用任意静态服务器。

配置保存在 Electron 的 userData 目录（`config.json`），只在本机。

## 目录

```
src/
  main/            Electron 主进程：配置、HTTP/WS 服务、B站连接
    bilibili/      Wbi 签名、REST 接口、信息流 WebSocket 客户端
  preload/         contextBridge API
  renderer/
    src/settings/  设置页
    src/overlay/   Pixi + Rapier 叠加场景
  shared/          主进程与渲染进程共享类型
```

## 协议说明

直播礼物走 B站信息流 WebSocket 的 `SEND_GIFT` 消息。2025 年 5 月起 `getDanmuInfo` 强制 Wbi 签名，并要求 Cookie 中有 `buvid3`；匿名连接时 B站会打码观众昵称。实现细节参考 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)。

该接口并非官方公开 API，账号或协议可能因风控变化失效。连接异常时应用会退避重连，并保留叠加层运行。
