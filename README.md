# KX 公开笔记

关于 AI、数据与机器人 VLA 的中文静态网站，附在浏览器内运行的 DataAudit CSV 检查工具。暂用 KX 署名，首批文章为 AI 辅助整理。

## 维护内容

- 文章和首页结构：修改 `build_site.py`，运行 `python3 build_site.py` 生成 `docs/`。
- 样式和交互：修改 `docs/style.css`、`docs/site.js`。
- CSV 工具：维护 `docs/tools/dataaudit/`。
- 本地预览：`python3 -m http.server 4178 --directory docs`。

## 发布

GitHub Pages 的发布来源设置为 `main` 分支的 `/docs` 目录。提交并推送到 `main` 后，Pages 自动发布。无需数据库、付费 API、服务器进程或第三方前端 CDN。

更新流程：修改内容 → 本地预览 → 提交并推送 → 等待 Pages 发布完成 → 检查线上页面。

普通 Git 网络可用时，可以克隆本仓库，正常提交和推送；恢复旧版本使用 `git revert`。自定义域名可稍后在仓库 Settings → Pages 中设置，绑定后需将 `build_site.py` 中 404 页的 base 路径调整为域名对应根路径。

## 当前环境的发布命令

本机目录是通过 API 发布的工作副本；需要普通 Git 工作流时，可在 Git 网络可用的环境克隆此仓库。

当前网络的 Git HTTPS 推送返回 HTTP 602，因此随项目提供 `publish_github.py`，通过 GitHub 官方 API 将变更保存为版本提交，并自动触发 Pages 发布：

```sh
python3 build_site.py
python3 publish_github.py
```

脚本复用 Git 的现有 GitHub 登录，不包含令牌，不把凭证上传到仓库；限定操作本网站仓库。它会保留远端版本历史，重复执行且没有内容变更时不会创建提交。远端在上传期间发生新提交时会停止分支更新。也可以直接在 GitHub 网页上编辑 `docs/` 中的页面，提交后同样自动发布。

## 数据与资源

CSV 由浏览器本机处理；项目截图使用工具内置示例数据。本站不包含个人简历、联系方式、收款信息或未经证实的项目收益。
