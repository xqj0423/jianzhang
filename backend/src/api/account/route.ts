import {bookAccess,sessionCookie} from '../../book-access';
import {json} from '../../ledger-store';
export async function GET(req:Request){
 const uid=await bookAccess(req);
 if(!uid)return json({error:'请先登录'},401);
 const response=json({isOwner:uid==='owner'});
 // A same-origin resume probe upgrades an existing signed cookie without email.
 if(new URL(req.url).searchParams.get('resume')==='1')response.headers.set('Set-Cookie',await sessionCookie(req,uid));
 return response;
}
