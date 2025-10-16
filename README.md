# DeepSeek · Amazon 标题五点生成（全栈） — amazontitl-DS

前端 React (Vite) + 后端 Node/Express，后端安全持有 DeepSeek API Key，并记录历史到 SQLite。可一键部署到 Zeabur。

## 本地运行
```bash
npm i
cp server/.env.example server/.env
# 编辑 server/.env 写入你的 DEEPSEEK_API_KEY
npm run build
npm start
# 打开 http://localhost:3000
```

## Zeabur 部署
- 仓库导入 Zeabur
- 环境变量：`DEEPSEEK_API_KEY=你的key`（必须）
- Build Command: `npm run build`
- Start Command: `npm start`

> 获取 Key：访问 https://platform.deepseek.com/ 登录后创建 API Key。API 文档见 https://api-docs.deepseek.com/

## API
- POST `/api/generate` 传入：
```json
{
  "locale":"US_en|UK_en|DE_de|JP_ja|CN_zh",
  "model":"deepseek-chat|deepseek-reasoner",
  "name":"产品名称",
  "node":"产品节点/类目",
  "color":"颜色",
  "size_or_volume":"尺寸或体积",
  "capacity":"容量",
  "weight":"质量/重量",
  "material":"可选",
  "brand":"可选"
}
```
返回：
```json
{ "title":"...", "bullets":["...","...","...","...","..."] }
```

- GET `/api/history?limit=20` 返回最近生成记录


---

## 交互增强（ABP）
- **A 类目模板**：GET `/api/presets`，前端下拉一键套用示例参数。
- **B 重新生成**：在结果区旁新增「🔁 重新生成」按钮，使用相同参数再次调用。
- **P 批量生成**：POST `/api/generate-batch`，请求体 `{ items: [...] }`；也可在页面粘贴 CSV 批量生成。

### 批量 CSV 字段
`name,node,color,size_or_volume,capacity,weight,material,brand,locale,model`

> 简易 CSV 解析不处理复杂引号嵌套；如果你需要更强的 CSV 兼容性，建议引入 Papaparse 并在前端替换解析函数。


### 多语言翻译（T）
- 接口：`POST /api/translate`，入参 `{ target_locale, title, bullets }`
- 目标：US_en / UK_en / DE_de / JP_ja / CN_zh
- 输出：`{ title, bullets[5] }`，保持结构与合规写作规范（单位、风格本地化）
