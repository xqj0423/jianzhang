import {bookAccess} from '../../book-access';
import {json} from '../../ledger-store';
export async function GET(req:Request){
const uid=await bookAccess(req);
return uid?json({isOwner:uid==='owner'}):json({error:'请先登录'},401);
}
