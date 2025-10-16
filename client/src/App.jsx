import React, { useState, useEffect } from 'react';
import { generate, history, translate } from './api';

const initial = {
  locale: 'US_en',
  model: 'deepseek-chat',
  name: '', node: '', color: '', size_or_volume: '', capacity: '', weight: '',
  material: '', brand: ''
};

export default function App(){
  const [form, setForm] = useState(initial);
  const [out, setOut] = useState({ title: '', bullets: [] });
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState([]);
  const [err, setErr] = useState('');
  const [presets, setPresets] = useState([]);
  const [target, setTarget] = useState('DE_de');
  const [tOut, setTOut] = useState({ title:'', bullets: [] });
  const [batchCSV, setBatchCSV] = useState('name,node,color,size_or_volume,capacity,weight,material,brand,locale,model\n');

  const onChange = (k) => (e) => setForm(v => ({ ...v, [k]: e.target.value }));

  async function fetchPresets(){
    try{
      const res = await fetch('/api/presets');
      if(res.ok) setPresets(await res.json());
    }catch{}
  }

  async function onGenerate(){
    setErr('');
    const required = ['name'];
    for(const k of required){ if(!form[k]){ setErr('请填写：'+k); return; } }
    setLoading(true);
    try{
      const res = await generate(form);
      setOut(res);
      setHist(await history(10));
    }catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  }

  async function onRegenerate(){
    await onGenerate();
  }

  function applyPreset(key){
    const p = presets.find(x => x.key === key);
    if(!p) return;
    const s = p.sample;
    setForm(v => ({
      ...v,
      name: s.name || v.name,
      node: s.node || v.node,
      color: s.color || v.color,
      size_or_volume: s.size_or_volume || v.size_or_volume,
      capacity: s.capacity || v.capacity,
      weight: s.weight || v.weight,
      material: s.material || v.material,
      brand: s.brand || v.brand
    }));
  }

  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(Boolean);
    if(lines.length < 2) return [];
    const header = lines[0].split(',').map(s => s.trim());
    return lines.slice(1).map(line => {
      const parts = line.split(',').map(s => s.trim());
      const obj = {};
      header.forEach((h,i) => obj[h] = parts[i] || '');
      if(!obj.locale) obj.locale = form.locale;
      if(!obj.model) obj.model = form.model;
      return obj;
    });
  }

  async function onBatchGenerate(){
    setErr('');
    const items = parseCSV(batchCSV);
    if(items.length === 0){ setErr('CSV 没有数据'); return; }
    setLoading(true);
    try{
      const res = await fetch('/api/generate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(JSON.stringify(data));
      const lastOk = [...data.results].reverse().find(x => x.ok);
      if(lastOk) setOut(lastOk.output);
      setHist(await history(10));
      alert(`批量完成：${data.count} 条，其中成功 ${data.results.filter(x=>x.ok).length} 条`);
    }catch(e){ setErr(e.message); }
    finally{ setLoading(false); }
  }

  async function onTranslate(){
    setErr('');
    if(!out.title || !(out.bullets||[]).length){ setErr('请先生成内容'); return; }
    try{
      const res = await translate(target, out.title, out.bullets||[]);
      setTOut(res);
    }catch(e){ setErr(e.message); }
  }

  useEffect(() => { history(10).then(setHist).catch(()=>{}); fetchPresets(); }, []);

  return (
    <div style={{ fontFamily:'system-ui', padding:20, maxWidth:1100, margin:'0 auto' }}>
      <h2>🛒 DeepSeek · 亚马逊标题 & 五点生成（全栈·交互增强 ABPT）</h2>
      <p style={{ color:'#6b7280' }}>A: 类目模板 · B: 重新生成 · P: 批量 CSV · T: 多语言翻译</p>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <Card>
          <h3>输入</h3>
          <Row>
            <Select label="站点语言" value={form.locale} onChange={onChange('locale')} options={{
              US_en:'US / English', DE_de:'DE / Deutsch', JP_ja:'JP / 日本語', UK_en:'UK / English', CN_zh:'CN / 中文'
            }} />
            <Select label="模型" value={form.model} onChange={onChange('model')} options={{
              'deepseek-chat':'deepseek-chat','deepseek-reasoner':'deepseek-reasoner'
            }} />
          </Row>

          <Row>
            <Select label="类目模板" value={''} onChange={(e)=>applyPreset(e.target.value)} options={Object.fromEntries([['','选择模板'], ...presets.map(p=>[p.key,p.name])])} />
            <div />
          </Row>

          <Row>
            <Input label="产品名称" value={form.name} onChange={onChange('name')} placeholder="Stainless Steel Water Bottle" />
            <Input label="产品节点/类目" value={form.node} onChange={onChange('node')} placeholder="Kitchen & Dining > Drinkware" />
          </Row>
          <Row>
            <Input label="颜色" value={form.color} onChange={onChange('color')} placeholder="Dark Blue" />
            <Input label="尺寸/体积" value={form.size_or_volume} onChange={onChange('size_or_volume')} placeholder="26cm / 5L / 40×30×25cm" />
          </Row>
          <Row>
            <Input label="容量" value={form.capacity} onChange={onChange('capacity')} placeholder="5L / 64oz / 2-Tier / 12-Pack" />
            <Input label="质量/重量" value={form.weight} onChange={onChange('weight')} placeholder="1.2kg / 2.6lb / 承重30kg" />
          </Row>
          <Row>
            <Input label="材质（可选）" value={form.material} onChange={onChange('material')} placeholder="不锈钢 / ABS / 铸铁搪瓷" />
            <Input label="品牌（可选）" value={form.brand} onChange={onChange('brand')} placeholder="Brand name" />
          </Row>

          <div style={{ display:'flex', gap:8 }}>
            <button disabled={loading} onClick={onGenerate} style={btn}>{loading?'生成中…':'⚡ 生成'}</button>
            <button disabled={loading} onClick={onRegenerate} style={btnAlt}>🔁 重新生成</button>
          </div>
          {err && <p style={{ color:'#b91c1c', marginTop:8 }}>{err}</p>}
        </Card>

        <Card>
          <h3>结果</h3>
          <label>标题</label>
          <textarea rows={3} style={ta} value={out.title} onChange={e=>setOut(o=>({...o, title:e.target.value}))} />
          <label style={{marginTop:8}}>五点（每行一条）</label>
          <textarea rows={10} style={ta} value={(out.bullets||[]).join('\n')} onChange={e=>setOut(o=>({...o, bullets:e.target.value.split('\n')}))} />
          <div style={{ display:'flex', gap:8, marginTop:8 }}>
            <button style={btnAlt} onClick={()=>navigator.clipboard.writeText(`TITLE:\\n${out.title}\\n\\nBULLETS:\\n${(out.bullets||[]).join('\\n')}`)}>📋 复制</button>
            <button style={btnAlt} onClick={()=>{
              const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
              const url = URL.createObjectURL(blob); const a=document.createElement('a');
              a.href=url; a.download='amazon_copy.json'; a.click(); URL.revokeObjectURL(url);
            }}>⬇️ 下载 JSON</button>
          </div>
        </Card>
      </div>

      <Card>
        <h3>多语言翻译</h3>
        <Row>
          <Select label="目标语言/站点" value={target} onChange={(e)=>setTarget(e.target.value)} options={{
            DE_de:'DE / Deutsch', JP_ja:'JP / 日本語', US_en:'US / English', UK_en:'UK / English', CN_zh:'CN / 中文'
          }} />
          <div style={{ display:'flex', alignItems:'end' }}>
            <button style={btn} onClick={onTranslate}>🌐 翻译当前结果</button>
          </div>
        </Row>
        <label>标题（翻译后）</label>
        <textarea rows={3} style={ta} value={tOut.title} onChange={e=>setTOut(o=>({...o, title:e.target.value}))} />
        <label style={{marginTop:8}}>五点（翻译后，每行一条）</label>
        <textarea rows={10} style={ta} value={(tOut.bullets||[]).join('\n')} onChange={e=>setTOut(o=>({...o, bullets:e.target.value.split('\n')}))} />
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button style={btnAlt} onClick={()=>navigator.clipboard.writeText(`TITLE:\\n${tOut.title}\\n\\nBULLETS:\\n${(tOut.bullets||[]).join('\\n')}`)}>📋 复制翻译</button>
          <button style={btnAlt} onClick={()=>{
            const blob = new Blob([JSON.stringify(tOut,null,2)], {type:'application/json'});
            const url = URL.createObjectURL(blob); const a=document.createElement('a');
            a.href=url; a.download='amazon_copy_translated.json'; a.click(); URL.revokeObjectURL(url);
          }}>⬇️ 下载翻译 JSON</button>
        </div>
      </Card>

      <Card>
        <h3>批量 CSV 生成（P）</h3>
        <p style={{ color:'#6b7280' }}>CSV 头（必须）: <code>name,node,color,size_or_volume,capacity,weight,material,brand,locale,model</code></p>
        <textarea rows={6} style={ta} value={batchCSV} onChange={e=>setBatchCSV(e.target.value)} />
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button disabled={loading} onClick={onBatchGenerate} style={btn}>⚡ 开始批量</button>
          <button style={btnAlt} onClick={()=>setBatchCSV('name,node,color,size_or_volume,capacity,weight,material,brand,locale,model\\n')}>🧹 清空</button>
        </div>
      </Card>

      <Card>
        <h3>最近生成</h3>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <Th>时间</Th><Th>站点</Th><Th>模型</Th><Th>名称</Th><Th>节点</Th><Th>标题</Th>
            </tr>
          </thead>
          <tbody>
            {hist.map(r=> (
              <tr key={r.id}>
                <Td>{new Date(r.created_at).toLocaleString()}</Td>
                <Td>{r.locale}</Td>
                <Td>{r.model}</Td>
                <Td>{r.name}</Td>
                <Td>{r.node}</Td>
                <Td style={{maxWidth:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={r.title}>{r.title}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Card({children}) {
  return <div style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:16, marginBottom:12 }}>{children}</div>;
}
function Row({children}) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>{children}</div>;
}
function Input({label, ...rest}) {
  return (<div><label style={{ fontSize:12, color:'#6b7280' }}>{label}</label><input {...rest} style={inp}/></div>);
}
function Select({label, value, onChange, options}) {
  return (<div><label style={{ fontSize:12, color:'#6b7280' }}>{label}</label><select value={value} onChange={onChange} style={inp}>{Object.entries(options).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>);
}

const inp = { width:'100%', padding:'10px', border:'1px solid #e5e7eb', borderRadius:10 };
const ta = { ...inp, width:'100%' };
const btn = { padding:'10px 14px', borderRadius:10, border:'1px solid #111827', background:'#111827', color:'#fff', cursor:'pointer' };
const btnAlt = { padding:'10px 14px', borderRadius:10, border:'1px solid #111827', background:'#fff', color:'#111827', cursor:'pointer' };

function Th({children}) {
  return (
    <th style={{
      textAlign:'left',
      padding:'8px 6px',
      borderBottom:'1px solid #e5e7eb',
      fontWeight:600,
      fontSize:12,
      color:'#6b7280'
    }}>{children}</th>
  );
}

function Td({children, ...rest}) {
  return (
    <td {...rest} style={{
      padding:'8px 6px',
      borderBottom:'1px solid #f3f4f6',
      fontSize:13,
      color:'#111827',
      verticalAlign:'top'
    }}>{children}</td>
  );
}
