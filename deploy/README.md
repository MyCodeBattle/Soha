# ldy 部署

生产入口：[https://soha.catsith.cc](https://soha.catsith.cc)。

服务器通过 `ssh ldy` 访问。应用安装在 `/srv/soha/releases/<版本>/`，
`/srv/soha/current` 指向正在使用的版本。应用以 `soha` 用户运行，
只监听 `127.0.0.1:3001`，Caddy 提供 HTTPS 和 WebSocket 反向代理。

## 更新

1. 本地运行 `npm run typecheck`、`npm test`、`npm run build`。
2. 上传项目源码、锁文件及 client/core/server 的 `dist` 到新的 release 目录。
3. 在 release 目录执行 `npm ci --omit=dev --workspace @soha/server --workspace @soha/core --include-workspace-root`。
4. 更新 `/srv/soha/current` 软链接并执行 `systemctl restart soha`。
5. 验证 `curl -f http://127.0.0.1:3001/api/health` 和 `curl -f https://soha.catsith.cc/api/health`。

首次部署时创建 `soha` 系统用户，安装本目录的 `soha.service` 到
`/etc/systemd/system/soha.service`，执行 `systemctl daemon-reload` 和
`systemctl enable --now soha`。将本目录 Caddyfile 的站点块添加到
`/etc/caddy/Caddyfile`，先 `caddy validate --config /etc/caddy/Caddyfile`，
再 `systemctl reload caddy`。修改 Caddy 配置前保留备份，并保留其他站点。

## 检查与回退

使用 `systemctl status soha` 和 `journalctl -u soha -n 100 --no-pager` 查看服务。
应用回退时把 `current` 指回之前的 release，再重启 `soha`。

房间和牌局保存在进程内存中；更新、回退或服务重启后，已有房间和邀请链接失效。
