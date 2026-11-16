# 橘智课程同步接口

协议 `courseforge.delivery.v1` · 2026-11-15

CourseForge 已实现可配置的 HTTP 同步客户端。橘智接收端按本协议提供一个导入地址后，用户即可在「橘智交付」填写地址、检测连接、选择已验收课程并确认发送。普通网站首页或任意 Webhook 不符合此约定时不能导入。本仓库不包含橘智接收服务。

同步只传输已有内容，不调用模型、不删除其他课程、不自动公开发布。每次只处理选中的叶子课程，并在橘智创建或更新草稿。

## 使用流程

1. 接收端实现下面的 GET、POST 和跨域规则；先用测试库核对字段映射。
2. 打开「橘智交付」，填写完整 API 地址，例如 `https://你的域名/api/courseforge/imports`。
3. 如需鉴权，展开「访问令牌」，填写只允许课程导入的短期 Token。不要使用模型密钥、数据库密码或长期管理员密钥。
4. 点击「保存并检测接口」。这一步只发送 GET，不传课程。
5. 确认课程结构，并验收当前版本的纲要和正文。练习可选；内容改变后需重新验收。
6. 选择课程，查看确认弹层中的目标地址与完整 JSON，确认后发送。在返回结果中核对草稿 ID，再到橘智预览。

示例模式 `?demo=1` 可以查看字段，但禁用连接检测和外部发送。真实橘智联调需要实际接收端；本仓库的浏览器测试使用独立本机接收服务。

## 地址与请求头

GET 和 POST 使用同一地址，无查询参数、账号密码或锚点。正式地址必须使用 HTTPS；本机调试允许 `http://localhost`、`http://127.0.0.1` 和 `http://[::1]`。前端不携带 Cookie、不跟随重定向。

| 请求头 | 用途 |
| --- | --- |
| `Accept: application/json` | GET、POST 均要求 JSON 返回 |
| `Authorization: Bearer <短期导入令牌>` | 需要鉴权时发送；接收端验证权限与有效期 |
| `Content-Type: application/json` | POST 请求体 |
| `Idempotency-Key: <delivery_id>` | POST 去重编号，与请求体中的 UUID 相同 |

Token 只在当前页面内存中保存，刷新或修改接口地址后需要重新填写；不写入 URL、浏览器持久存储或构建环境变量。接收端应限制令牌的用户、目标工作区、操作权限和有效期，不把 CORS 或浏览器审核标记当作鉴权。

## GET 连接检测

返回 HTTP 200：

```json
{
  "protocol": "courseforge.delivery.v1",
  "capabilities": {
    "draft_import": true,
    "idempotency": true
  },
  "max_courses": 20
}
```

上述字段均必需。`max_courses` 为正整数；当前前端每批最多发送 `min(max_courses, 50)` 门。只有支持草稿导入与幂等处理的接口才能通过检测。通过检测表示协议兼容，不表示已导入，也不保证后续每次写入都成功。

## POST 导入字段

顶层字段全部必需：

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `protocol` | string | 固定 `courseforge.delivery.v1` |
| `delivery_id` | string | 本批请求 UUID；重试原批次时保持不变 |
| `source_instance_id` | string | 来源实例 UUID，保存在当前浏览器 |
| `target_status` | string | 固定 `draft` |
| `scope` | string | 固定 `selected_courses`，不是全量替换 |
| `subject` | object | `id`、`name`：课程计划的来源 ID 和名称 |
| `courses` | array | 非空，仅包含此次选中的已验收课程，不超过检测返回的上限 |

每个 `courses[]` 对象包含：

| 字段 | 类型 | 约定 |
| --- | --- | --- |
| `source_key` | string | 稳定标识，形如 `course:123` 或 `subcategory:456` |
| `source_id` | string | 课程或子分类的来源 ID |
| `source_type` | string | `course` 或 `subcategory` |
| `title` | string | 课程名称 |
| `position` | integer | 在当前计划叶子课程列表中的顺序，从 0 开始；选择子集时不重新编号 |
| `parent` | object / null | 子分类提供父级 `{ "id": "…", "title": "…" }`；普通课程为 null |
| `content_version` | string | 内容字段的 SHA-256，64 位小写十六进制 |
| `outline` | object | `title`、`description`、`prerequisites[]`、`learning_outcomes[]`、`sections[]`；章节含 `title`、`content`、`key_points[]` |
| `material` | object | `course_title`、`sections[]`；章节含 `title`、`body`、`summary`，`body` 为 Markdown |
| `questions` | array | 可为空；题目含 `question`、`options`、`correct_answers[]`、`explanation`、`difficulty`；`options` 是选项键到文字的对象 |
| `review` | object | `status="approved"`、`reviewed_at`（ISO 时间或 null）、`method="browser_local_manual"` |

纲要、材料和练习沿用生成 API 的内容结构；接收端必须验证类型、必需内容、题目答案与选项对应关系，并设置请求大小、正文长度与数组数量限制。不依赖额外的未知字段执行指令。前端移除了内部关联用的 `outline.lectureId` 和 `material.materialId`，不会发送审核备注、后端连接信息或模型密钥。

审核信息只是浏览器本地的人工结论，不是服务端签名或质量认证。课程名称、结构、正文、练习仍应按用户内容处理，渲染 Markdown 时独立进行安全过滤。

### 请求示例

下例中的 SHA-256 是占位说明，实际请求由前端计算并组装，可在发送前的弹层中完整查看。

```json
{
  "protocol": "courseforge.delivery.v1",
  "delivery_id": "d99bf727-e0eb-4d1c-96c7-f3eef8c375ba",
  "source_instance_id": "d8e1eb51-e93d-4858-9bfe-df7eb58139ef",
  "target_status": "draft",
  "scope": "selected_courses",
  "subject": { "id": "subject-1", "name": "统计学入门" },
  "courses": [{
    "source_key": "course:course-1",
    "source_id": "course-1",
    "source_type": "course",
    "title": "描述性统计",
    "position": 0,
    "parent": null,
    "content_version": "由客户端计算的64位SHA-256",
    "outline": {
      "title": "描述性统计",
      "description": "理解数据的集中趋势与离散程度。",
      "prerequisites": ["基本算术"],
      "learning_outcomes": ["解释均值的含义"],
      "sections": [{ "title": "集中趋势", "content": "均值及其适用条件", "key_points": ["均值"] }]
    },
    "material": {
      "course_title": "描述性统计",
      "sections": [{ "title": "集中趋势", "body": "## 均值\n均值是所有数值的总和除以数量。", "summary": "结合分布理解均值。" }]
    },
    "questions": [{
      "question": "以下哪项描述集中趋势？",
      "options": { "A": "均值", "B": "方差" },
      "correct_answers": ["A"],
      "explanation": "均值描述集中趋势。",
      "difficulty": "easy"
    }],
    "review": { "status": "approved", "reviewed_at": "2026-11-15T08:00:00.000Z", "method": "browser_local_manual" }
  }]
}
```

### 内容指纹

取单门课程的 `source_key`、`source_id`、`source_type`、`title`、`position`、`parent`、`outline`、`material`、`questions`，排除 `content_version` 与 `review`。递归排序对象键，保持数组顺序，按下面的 JavaScript 序列化规则得到无缩进 JSON，再对 UTF-8 字节计算 SHA-256。

```js
const canonicalJSON = value => JSON.stringify(value, (_, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item
)
```

这不是 RFC 8785 规范的声明。其他语言实现需匹配 JavaScript 的键顺序、数字和 Unicode 序列化行为；以 [客户端实现](../src/utils/delivery.js) 与 [测试](../tests/delivery.test.js) 为准。指纹用于版本比较，不用于鉴权，也不能证明课程内容正确。

## POST 最终结果

接收端完成处理后返回 HTTP 200 或 201，即使只有部分课程成功，也要逐项给出最终结果。每门课程必须回传对应的 `source_key` 和 `content_version`。

```json
{
  "protocol": "courseforge.delivery.v1",
  "delivery_id": "d99bf727-e0eb-4d1c-96c7-f3eef8c375ba",
  "results": [{
    "source_key": "course:course-1",
    "content_version": "与请求中完全一致的content_version",
    "status": "created",
    "target_id": "juzhi-draft-1",
    "target_status": "draft",
    "message": ""
  }]
}
```

| `status` | 含义 | 前端处理 |
| --- | --- | --- |
| `created` | 已创建草稿 | 必须包含非空 `target_id` 和 `target_status="draft"` 才确认成功 |
| `updated` | 已更新已有草稿 | 同上 |
| `unchanged` | 同一版本已存在，无需修改 | 同上 |
| `failed` | 此项确定失败，没有未确认的写入 | 展示原因，可只选择未成功项创建新请求 |
| `conflict` | 目标被人工修改或映射不明确，未覆盖 | 展示冲突，先处理接收端映射或版本问题 |

`message` 为可选的简短用户提示，不返回凭据、堆栈或数据库信息。前端仅展示最多 500 字符，并按纯文本处理。成功状态不能仅返回 `ok: true`；结果缺项、版本不匹配、缺少草稿 ID、重复结果或请求编号错误均不能当作已完成。

GET 超时为 30 秒，POST 为 60 秒。HTTP 202 只表示受理，不是最终结果，v1 客户端不会把它算作成功，也没有异步状态查询接口。接收端应限制每批规模，让导入在时限内完成。

## 去重与重试

幂等意味着同一请求即使被发送多次，也只产生一次业务写入。接收端不能只在 GET 中声明支持，而不实际实现。

1. 使用“已认证的目标工作区 + `source_instance_id` + `delivery_id`”记录请求、请求体指纹和逐项结果。请求头与正文编号必须一致。
2. 同编号、同请求体返回原结果；同编号、不同请求体返回 HTTP 409，不覆盖原请求。并发请求也必须受唯一约束或事务保护，避免先写后登记造成重复。
3. 使用“目标工作区 + `source_instance_id` + `source_key`”保存来源到草稿的持久映射。不同请求重复提交相同 `content_version` 时返回 `unchanged`，而不是新建另一门课程。
4. 新版本只更新对应草稿。若橘智中有人编辑过该草稿，应检测并返回 `conflict`；不要无提示覆盖人工修改，也不修改已公开版本。
5. 旧的手工 MongoDB 导入需要先建立映射；不要只凭课程标题猜测同一内容。来源实例或工作区变更也需要迁移映射。

有明确 `failed` / `conflict` 结果时，用户可选择这些课程，以新编号发送修复后的请求。网络中断、超时、HTTP 错误或不完整结果则保留原编号和原内容；即便当前课程已修改，恢复操作仍发送上次确认的版本。浏览器重新加载后不自动发送，用户需重新检测原接口并确认重试。

未确认请求处理完前，前端不会开启另一批同步。接收端应持久保存幂等记录；若采用保留期限，过期后的旧编号应拒绝并人工核对，不能静默当作新导入。服务端返回结果前必须完成持久化；不能用 `created` 表示仍在排队的工作。

## 跨域配置

JSON POST 与自定义请求头可能触发浏览器 OPTIONS 预检。接收端需允许实际部署的前端 Origin、GET / POST / OPTIONS，以及 Content-Type、Authorization、Idempotency-Key。预检通常不含业务令牌，OPTIONS 可以只做 Origin 与请求方法检查，实际 GET、POST 仍必须验证权限。[MDN CORS 指南](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

本地开发响应头示例，端口需与实际前端一致：

```http
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Idempotency-Key
Vary: Origin
```

实际 GET、POST 及错误响应也要附带允许来源的响应头。使用明确白名单，不把任意 Origin 原样反射。浏览器中的 `localhost` 与 `127.0.0.1` 是不同 Origin；HTTPS 页面访问 HTTP 服务还可能被混合内容策略阻止。不要通过关闭浏览器安全策略解决连接失败。

## 本地记录与验证

浏览器保存接口地址、来源实例 ID、最近 20 批回执和未确认批次的完整课程内容。原请求在发送前保存，最终结果确认后移除原文，只留下回执；Token 不进入这些记录。存储不可用时阻止发送。清除存储或更换浏览器会改变来源实例，应先备份并在接收端核对映射，避免重复建课。

回执表示“接收端确认过这个版本”，不是远端实时状态。前端不会检测之后在橘智发生的编辑、删除或发布。超过 20 批的本地回执可能被淘汰，真正的去重依赖接收端持久映射，不依赖复选框。

验收至少包括：鉴权失败、错误协议、部分成功、版本冲突、相同请求并发、保存后响应丢失、刷新后原样重试、同版本新编号重复提交、CORS 预检和目标草稿实际可预览。`tests/delivery-browser.mjs` 已提供本机接收端测试；真实橘智仍需按其存储、鉴权与发布规则完成联调。
