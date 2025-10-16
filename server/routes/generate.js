// server/routes/generate.js
import fetch from 'node-fetch';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { insertGeneration, listHistory } from './db.js';

// ---- 输入校验：仅 “name” 必填，其余可选 ----
const InputSchema = z.object({
  locale: z.enum(['US_en','UK_en','DE_de','JP_ja','CN_zh']).default('US_en'),
  model: z.enum(['deepseek-chat','deepseek-reasoner']).default('deepseek-chat'),
  name: z.string().min(1),
  node: z.string().optional().nullable().default(''),
  color: z.string().optional().nullable().default(''),
  size_or_volume: z.string().optional().nullable().default(''),
  capacity: z.string().optional().nullable().default(''),
  weight: z.string().optional().nullable().default(''),
  material: z.string().optional().nullable(),
  brand: z.string().optional().nullable()
});

// ---- 系统提示 ----
function systemPrompt(locale = 'US_en'){
  return `
You are an expert Amazon listing copywriter. Output strictly JSON: { "title": string, "bullets": string[5] }.
Rules:
- Locale: ${locale}. Use local writing style and units (US/UK: imperial with metric in parentheses; DE/JP/CN: metric).
- Some fields may be missing; DO NOT fabricate. If a field is empty/unknown, avoid mentioning it.
- Concise, factual, compliant (no medical/absolute-superlative/price/competitor claims).
- Title length and bullets follow marketplace best practices.
Return pure JSON only.
`.trim();
}

// ---- 生成消息 ----
function makeMessages(parsed){
  const payload = {
    name: parsed.name,
    node: parsed.node || null,
    color: parsed.color || null,
    size_or_volume: parsed.size_or_volume || null,
    capacity: parsed.capacity || null,
    weight: parsed.weight || null,
    material: parsed.material || null,
    brand: parsed.brand || null
  };
  return [
    { role: 'system', content: systemPrompt(parsed.locale) },
    { role: 'user', content: JSON.stringify(payload) }
  ];
}

// ---- DeepSeek Chat 调用 ----
async function callDeepseek({ model, messages }) {
  const apiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
  const r = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4
    })
  });
  const txt = await r.text();
  if(!r.ok) throw new Error(txt);
  let data = {};
  try { data = JSON.parse(txt); } catch { throw new Error('BadJSON:'+txt.slice(0,200)); }
  const content = data?.choices?.[0]?.message?.content || '{}';
  let out = {};
  try { out = JSON.parse(content); } catch { throw new Error('ModelNonJSON:'+content.slice(0,200)); }
  return out;
}

// ---- 路由导出 ----
export function routes(app){

  // 速率限制示例（按需）
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60 }));

  // 健康检查（可选）
  app.get('/api/health', (_req, res) => res.json({ ok:true, time:new Date().toISOString() }));

  // 预置类目模板（A）
  app.get('/api/presets', (_req, res) => {
    const presets = [
      { key:'kitchen', name:'厨具 / Kitchen', sample: {
        name:'Enameled Cast Iron Dutch Oven',
        node:'Kitchen & Dining > Cookware > Dutch Ovens',
        color:'Dark Blue', size_or_volume:'26cm', capacity:'5L', weight:'4.5kg', material:'Enameled Cast Iron', brand:''
      }},
      { key:'fitness', name:'健身 / Fitness', sample: {
        name:'Adjustable Dumbbell Set',
        node:'Sports & Outdoors > Strength Training',
        color:'Black', size_or_volume:'', capacity:'2x25lb', weight:'50lb', material:'Steel + TPU', brand:''
      }},
      { key:'electronics', name:'电子 / Electronics', sample: {
        name:'USB-C GaN Charger 65W',
        node:'Electronics > Accessories & Supplies > Chargers',
        color:'White', size_or_volume:'', capacity:'65W', weight:'120g', material:'ABS + GaN', brand:''
      }}
    ];
    res.json(presets);
  });

  // 单条生成
  app.post('/api/generate', async (req, res) => {
    try{
      const parsed = InputSchema.parse(req.body || {});
      const out = await callDeepseek({ model: parsed.model, messages: makeMessages(parsed) });

      // 入库（允许空字段）
      insertGeneration({
        created_at: new Date().toISOString(),
        ip: req.ip || null,
        locale: parsed.locale,
        model: parsed.model,
        name: parsed.name,
        node: parsed.node || '',
        color: parsed.color || '',
        size_volume: parsed.size_or_volume || '',
        capacity: parsed.capacity || '',
        weight: parsed.weight || '',
        material: parsed.material || '',
        brand: parsed.brand || '',
        title: out.title || '',
        bullets_json: JSON.stringify(out.bullets || [])
      });

      res.json({ title: out.title || '', bullets: Array.isArray(out.bullets) ? out.bullets : [] });
    }catch(e){
      res.status(400).json({ error:'BadRequest', detail: String(e) });
    }
  });

  // 历史
  app.get('/api/history', (req, res) => {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const rows = listHistory(limit);
    res.json(rows);
  });

  // 批量生成（P）
  app.post('/api/generate-batch', async (req, res) => {
    try{
      const arr = Array.isArray(req.body) ? req.body : req.body?.items;
      if(!Array.isArray(arr) || arr.length===0) return res.status(400).json({ error:'BadRequest', detail:'items must be a non-empty array' });
      const results = [];
      for(const item of arr){
        try{
          const parsed = InputSchema.parse(item);
          const out = await callDeepseek({ model: parsed.model, messages: makeMessages(parsed) });
          insertGeneration({
            created_at: new Date().toISOString(),
            ip: null,
            locale: parsed.locale,
            model: parsed.model,
            name: parsed.name,
            node: parsed.node || '',
            color: parsed.color || '',
            size_volume: parsed.size_or_volume || '',
            capacity: parsed.capacity || '',
            weight: parsed.weight || '',
            material: parsed.material || '',
            brand: parsed.brand || '',
            title: out.title || '',
            bullets_json: JSON.stringify(out.bullets || [])
          });
          results.push({ ok:true, input: parsed, output: out });
        }catch(err){
          results.push({ ok:false, error: String(err), input: item });
        }
      }
      res.json({ count: results.length, results });
    }catch(e){
      res.status(500).json({ error:'ServerError', detail: String(e) });
    }
  });

  // 多语言翻译（T）
  app.post('/api/translate', async (req, res) => {
    try{
      const body = req.body || {};
      const target = body.target_locale;
      const title = body.title || '';
      const bullets = Array.isArray(body.bullets) ? body.bullets : [];
      const allowed = ['US_en','UK_en','DE_de','JP_ja','CN_zh'];
      if(!allowed.includes(target)) return res.status(400).json({ error:'BadRequest', detail:'invalid target_locale' });
      if(!title || bullets.length !== 5) return res.status(400).json({ error:'BadRequest', detail:'need title and 5 bullets' });

      const messages = [
        { role:'system', content: `
You are a professional Amazon listing localizer. Output JSON: { "title": string, "bullets": string[5] }.
- Target: ${target}
- Preserve facts, structure; adapt units (US/UK: imperial with metric in parentheses; DE/JP/CN: metric).
- Keep compliant; no superlatives/medical/price/competitor claims.
Return JSON only.`.trim() },
        { role:'user', content: JSON.stringify({ target, title, bullets }) }
      ];

      const out = await callDeepseek({ model: 'deepseek-chat', messages });
      res.json({ title: out.title || '', bullets: Array.isArray(out.bullets) ? out.bullets : [] });
    }catch(e){
      res.status(500).json({ error:'ServerError', detail: String(e) });
    }
  });

} // <-- ✅ 确保文件以这个大括号结尾
