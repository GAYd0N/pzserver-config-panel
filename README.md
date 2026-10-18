# Project Zomboid 服务器配置管理面板

通过浏览器管理 Project Zomboid 专用服务器的配置、模组、备份与终端。面板仅监听 `127.0.0.1`，远程访问需使用 SSH 隧道。

## 1. 安装

需要 Node.js 18 或更高版本。

```bash
git clone https://github.com/g0g5/pzserver-config-panel.git
cd pzserver-config-panel
npm install
npm run build
```

## 2. 第一次使用前的配置

配置面板前，必须先为每个实例手动运行过 PZ 服务器的 `start-server.sh`。例如：

```bash
cd /home/pz/pzserver
./start-server.sh -servername main
```

等待服务器完成初始化后，在服务器控制台执行 `quit` 退出。此过程会生成配置文件，例如 `/home/pz/Zomboid/Server/main.ini`。

确认以下文件和目录均已存在，并且运行面板的用户具有读写权限：

- PZ 启动脚本，例如 `/home/pz/pzserver/start-server.sh`
- 实例 INI 文件，例如 `/home/pz/Zomboid/Server/main.ini`
- Workshop 的 `108600` 目录，例如 `/home/pz/pzserver/steamapps/workshop/content/108600`
- 存档文件夹，例如 `/home/pz/Zomboid/Saves/Multiplayer/main`（可选，用于创建备份）

复制配置模板：

```bash
cp servers-config.json.example servers-config.json
```

编辑 `servers-config.json`：

```json
{
  "global": {
    "workshopPath": "/home/pz/pzserver/steamapps/workshop/content/108600",
    "startScriptPath": "/home/pz/pzserver/start-server.sh",
    "stopGraceTimeoutMs": 45000,
    "forceKillTimeoutMs": 10000
  },
  "servers": [
    {
      "id": "main",
      "name": "主服务器",
      "iniPath": "/home/pz/Zomboid/Server/main.ini",
      "savePath": "/home/pz/Zomboid/Saves/Multiplayer/main",
      "startArgs": ["-servername", "main"],
      "stopCommands": ["save", "quit"],
      "scheduledCommands": []
    }
  ]
}
```

其中：

- 所有路径都应使用绝对路径。
- `startArgs` 中 `-servername` 后的名称必须与 INI 文件名一致；`main` 对应 `main.ini`。
- 多个实例可继续添加到 `servers` 数组，但同一时间只能运行一个实例。
- `scheduledCommands` 配置定时命令：`action` 支持 `start`、`stop`、`force-stop`、`restart`、`backup`；`name` 为显示名称，`cron` 使用 5 字段格式（分 时 日 月 周，本地时间）并仅用于持久化。定时任务仅在面板运行期间触发，同一分钟内的同一任务只执行一次。也可以在面板的「全局设置 → 当前实例设置 → 定时命令」中通过弹窗添加或编辑，确认后自动保存。
- `savePath` 指定当前实例的存档文件夹，必须是绝对路径。在面板的「备份配置」栏目中可以设置该路径、立即创建备份，或查看和删除已有备份。备份由 `tar` 创建为 `.tar.gz` 压缩包，保存在存档文件夹的上级目录中，压缩包包含整个存档文件夹和该实例的服务器 INI 配置，命名格式为 `服务器名-backup-日期-时间.tar.gz`；定时命令选择「创建备份」时也会执行相同操作。备份进行期间会显示当前状态并暂停创建新的备份，避免同时生成多个压缩包。
- 在「模组配置」中点击「检测失效」会通过 Steam 的 `ISteamRemoteStorage/GetPublishedFileDetails` 接口检查 `WorkshopItems` 中的项目是否仍可下载。已删除或隐藏、被封禁、非公开的项目会在列表顶部单独列出；如果项目在本地 Workshop 目录中仍存在文件，会标记为「本地可用」，表示服务器仍可正常启动。该检测需要面板主机能够访问 `api.steampowered.com`。

完成配置后，在项目目录启动面板：

```bash
npm start
```

## 3. 通过 SSH 隧道访问

在本地电脑执行以下命令。`-N` 表示只建立隧道、不进入远程 Shell，`-T` 表示不分配终端：

```bash
ssh -N -T -L 3000:127.0.0.1:3000 user@your-server-ip
```

保持该命令运行，然后在本地浏览器访问：

```text
http://localhost:3000
```

## 4. 启动面板

推荐使用启动脚本。脚本会自动检查并编译尚未构建或源码已更新的后端代码：

Windows PowerShell：

```powershell
# 默认监听 127.0.0.1:3000
.\start-panel.ps1

# 指定绑定地址和端口
.\start-panel.ps1 -BindAddress 0.0.0.0 -Port 8080
```

Linux / macOS：

```bash
chmod +x start-panel.sh
./start-panel.sh
./start-panel.sh --host 0.0.0.0 --port 8080
```

也可以不使用脚本，先构建再启动：

```bash
npm run build
npm start -- --host 127.0.0.1 --port 8080
```

> **安全提示**：面板没有身份认证，默认只监听 `127.0.0.1`，应通过 SSH 隧道访问。绑定到 `0.0.0.0` 或其他非回环地址会让网络中的其他设备访问面板，请自行增加访问控制或防火墙规则。

### 可选参数

以下参数用于 `npm start --`。启动脚本的参数见上一节：Windows 使用 `-BindAddress` / `-Port`，Linux/macOS 使用 `--host` / `--port`。

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--host <address>` | 修改面板绑定的地址，例如 `127.0.0.1`、`0.0.0.0`、`::1` | `127.0.0.1` |
| `--port <number>` | 修改面板监听端口，范围为 `1-65535` | `3000` |
| `--config <path>` | 仅在首次启动且不存在 `servers-config.json` 时，为旧版配置迁移提供 INI 路径；不会改变 `servers-config.json` 的位置 | 无 |

例如，将面板绑定到所有网卡并修改端口为 `8080`：

```bash
npm start -- --host 0.0.0.0 --port 8080
```

使用默认回环地址时，SSH 隧道命令为：

```bash
ssh -N -T -L 8080:127.0.0.1:8080 user@your-server-ip
```
