// Sends the login code through Resend (https://resend.com). Needs RESEND_API_KEY and MAIL_FROM.
export async function sendLoginCode(to:string,code:string){
const key=process.env.RESEND_API_KEY,from=process.env.MAIL_FROM;
if(!key||!from)throw Error('mail is not configured');
const r=await fetch('https://api.resend.com/emails',{method:'POST',
headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
body:JSON.stringify({from,to:[to],subject:'简账登录验证码：'+code,text:'你的简账登录验证码是 '+code+'，10 分钟内有效。\n如果不是你本人操作，请忽略这封邮件。'}),
signal:AbortSignal.timeout(10000)});
if(!r.ok)throw Error('mail failed '+r.status);
}
