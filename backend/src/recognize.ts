export function recognize(text:string){
 const normalized=text.normalize('NFKC').replace(/\r/g,'').replace(/，/g,',').replace(/[−–﹣]/g,'-').replace(/(\d{4})·(\d{2})F?(\d{2})E?\s+(\d{1,2}:\d{2}(?::\d{2})?)/g,'$1-$2-$3 $4');
 const boundary=normalized.search(/服务详情|推荐服务|开通自动转入|消费红包|账单管理|猜你喜欢|更多服务|相关推荐/);
 const t=(boundary>=0?normalized.slice(0,boundary):normalized).trim();
 const money='[0-9]+(?:,[0-9]{3})*(?:\\.[0-9]{1,2})?(?![0-9.])';
 const clean=(s:string)=>{const v=s.replace(/[,¥￥元\s+-]/g,'');return /^\d+(\.\d{1,2})?$/.test(v)&&Number(v)>0&&Number(v)<=99999999?Number(v).toFixed(2):'';};
 const unique=(v:string[])=>[...new Set(v.map(clean).filter(Boolean))];
 const labeled=(labels:string)=>unique([...t.matchAll(new RegExp('(?:'+labels+')[\\s:：]*[¥￥]?\\s*[+-]?\\s*('+money+')','g'))].map(m=>m[1]));
 const refunded=/退款成功|退款到账/.test(t);
 const actual=labeled(refunded?'退款金额|实际退款':'实付金额|实付款|实际支付|实际到账|到账金额|实付');
 const primary=actual.length?actual:labeled('付款金额|支付金额|收款金额|退款金额|交易金额');
 // Keep the headline transaction amount separate from coupons, order totals and exchange rates.
 // OCR can retain lines or flatten the entire screenshot into a single string.
 const headlines=[...t.matchAll(/(?<![\d.,])([+-]?)\s*[¥￥]?\s*(\d+(?:,\d{3})*\.\d{2})(?![\d.])\s*(?:元)?\s*(?:交易成功|支付成功|付款成功|收款成功|收款到账|退款成功|退款到账)/g)]
  .filter(m=>!/(?:订单金额|原支付金额|原价|优惠金额|现金抵价券|优惠券)[\s:：¥￥+-]*$/.test(t.slice(Math.max(0,m.index!-20),m.index)));
 const headlineAmounts=unique(headlines.map(m=>m[2]));
 const fieldsStart=t.search(/订单金额|原价|超优汇率|现金抵价券|优惠金额|支付时间|交易时间|创建时间|付款方式|支付方式|付款进度|商品说明|支付奖励/);
 const top=fieldsStart>=0?t.slice(0,fieldsStart):t;
 const detailAmounts=unique([...top.matchAll(/(?:账单详情|交易详情)[\s•·:：]*[+-]?\s*[¥￥]?\s*(\d+(?:,\d{3})*\.\d{2})(?![\d.])/g)].map(m=>m[1]));
 const currency=unique([...t.matchAll(new RegExp('[¥￥]\\s*[+-]?\\s*('+money+')','g'))]
  .filter(m=>!/(?:原价|订单金额|优惠金额|优惠券|现金抵价券|红包抵扣)[\s:：]*$/.test(t.slice(Math.max(0,m.index!-20),m.index))).map(m=>m[1]));
 const standalone=unique([...top.matchAll(/^\s*[+-]?\s*(\d+(?:,\d{3})*\.\d{2})\s*(?:元)?\s*$/gm)].map(m=>m[1]));
 const candidates=primary.length?primary:headlineAmounts.length?headlineAmounts:detailAmounts.length?detailAmounts:currency.length?currency:standalone;
 const conflict=primary.length===1&&headlineAmounts.length>0&&headlineAmounts.some(n=>n!==primary[0]);
 const amount=candidates.length===1&&!conflict?candidates[0]:'';
 const directionText=t.replace(/(?:商家|商户|对方)收款成功/g,'商家收款完成');
 const income=/收款成功|收款到账|到账成功|转账已收款|已收款|退款成功|退款到账|(?:^|\n)\s*收入\s*(?:\n|$)|收支[\s:：]*收入/.test(directionText);
 const headlinePositive=headlines.length===1&&headlines[0][1]==='+';
 const expense=/支付成功|付款成功|(?:^|\n)\s*支出\s*(?:\n|$)|收支[\s:：]*支出|付款金额|支付金额|实付|转账成功/.test(t)||(!headlinePositive&&/交易成功/.test(t));
 const pending=/支付失败|付款失败|交易关闭|退款中|退款处理中|待支付|等待付款/.test(t);
 const signedExpense=/^\s*-\s*(?:¥|￥)?\s*\d+(?:\.\d{1,2})?\s*(?:元)?\s*$/m.test(top)||headlines.some(m=>m[1]==='-');
 const signedIncome=/^\s*\+\s*(?:¥|￥)?\s*\d+(?:\.\d{1,2})?\s*(?:元)?\s*$/m.test(top)||headlinePositive;
 const type=pending?'':refunded?'收入':income!==expense?(income?'收入':'支出'):!income&&signedIncome!==signedExpense?(signedIncome?'收入':'支出'):'';
 const wx=/微信|零钱通|财付通|零钱支付|转账单号|(?:^|\n)\s*零钱\s*(?:\n|$)/.test(t),ali=/支付宝|余额宝|花呗|支付宝交易号/.test(t);
 const source=wx!==ali?(wx?'微信':'支付宝'):'';
 const nextField=/收单机构|交易单号|商户单号|交易服务|当前状态|交易状态|推荐服务|服务详情|订单金额|超优汇率|现金抵价券|优惠金额|支付时间|付款时间|交易时间|收款时间|到账时间|创建时间|付款方式|支付方式|付款进度|商品说明|支付奖励|商家处理中|商家收款成功|交易成功|支付成功|付款成功/;
 const tidy=(v:string)=>v.split(nextField)[0].replace(/^[\s:：]+|[\s:：]+$/g,'').trim();
 const usefulDescription=(v:string)=>!!v&&!/^(收单机构|支付方式|付款方式|交易单号|商户单号|当前状态|支付时间|商品|服务详情)$/.test(v)&&/[\u4e00-\u9fffA-Za-z]/.test(v)&&!/^\d{10,}/.test(v);
 const compactProduct=(v:string)=>tidy(v).replace(/[-—]\s*美团(?:App|APP)?\s*[-—]?[\s\d]*$/i,'').replace(/(?:订单号|订单编号)[\s:：]*\d{10,}.*$/,'').trim();
 let description=compactProduct(t.match(/(?:商品说明|商品名称|商品(?!单号|订单)|转账备注|备注)[\s:：]*([^\n]{1,200})/)?.[1]||'');
 if(!usefulDescription(description))description='';
 // WeChat can return the entire label column before the value column.
 // The Meituan App suffix identifies the product even in that ordering.
 if(!description&&/-美团App-/i.test(t)){const prefix=t.slice(0,t.search(/-美团App-/i));const last=prefix.trim().split('\n').at(-1)||'';const candidate=last.replace(/^.*\d{1,2}:\d{2}:\d{2}\s*/,'').replace(/^商品(?:名称|说明)?[\s:：]*/,'').trim();if(usefulDescription(candidate)&&!/(交易详情|当前状态|收单机构|支付方式|交易单号)/.test(candidate))description=candidate.slice(0,150);}
 if(!description){const detail=compactProduct(normalized.match(/服务详情[\s:：]*([^\n]{1,200})/)?.[1]||'');if(usefulDescription(detail))description=detail;}
 const paymentCandidate=tidy(t.match(/(?:付款方式|支付方式)[\s:：]*([^\n]{1,80})/)?.[1]||'');
 const paymentMethod=/(?:零钱通|零钱|余额宝|花呗)/.exec(paymentCandidate)?.[0]||/(?:零钱通|零钱|余额宝|花呗)/.exec(t)?.[0]||'';
 const labeledParty=tidy(t.match(/(?:收款方|商户名称|商户名|商家名称|商户)[\s:：]+([^\n]{1,150})/)?.[1]||'');
 const payTo=description.match(/^Pay\s+to\s+(.+)$/i)?.[1]?.trim()||'';
 const lines=t.split('\n').map(v=>v.trim()).filter(Boolean);
 const prominentLine=lines.findIndex(v=>/^[+-]?\s*(?:¥|￥)?\s*\d+(?:,\d{3})*\.\d{2}\s*(?:元)?$/.test(v));
 let preceding=prominentLine>0?lines[prominentLine-1]:'';
 if(!preceding&&headlines.length===1){const prefix=t.slice(0,headlines[0].index).trim().split('\n').filter(Boolean).at(-1)||'';preceding=prefix.replace(/^.*(?:全部账单|账单详情)\s*/,'').replace(/^订单金额[\s:：]*/,'').trim();}
 const plausible=(v:string)=>!!v&&v.length<=150&&/[\u4e00-\u9fffA-Za-z]/.test(v)&&!/(账单详情|交易详情|全部账单|金额|收入|支出|成功|状态|付款方式|支付方式|\d{2}:\d{2}|5G|汇率)/.test(v);
 let party=[labeledParty,payTo,preceding].find(plausible)||(/美团/.test(t)?'美团':'');
 if(/^V[CO0]GAMERS$/i.test(party))party='VCGAMERS';
 const dm=t.match(/(?:交易时间|支付时间|付款时间|收款时间|到账时间|创建时间|支付成功|付款成功)[\s:：]*(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 let date='';if(dm){const [y,m,d,h,mi,s]=dm.slice(1).map(x=>Number(x||0)),v=new Date(Date.UTC(y,m-1,d,h,mi,s));if(y>=1900&&y<=2200&&v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d&&h<24&&mi<60&&s<60)date=v.toISOString().slice(0,19).replace('T',' ');}
 const order=labeled('订单金额|原价'),discount=labeled('现金抵价券|优惠金额|红包抵扣|优惠券|立减');
 const notes=[];
 if(description&&!/^Pay\s+to\s+/i.test(description))notes.push(description);
 if(order.length===1&&amount&&order[0]!==amount)notes.push('订单 ¥'+order[0]);
 if(discount.length===1)notes.push('优惠 ¥'+discount[0]);
 if(paymentMethod)notes.push('付款：'+paymentMethod);
 if(!notes.length&&party)notes.push((type==='收入'?'收款：':'商户：')+party);
 const note=notes.join(' · ').slice(0,500);
 return {amount,type,source,party,date,note,candidates,transaction_text:t,needs_input:['amount','type','source'].filter(k=>!({amount,type,source} as Record<string,string>)[k])};
}



