import {sameOrigin,json} from '../../ledger-store';
import {clearCookie} from '../../book-access';
export async function POST(req:Request){if(!sameOrigin(req))return json({error:'请求来源无效'},403);return Response.json({locked:true},{headers:{'Set-Cookie':clearCookie(req),'Cache-Control':'no-store'}});}
