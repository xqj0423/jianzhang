import {shortcutAccess} from '../../book-access';
import {json} from '../../ledger-store';
import {recognize} from '../../recognize';
import {POST as record} from '../record/route';
export async function POST(req:Request){
 if(!shortcutAccess(req))return json({saved:false,error:'连接配置失效，请在网站设置重新复制连接配置'},401);
 try{
  const text=await req.text();if(text.length>18000)return json({saved:false,error:'截图文字过长，截图已保留'});
  const v=JSON.parse(text);if(typeof v.text!=='string'||v.text.length>10000||!v.text.trim())return json({saved:false,error:'没有提取到截图文字，请选择清晰的支付详情截图'});
  const fields=recognize(v.text);
  if(fields.needs_input.length){const labels:Record<string,string>={amount:'实际金额',type:'收入或支出',source:'微信或支付宝来源'};return json({saved:false,error:'无法确定'+fields.needs_input.map(k=>labels[k]).join('、')+'，未记账。请截完整的交易详情页（含金额、状态和支付方式）',needs_input:fields.needs_input});}
  const response=await record(new Request(new URL('/api/record',req.url),{method:'POST',headers:req.headers,body:JSON.stringify({request_id:v.request_id,amount:fields.amount,type:fields.type,source:fields.source,party:fields.party,...(fields.date?{date:fields.date}:{}),note:fields.note})}));
  const saved=await response.json();return json({...saved,amount:fields.amount,type:fields.type,source:fields.source,party:fields.party},response.status>=500?response.status:200);
 }catch{return json({saved:false,error:'截图记账未完成，请保留截图并重试'},503);}
}
