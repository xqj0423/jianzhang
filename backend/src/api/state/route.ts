import {bookAccess} from '../../book-access';
import {json,readLedger,writeLedger,validLedger,sameOrigin} from '../../ledger-store';
export const dynamic='force-dynamic';
export async function GET(req:Request){if(!await bookAccess(req))return json({error:'请先输入账本密码'},401);try{return json(await readLedger());}catch{return json({error:'读取在线账本失败，请稍后重试'},503);}}
export async function PUT(req:Request){if(!await bookAccess(req))return json({error:'请先输入账本密码'},401);if(!sameOrigin(req))return json({error:'请求来源无效'},403);try{const text=await req.text();if(text.length>8000000)return json({error:'账本过大，请先导出归档'},413);const v=JSON.parse(text);if(!validLedger(v.db)||!Number.isSafeInteger(v.revision)||v.revision<0)return json({error:'账本格式无效'},400);if(!await writeLedger(v.db,v.revision))return json({error:'账本已在另一设备更新，本次修改未保存。请刷新后重试。'},409);return json({saved:true,revision:v.revision+1});}catch{return json({error:'在线保存失败，请重试'},503);}}
