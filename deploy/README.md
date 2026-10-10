# ldy 部署

生产入口：[https://soha.catsith.cc](https://soha.catsith.cc)。

代码仓库：[MyCodeBattle/Soha](https://github.com/MyCodeBattle/Soha)。
服务器通过 `ssh ldy` 访问，GitHub SSH 访问使用服务器现有密钥。
项目直接在 `/root/Codes/Soha` 拉取、构建和运行，不使用额外的 release 目录。
应用以 `soha` 用户运行，
只监听 `127.0.0.1:3001`，Caddy 提供 HTTPS 和 WebSocket 反向代理。

## 更新

本地先构建 core，再验证并推送 main：

```bash
npm run build -w @soha/core
npm run typecheck
npm test
npm run build
git push origin main
```

然后一条命令更新服务器：

```bash
ssh ldy 'bash /root/Codes/Soha/deploy/update.sh'
```

脚本要求服务器工作区干净且位于 main，通过 `git pull --ff-only origin main`
同步，停止服务后安装依赖、检查类型、运行 core/server 单元测试并构建全部包，
最后更新 systemd 服务、重启并检查内外网健康状态。
布局浏览器测试在本地运行，服务器无需安装 Chrome。更新期间服务暂时不可用；
失败会停止发布并打印此前的 Git 提交，按下方回退步骤恢复。

## 首次安装

在 ldy 上以 root 执行：

```bash
mkdir -p /root/Codes
git clone --branch main git@github.com:MyCodeBattle/Soha.git /root/Codes/Soha
bash /root/Codes/Soha/deploy/update.sh
systemctl enable soha
```

首次部署前创建 `soha` 系统用户；ldy 已有该用户和 Caddy 配置。
服务通过 `ProtectHome=tmpfs` 与 `BindReadOnlyPaths=/root/Codes/Soha`
仅暴露项目目录给 soha 进程，保持宿主机 `/root` 权限和其他内容的隔离。
参见 [systemd 文档](https://github.com/systemd/systemd/blob/v255/man/systemd.exec.xml)。
若部署到新服务器，将本目录 Caddyfile 的站点块添加到
`/etc/caddy/Caddyfile`，先 `caddy validate --config /etc/caddy/Caddyfile`，
再 `systemctl reload caddy`。修改 Caddy 配置前保留备份，并保留其他站点。

## 检查与回退

使用 `systemctl status soha` 和 `journalctl -u soha -n 100 --no-pager` 查看服务。
需要回退时，在同一个项目目录检出此前正常运行的提交并重新构建：

```bash
cd /root/Codes/Soha
systemctl stop soha
git switch --detach <此前正常运行的提交>
npm ci --include=dev
npm run build -w @soha/core
npm run build
systemctl restart soha
curl -f http://127.0.0.1:3001/api/health
curl -f https://soha.catsith.cc/api/health
```

修复已推送到 GitHub 后，执行 `git switch main`，再运行 `bash deploy/update.sh`。

房间和牌局保存在进程内存中；更新、回退或服务重启后，已有房间和邀请链接失效。
