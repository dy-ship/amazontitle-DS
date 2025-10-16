import fetch from 'node-fetch';
import { z } from 'zod';
import { insertGeneration, listGenerations } from '../db.js';

const InputSchema = z.object({
  locale: z.enum(['US_en','UK_en','DE_de','JP_ja','CN_zh']),
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

function systemPrompt(locale){
  return `You are an Amazon listing copywriter. Return JSON only: {"title": string, "bullets": string[5]}.
STYLE & RULES:
- Localize to ${locale}. US/UK title in Title Case; DE/JP concise & natural; CN_zh 简洁。
- Title: include brand(if any), head keyword from product name, node cue, color, size/volume/capacity/weight as applicable, + 2–3 concise benefits; avoid stuffing; ~150–200 chars for US/UK; shorter for DE/JP/CN.
- Bullets: exactly 5; ≤250 chars each; start with hook word then detail; cover material/durability, dimension/capacity, ease-of-use/clean/install, scenario/compatibility, in-box/support.
- No medical/health claims, no superlatives or unverifiable certifications; avoid competitor names & prices.
- Use imperial for US/UK (add metric if helpful); metric for DE/JP/CN.
Return pure JSON only.`;
}

export function routes(app){
  // Generate endpoint
  app.post('/api/generate', async (req, res) => {
    try{
      const parsed = InputSchema.parse(req.body);
      const messages = [
        { role: 'system', content: systemPrompt(parsed.locale) },
        { role: 'user', content: JSON.stringify({
          name: parsed.name,
          node: parsed.node,
          color: parsed.color,
          size_or_volume: parsed.size_or_volume,
          capacity: parsed.capacity,
          weight: parsed.weight,
          material: parsed.material || null,
          brand: parsed.brand || null
        }) }
      ];

      const apiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
      const r = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: parsed.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.4
        })
      });

      const text = await r.text();
      if(!r.ok){
        return res.status(r.status).json({ error: 'UpstreamError', detail: text });
      }
      let data = {};
      try{ data = JSON.parse(text); }catch(e){ return res.status(500).json({ error: 'BadJSON', detail: text.slice(0,400) }); }
      const content = data?.choices?.[0]?.message?.content || '{}';

      let out;
      try{ out = JSON.parse(content); }catch(e){ return res.status(500).json({ error: 'ModelNonJSON', detail: content.slice(0,400) }); }

      insertGeneration({
        created_at: new Date().toISOString(),
        ip: req.headers['x-forwarded-for']?.toString().split(',')[0] || req.socket.remoteAddress || null,
        locale: parsed.locale,
        model: parsed.model,
        name: parsed.name,
        node: parsed.node,
        color: parsed.color,
        size_volume: parsed.size_or_volume,
        capacity: parsed.capacity,
        weight: parsed.weight,
        material: parsed.material || null,
        brand: parsed.brand || null,
        title: out.title || '',
        bullets_json: JSON.stringify(out.bullets || [])
      });

      res.json(out);
    }catch(err){
      if(err?.issues){
        return res.status(400).json({ error: 'BadRequest', issues: err.issues });
      }
      res.status(500).json({ error: 'ServerError', detail: err.message });
    }
  });

  // History endpoint
  app.get('/api/history', (req, res) => {
    const limit = Number(req.query.limit || 20);
    const rows = listGenerations({ limit });
    res.json(rows.map(r => ({
      id: r.id,
      created_at: r.created_at,
      locale: r.locale,
      model: r.model,
      name: r.name,
      node: r.node,
      color: r.color,
      size_or_volume: r.size_volume,
      capacity: r.capacity,
      weight: r.weight,
      material: r.material,
      brand: r.brand,
      title: r.title,
      bullets: JSON.parse(r.bullets_json || '[]')
    })));
  });

// 预置类目模板（也可改为读取数据库/文件）
app.get('/api/presets', (req, res) => {
  const presets = [
    { key:'kitchen', name:'厨具 / Kitchen', sample: {
      name:'Enameled Cast Iron Dutch Oven',
      node:'Kitchen & Dining > Cookware > Dutch Ovens',
      color:'Dark Blue',
      size_or_volume:'26cm',
      capacity:'5L',
      weight:'4.5kg',
      material:'Enameled Cast Iron',
      brand:''
    }},
    { key:'fitness', name:'健身 / Fitness', sample: {
      name:'Adjustable Dumbbell Set',
      node:'Sports & Outdoors > Strength Training',
      color:'Black',
      size_or_volume:'—',
      capacity:'25lb x 2',
      weight:'50lb',
      material:'Steel + TPU',
      brand:''
    }},
    { key:'tools', name:'工具 / Tools', sample: {
      name:'Cordless Impact Driver 20V',
      node:'Tools & Home Improvement > Power Tools',
      color:'Blue',
      size_or_volume:'—',
      capacity:'2.0Ah Battery',
      weight:'1.2kg',
      material:'ABS + Aluminum',
      brand:''
    }},
    { key:'electronics', name:'电子配件 / Electronics', sample: {
      name:'USB-C GaN Charger 65W',
      node:'Electronics > Accessories & Supplies > Chargers',
      color:'White',
      size_or_volume:'—',
      capacity:'65W',
      weight:'120g',
      material:'ABS + GaN',
      brand:''
    }},
    { key:'welding', name:'电焊类 / Welding', sample: {
      name:'MMA Inverter Welder 130A',
      node:'Tools & Home Improvement > Welding Equipment',
      color:'Orange',
      size_or_volume:'—',
      capacity:'110/220V',
      weight:'3.2kg',
      material:'Steel + ABS',
      brand:''
    }}
  ];
  res.json(presets);
});

// 批量生成（CSV->数组）
app.post('/api/generate-batch', async (req, res) => {
  try{
    const arr = Array.isArray(req.body) ? req.body : req.body?.items;
    if(!Array.isArray(arr) || arr.length===0) return res.status(400).json({ error:'BadRequest', detail:'items must be a non-empty array' });
    const results = [];
    for(const item of arr){
      try{
        // 逐条验证与调用（重用单条schema）
        const parsed = InputSchema.parse(item);
        // 重用与单条相同的调用逻辑
        const messages = [
          { role: 'system', content: systemPrompt(parsed.locale) },
          { role: 'user', content: JSON.stringify({
            name: parsed.name, node: parsed.node, color: parsed.color,
            size_or_volume: parsed.size_or_volume, capacity: parsed.capacity, weight: parsed.weight,
            material: parsed.material || null, brand: parsed.brand || null
          }) }
        ];
        const apiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
        const r = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: parsed.model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.4
          })
        });
        const text = await r.text();
        if(!r.ok) throw new Error(text);
        let data = {}; try{ data = JSON.parse(text) }catch(e){ throw new Error('BadJSON:'+text.slice(0,200)) }
        const content = data?.choices?.[0]?.message?.content || '{}';
        let out; try{ out = JSON.parse(content) }catch(e){ throw new Error('ModelNonJSON:'+content.slice(0,200)) }
        // 入库
        insertGeneration({
          created_at: new Date().toISOString(),
          ip: null, locale: parsed.locale, model: parsed.model,
          name: parsed.name, node: parsed.node, color: parsed.color,
          size_volume: parsed.size_or_volume, capacity: parsed.capacity, weight: parsed.weight,
          material: parsed.material || null, brand: parsed.brand || null,
          title: out.title || '', bullets_json: JSON.stringify(out.bullets || [])
        });
        results.push({ ok:true, input: parsed, output: out });
      }catch(e){
        results.push({ ok:false, error: String(e), input: item });
      }
    }
    res.json({ count: results.length, results });
  }catch(e){
    res.status(500).json({ error:'ServerError', detail: e.message });
  }
});


  // 多语言翻译接口：输入现有 title/bullets 与目标站点语言，返回同结构 JSON
  app.post('/api/translate', async (req, res) => {
    try{
      const body = req.body || {};
      const target = body.target_locale;
      const title = body.title || '';
      const bullets = Array.isArray(body.bullets) ? body.bullets : [];

      const allowed = ['US_en','UK_en','DE_de','JP_ja','CN_zh'];
      if(!allowed.includes(target)) return res.status(400).json({ error:'BadRequest', detail:'invalid target_locale' });
      if(!title || bullets.length !== 5) return res.status(400).json({ error:'BadRequest', detail:'need title and 5 bullets' });

      const sys = `You are a professional Amazon listing localizer. Translate and adapt for marketplace style.
OUTPUT: pure JSON { "title": string, "bullets": string[5] }.
RULES:
- Target locale: ${target}. For English titles use Title Case; DE/JP/CN concise and natural.
- Preserve structure, facts, units; adapt units (US/UK: imperial with metric in parentheses; DE/JP/CN: metric).
- Keep claims compliant (no superlatives/medical/unverifiable certifications). Avoid competitor names and pricing.
- Keep bullet hooks intact if possible (e.g., "Space-Saving:" / "Robust Material:").`;

      const messages = [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify({ title, bullets, target }) }
      ];

      const apiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';
      const r = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.2
        })
      });
      const txt = await r.text();
      if(!r.ok) return res.status(r.status).json({ error:'UpstreamError', detail: txt });
      let data = {}; try{ data = JSON.parse(txt) }catch(e){ return res.status(500).json({ error:'BadJSON', detail: txt.slice(0,200) }); }
      const content = data?.choices?.[0]?.message?.content || '{}';
      let out; try{ out = JSON.parse(content) }catch(e){ return res.status(500).json({ error:'ModelNonJSON', detail: content.slice(0,200) }); }
      res.json(out);
    }catch(e){
      res.status(500).json({ error:'ServerError', detail: e.message });
    }
  });
