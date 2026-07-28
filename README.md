# Project Zomboid 服务器配置管理面板

通过浏览器管理 Project Zomboid 专用服务器的配置、模组与终端。面板仅监听 `127.0.0.1`，远程访问需使用 SSH 隧道。

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
      "startArgs": ["-servername", "main"],
      "stopCommands": ["save", "quit"]
    }
  ]
}
```

其中：

- 所有路径都应使用绝对路径。
- `startArgs` 中 `-servername` 后的名称必须与 INI 文件名一致；`main` 对应 `main.ini`。
- 多个实例可继续添加到 `servers` 数组，但同一时间只能运行一个实例。

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

## 4. 可选参数

参数需放在 `npm start --` 之后：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port <number>` | 修改面板监听端口，范围为 `1-65535` | `3000` |
| `--config <path>` | 仅在首次启动且不存在 `servers-config.json` 时，为旧版配置迁移提供 INI 路径；不会改变 `servers-config.json` 的位置 | 无 |

例如，将面板端口改为 `8080`：

```bash
npm start -- --port 8080
```

对应的 SSH 隧道命令为：

```bash
ssh -N -T -L 8080:127.0.0.1:8080 user@your-server-ip
```
