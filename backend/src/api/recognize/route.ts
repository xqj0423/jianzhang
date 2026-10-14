import {shortcutAccess} from '../../book-access';
import {json} from '../../ledger-store';
import {recognize} from '../../recognize';
export async function POST(req:Request){
 if(!shortcutAccess(req))return json({error:'连接配置无效'},401);
 try{const body=await req.text();if(body.length>16000)return json({error:'截图文字过长'},413);const v=JSON.parse(body);if(typeof v.text!=='string'||v.text.length>10000)return json({error:'需要截图识别文字'},400);return json(recognize(v.text));}catch{return json({error:'无法识别截图文字'},400);}
}
