import {json,readLedger,writeLedger,validRow,classify} from '../../ledger-store';
import {shortcutAccess} from '../../book-access';
import {recognize} from '../../recognize';
export const dynamic='force-dynamic';
// Public page; the shortcut write token authorizes only this append-only route.
export async function POST(req:Request){if(!shortcutAccess(req))return json({saved:false,error:'快捷指令连接密钥无效'},401);try{
  if(!req.headers.get('content-type')?.includes('application/json'))return json({saved:false,error:'请发送 JSON'},415);
  const text=await req.text();if(text.length>12000)return json({saved:false,error:'请求过大'},413);
  const v=JSON.parse(text);const amt=String(v.amount??'').trim().replace(/[,，¥￥元\s]/g,'');
  if(!/^\d+(\.\d{1,2})?$/.test(amt)||!['收入','支出'].includes(v.type)||!['微信','支付宝','银行卡','手动'].includes(v.source))return json({saved:false,error:'金额、收支或来源无效'},400);
  // Older shortcuts send complete OCR text as note, and sometimes as the merchant.
  // Re-parse that receipt and reject contradictory manual values before any write.
  const receipt=(s:unknown):s is string=>typeof s==='string'&&/交易成功|支付成功|付款成功|收款成功|退款成功/.test(s)&&/账单详情|订单金额|付款方式|支付时间|余额宝|超优汇率/.test(s);
  const raw=receipt(v.party)?v.party:receipt(v.note)?v.note:'';
  if(raw){const fields=recognize(raw);
    if(!fields.amount||!fields.type)return json({saved:false,error:'截图金额或收支不明确，未记账；请使用网站提供的新版快捷指令'},400);
    if(Number(amt)!==Number(fields.amount)||v.type!==fields.type||(fields.source&&v.source!==fields.source))return json({saved:false,error:'填写内容与截图的实际金额、收支或来源不符，未记账'},400);
    if(receipt(v.party))v.party=fields.party;
    v.note=fields.note;if(fields.date)v.date=fields.date;
  }
  if(typeof v.party==='string'&&v.party.length>150)return json({saved:false,error:'商户名称过长，不能把整张截图文字作为商户'},400);
  const parts=amt.split('.'),cents=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
  if(typeof v.request_id!=='string'||!/^[-a-zA-Z0-9_]{8,100}$/.test(v.request_id))return json({saved:false,error:'需要稳定的 request_id 防止重试重复'},400);
  const dt=typeof v.date==='string'?v.date:new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
  const row={id:'shortcut-'+v.request_id,date:dt,type:v.type,cents,party:typeof v.party==='string'?v.party:'',note:typeof v.note==='string'?v.note:'',source:v.source,tx:typeof v.tx==='string'?v.tx:'',category:classify((v.party||'')+' '+(v.note||''),v.type)};
  if(!validRow(row))return json({saved:false,error:'记录格式无效'},400);
  for(let i=0;i<5;i++){const current=await readLedger(),old=current.db.rows.find(r=>r.id===row.id);if(old){if(old.cents!==row.cents||old.type!==row.type||old.source!==row.source)return json({saved:false,error:'请求编号已用于另一笔记录'},409);return json({saved:true,save_status:'saved',duplicate:true,id:old.id});}if(current.db.rows.length>=30000)return json({saved:false,error:'账本已满，请先归档'},413);current.db.rows.push(row);if(await writeLedger(current.db,current.revision))return json({saved:true,save_status:'saved',duplicate:false,id:row.id},201);}
  return json({saved:false,error:'账本正忙，请使用相同 request_id 重试'},409);
}catch{return json({saved:false,error:'在线记账失败，请保留截图并重试'},503);}}
