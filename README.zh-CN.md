# CourseForge 前端

简体中文 | [English](README.md)

CourseForge 是一个 AI 辅助学习资料工作台。用户只需输入学科名称，即可浏览生成的课程体系，将课程展开为子分类，生成课程纲要、完整学习材料，并通过自动生成的选择题进行练习。

本仓库是 Vue 前端，需要配套的 FastAPI 服务才能生成和持久化内容。

## 功能

- 根据名称创建单个或多个学科
- 浏览学科、课程及子分类
- 单独或批量生成课程纲要、学习材料和考试题
- 在页面切换时继续跟踪耗时较长的后台生成任务
- 重新生成纲要、材料和题目
- 以章节形式阅读生成的学习材料
- 完成单选或多选题，并查看分数与解析

## 技术栈

- Vue 3（Composition API）
- Pinia
- Vite 5
- 浏览器原生 Fetch API

## 环境要求

- Node.js 18 或更高版本
- npm 9 或更高版本
- 已运行的 CourseForge API、MongoDB、Redis 和 ARQ Worker

## 快速开始

```bash
git clone <你的前端仓库地址>
cd <前端仓库目录>
npm install
```

复制环境变量示例，并按需修改后端地址：

```bash
cp .env.example .env
```

Windows PowerShell 请使用 `Copy-Item .env.example .env`。

启动开发服务器：

```bash
npm run dev
```

打开 <http://localhost:5173>。默认后端地址为 `http://localhost:8000/api`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api` | CourseForge API 的基础地址 |

所有以 `VITE_` 开头的变量都会被写入浏览器构建产物，请勿在其中存放 API Key 或其他秘密信息。

## 常用命令

```bash
npm run dev      # 启动本地开发服务器
npm run build    # 在 dist/ 中生成生产构建
npm run preview  # 本地预览生产构建
```

## 项目结构

```text
src/
├── api/
│   └── index.js        # HTTP 请求与任务轮询
├── stores/
│   └── course.js       # 课程数据和生成状态
├── App.vue             # 当前应用界面与交互逻辑
└── main.js             # Vue 与 Pinia 入口
```

## 生成流程

1. 前端将学科名称提交给 API。
2. API 生成课程骨架并写入 MongoDB。
3. 展开课程、生成纲要、材料和考试的任务被提交到 Redis。
4. ARQ Worker 调用大模型并保存结果。
5. 前端批量轮询任务 ID，并在每项任务完成后更新界面。

## 生产部署提示

- 构建前将 `VITE_API_URL` 设置为线上后端的 HTTPS 地址。
- 在后端为前端域名配置严格的 CORS 白名单。
- 将 `dist/` 部署到静态托管服务或 CDN。
- 不要提交 `.env`、`node_modules/`、`.vite/` 和 `dist/`。
- 生成内容属于模型输出，用于重要学习或评测前应由人工复核。

## 当前状态

项目目前处于早期阶段。界面代码仍集中在一个较大的组件中，尚未加入前端自动化测试、代码规范检查、身份认证和统一的用户错误提示。

## 参与贡献

欢迎提交 Issue 和 Pull Request。较大改动建议先通过 Issue 讨论预期行为。请勿提交生成文件或凭据，并在提交前运行 `npm run build`。

## 许可证

本项目采用 MIT License，详情请参阅 [LICENSE](LICENSE)。

