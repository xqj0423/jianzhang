import {bookAccess} from '../../../book-access';
import {json} from '../../../ledger-store';
import {listUserProfiles} from '../../../database';
export async function GET(req:Request){
const uid=await bookAccess(req);
if(!uid)return json({error:'请先登录'},401);
if(uid!=='owner')return json({error:'无权查看用户列表'},403);
const params=new URL(req.url).searchParams,after=params.get('after')||'',raw=params.get('limit')||'30';
if((after&&!/^(owner|[a-f0-9]{24})$/.test(after))||!/^\d+$/.test(raw))return json({error:'分页参数无效'},400);
const limit=Number(raw);if(limit<1||limit>50)return json({error:'分页参数无效'},400);
try{return json(await listUserProfiles(after,limit));}catch{return json({error:'读取用户列表失败，请稍后重试'},503);}
}
