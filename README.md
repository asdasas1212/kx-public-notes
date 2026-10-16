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

恢复旧版本时使用 `git revert` 创建恢复提交并推送，保留完整历史。自定义域名可稍后在仓库 Settings → Pages 中设置。

## 数据与资源

CSV 由浏览器本机处理；项目截图使用工具内置示例数据。本站不包含个人简历、联系方式、收款信息或未经证实的项目收益。
