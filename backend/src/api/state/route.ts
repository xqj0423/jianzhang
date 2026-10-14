import {bookAccess} from '../../book-access';
import {json,readLedger,writeLedger,validLedger,sameOrigin} from '../../ledger-store';
export const dynamic='force-dynamic';
export async function GET(req:Request){const uid=await bookAccess(req);if(!uid)return json({error:'请先登录'},401);try{return json(await readLedger(uid));}catch{return json({error:'读取在线账本失败，请稍后重试'},503);}}
export async function PUT(req:Request){const uid=await bookAccess(req);if(!uid)return json({error:'请先登录'},401);if(!sameOrigin(req))return json({error:'请求来源无效'},403);try{const text=await req.text();if(text.length>8000000)return json({error:'账本过大，请先导出归档'},413);const v=JSON.parse(text);if(!validLedger(v.db)||!Number.isSafeInteger(v.revision)||v.revision<0)return json({error:'账本格式无效'},400);if(!await writeLedger(uid,v.db,v.revision))return json({error:'账本已在另一设备更新，本次修改未保存。请刷新后重试。'},409);return json({saved:true,revision:v.revision+1});}catch{return json({error:'在线保存失败，请重试'},503);}}
