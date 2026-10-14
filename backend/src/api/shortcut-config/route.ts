import {bookAccess,shortcutToken} from '../../book-access';
import {json,sameOrigin} from '../../ledger-store';
export const dynamic='force-dynamic';
export async function POST(req:Request){
const uid=await bookAccess(req);if(!uid)return json({error:'请先登录'},401);
if(!sameOrigin(req))return json({error:'请求来源无效'},403);
const token=shortcutToken(uid);
return json({url:new URL('/api/record',req.url).href,method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:{request_id:'填写本次生成的UUID',amount:'填写识别金额',type:'支出',source:'微信',party:'填写商户（可留空）',note:'填写账单原文（可留空）'}});
}
