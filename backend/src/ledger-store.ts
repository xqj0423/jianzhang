import {readSnapshot,writeSnapshot} from './database';
export type Row = { id:string;date:string;type:string;cents:number;party:string;note:string;category:string;source:string;tx:string };
export type Ledger = {version:number;initial:number;rows:Row[]};
export function normalizeLedgerCategories(db:Ledger):Ledger{return {...db,rows:db.rows.map(r=>({...r,category:r.category==='娱乐'?'游戏':r.category==='居住'?'其他':r.category}))};}
const empty:Ledger={version:1,initial:0,rows:[]};
export function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export function validRow(r:any):r is Row {
  if (!r || typeof r.id!=='string' || r.id.length>150 || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.date) || !['收入','支出'].includes(r.type) || !Number.isSafeInteger(r.cents) || r.cents<=0 || r.cents>100000000000) return false;
  const d=new Date(r.date.replace(' ','T')+'Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,19).replace('T',' ')===r.date&&['party','note','category','source','tx'].every(k=>typeof r[k]==='string'&&r[k].length<=2000);
}
export function validLedger(v:any):v is Ledger{return v?.version===1&&Number.isSafeInteger(v.initial)&&Math.abs(v.initial)<=100000000000&&Array.isArray(v.rows)&&v.rows.length<=30000&&v.rows.every(validRow)&&new Set(v.rows.map((r:Row)=>r.id)).size===v.rows.length;}
export async function readLedger(uid:string){const snapshot=await readSnapshot(uid,empty);return {...snapshot,db:normalizeLedgerCategories(snapshot.db)};}
export async function writeLedger(uid:string,db:Ledger,revision:number){return writeSnapshot(uid,normalizeLedgerCategories(db),revision);}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');return !!origin&&origin===new URL(req.url).origin;}
export function classify(t:string,type:string){
 if(/退款|退货/.test(t))return '退款';
 if(type==='收入'&&/工资|薪资|奖金/.test(t))return '工资';
 // Specific items take precedence over a marketplace name such as Meituan.
 for(const [c,re] of [
  ['医疗',/医院|诊所|药店|买药|购药|处方药/],
  ['交通',/公交|地铁|滴滴|打车|加油|车票|顺风车/],
  ['生活缴费',/水费|电费|话费|宽带|燃气/],
  ['游戏',/游戏|手游|网游|点券|Steam|V[CO0]GAMERS|PlayStation|Xbox|任天堂/i],
  ['投资理财',/基金|蚂蚁财富|理财|证券|股票/],
  ['购物',/淘宝|京东|拼多多|超市|便利店/],
  ['餐饮',/餐|饭|咖啡|奶茶|烤鸭|烤鸡|烧烤|小吃|外卖|沙县|汉堡|炸鸡|肯德基|麦当劳|煎饼|麻辣烫|火锅|饺子|馄饨|寿司|面馆|拉面|面条|刀削面|拌面|牛肉面|炒面|花甲粉|螺蛳粉|米粉/]
 ] as [string,RegExp][])if(re.test(t))return c;
 if(/美团|饿了么/.test(t))return '餐饮';
 return '其他';
}
