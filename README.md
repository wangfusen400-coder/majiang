# 晋麻·扣点点（Android 联机版）

一个可运行的山西扣点点好友房 MVP。仓库包含 Expo/React Native 手机端、Cloudflare Workers 公网服务、Node.js 本地服务，以及可复用、带测试的麻将规则核心。

## 已实现

- 4 人好友房：创建 6 位房间号、加入、准备、开局、断线自动重连
- 服务端洗牌和裁决，其他玩家手牌不会下发到客户端
- 136 张带风 / 108 张不带风，可碰、可杠、不可吃
- 报听校验：至少存在一个 6 点及以上听口；报听后摸什么打什么
- 胡牌门槛：1–2 点不可胡，3–5 点仅可自摸，6 点及以上可接炮
- 普通胡、七对、豪华七对、清一色、一条龙、十三幺判断
- 自摸、接炮、明杠、暗杠、庄家加分、逐局及总积分
- 4/8/12 局、带风、带庄、留七墩和大胡番型建房配置
- Android APK 的 EAS 内测构建配置

公网服务：[`https://jin-mahjong-kdd.jin-mahjong.workers.dev`](https://jin-mahjong-kdd.jin-mahjong.workers.dev/health)

Android 安装包：[下载 APK](https://github.com/wangfusen400-coder/majiang/raw/refs/heads/main/dist/jin-mahjong-kdd-0.1.0.apk)

## 目录

```text
apps/mobile       Expo 安卓/iOS 客户端
apps/server       Node.js 联机服务
apps/cloudflare-worker Cloudflare Workers + Durable Objects 公网服务
packages/game-core 规则、牌型和计分核心
```

## 本地运行

需要 Node.js 22.13 或更高版本（项目使用稳定版 Expo SDK 57）。

```bash
pnpm install
pnpm server
```

另开一个终端：

```bash
pnpm mobile
```

手机安装 Expo Go 并扫码。手机与电脑在同一 Wi-Fi 时，把 App 首页“联网服务器”改成电脑局域网地址，例如 `http://192.168.1.20:3000`；Android 模拟器使用默认的 `http://10.0.2.2:3000`。

服务健康检查：`http://localhost:3000/health`。

## 构建 Android APK

本项目可以用本机安装在 `D:\software` 下的 JDK 17、Android SDK 和 Gradle 构建。先通过环境变量写入已部署且支持 HTTPS/WSS 的公网地址，再执行：

```powershell
$env:JAVA_HOME='D:\software\Java\jdk-17.0.20.1+1'
$env:ANDROID_HOME='D:\software\Android'
$env:GRADLE_USER_HOME='D:\software\Gradle'
$env:EXPO_PUBLIC_SERVER_URL='https://jin-mahjong-kdd.jin-mahjong.workers.dev'
Set-Location apps\mobile\android
.\gradlew.bat assembleRelease
```

构建产物位于 `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`。当前为可直接侧载的内测 APK；正式上架应用商店前应改为独立发布签名并生成 AAB。

## 部署公网服务

生产部署使用 Cloudflare Workers 与 Durable Objects。每个 6 位房间号对应一个独立 Durable Object，牌局状态持久化，实时连接使用可休眠 WebSocket；这避免了所有牌桌挤在同一个全局实例中。

```powershell
D:\software\Cloudflare\node_modules\.bin\wrangler.cmd login
D:\software\Cloudflare\node_modules\.bin\wrangler.cmd deploy --config apps\cloudflare-worker\wrangler.jsonc
```

当前健康检查地址为 `https://jin-mahjong-kdd.jin-mahjong.workers.dev/health`。Cloudflare 免费额度和限制可能调整，请以控制台及官方定价页为准；项目本身未配置任何付费资源。

本地开发仍可启动 Node.js 服务（只依赖 `PORT`）：

```bash
PORT=3000 pnpm server
```

本地 Node.js 服务的房间存于内存；Cloudflare 版本已持久化牌局。若正式商业运营，仍需增加账号体系、实名/隐私合规、观战审计和反作弊。

## 当前边界

- MVP 暂不支持“报听后保持原听口的暗杠/补杠”和抢杠胡。
- 同一张弃牌按“胡 > 杠 > 碰、逆时针最近座位优先”处理，不支持一炮多响。
- 规则默认采用常见山西扣点点口径；不同地区的耗子、风耗子、过胡、荒庄杠分等口径需要在正式发布前由目标牌友确认。
- 积分只用于牌局成绩，不提供充值、提现或任何现金兑换能力。

## 测试

```bash
pnpm test
```

当前覆盖普通胡、字牌合法性、七对/听口、庄家与自摸计分、四人开局、持久化恢复及 WebSocket 消息协议。
