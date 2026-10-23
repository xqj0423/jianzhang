// Synthetic regression cases; no network, real cookies, mail or ledger data.
const check=(condition,message)=>{if(!condition)throw Error(message);};
function fixture(html){
 const elements=new Map(),storage=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,options:[],dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},focus(){this.focused=true},querySelector(){return element("entryClose")},addEventListener(){},showModal(){this.open=true},close(){this.open=false},add(option){this.options.push(option)}});return elements.get(id)};
 const document={readyState:'loading',getElementById:element,addEventListener(){},querySelectorAll:()=>[],querySelector:()=>null,body:{classList:{add(){},remove(){}}}};
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 const factory=new Function('document','matchMedia','crypto','localStorage','window','navigator','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','Option','structuredClone',script+`
 return {openEntry,openDetails,editViewedEntry,submitEntry,confirmDelete,renderDetails,renderTrend,importIssuesCsv:typeof importIssuesCsv==='function'?importIssuesCsv:null,renderImportPreview:typeof renderImportPreview==='function'?renderImportPreview:null,setPlans(v){plans=v},
 configure(v){if(v.db)db=v.db;if(v.month)$('month').value=v.month;if(v.screen)activeScreen=v.screen;ready=true;busy=false;if(v.deleteId)deleteId=v.deleteId;},
 setSave(fn){save=fn},snapshot(){return structuredClone(db)},today:todayCN};
 `);
 const api=factory(document,()=>({matches:false,addEventListener(){}}),{randomUUID:()=> 'fixture-new-id'},{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}, {},{},()=>1,()=>{},()=>1,()=>{},function(text,value){this.text=text;this.value=value??text},v=>JSON.parse(JSON.stringify(v)));
 element('eCat').options=['餐饮','购物','工资','其他'].map(value=>({value}));
 element('eSource').options=[{value:'手动'}];
 element('sheetSuccess').hidden=true;
 return {api,element,storage};
}
const row=()=>({id:'fixture-row',date:'2026-02-12 12:30:37',type:'支出',cents:1234,party:'模拟商户',note:'',category:'餐饮',source:'手动',tx:''});
const book=rows=>({version:1,initial:0,rows});
export const uiCases=[
 ['record details do not open editing or focus the amount',async html=>{
  const {api,element}=fixture(html);const original=book([row()]);api.configure({db:original,month:'2026-02'});api.openDetails(row());
  check(element('recordDialog').open,'details did not open');check(!element('entryDialog').open,'editor opened immediately');check(!element('eAmount').focused,'amount received focus');check(element('recordParty').textContent==='模拟商户','details missing party');check(element('recordDate').textContent===row().date,'details changed timestamp');
  check(html.includes('else openDetails(db.rows.find'),'row click still opens editor');
  api.editViewedEntry();check(element('entryDialog').open,'explicit edit did not open editor');check(!element('recordDialog').open,'details remained open');check(!element('eAmount').focused,'edit auto-focused amount');check(element('eAmount').value==='12.34','edit changed original amount');check(element('entryClose').focused,'editor has no keyboard-free focus target');
 }],
 ['new entries still focus their amount',async html=>{const {api,element}=fixture(html);api.configure({db:book([]),month:'2026-02'});api.openEntry();check(element('eAmount').focused,'new entry did not focus amount');}],
 ['failed deletion can be retried in the same dialog',async html=>{
  const {api,element}=fixture(html);const original=book([row()]);api.configure({db:original,deleteId:'fixture-row',month:'2026-02'});element('deleteDialog').open=true;
  let attempts=0;api.setSave(async()=>{attempts++;if(attempts===1){api.configure({db:book([row()])});return false}return true});
  await api.confirmDelete();check(element('deleteDialog').open,'failed deletion closed the dialog');await api.confirmDelete();
  check(attempts===2,'retry did not send a second deletion');check(api.snapshot().rows.length===0,'retry did not delete the row');check(!element('deleteDialog').open,'successful deletion left dialog open');
 }],
 ['editing an amount retains imported seconds',async html=>{
  const {api,element}=fixture(html);api.configure({db:book([row()]),month:'2026-02'});api.setSave(async()=>true);api.openEntry(row());element('eAmount').value='20.00';await api.submitEntry({preventDefault(){}});
  check(api.snapshot().rows[0].date==='2026-02-12 12:30:37','editing discarded seconds');check(api.snapshot().rows[0].cents===2000,'amount was not saved');
 }],
 ['new entry belongs to the selected historical month',async html=>{
  const {api,element}=fixture(html);api.configure({db:book([]),month:'2026-02',screen:'details'});api.openEntry();
  check(element('eDate').value.startsWith('2026-02-'),'entry ignored selected month');
 }],
 ['successful entries remember category without failed saves overwriting it',async html=>{
  const {api,element}=fixture(html);api.configure({db:book([]),month:'2026-02'});api.setSave(async()=>true);api.openEntry();element('eCat').value='餐饮';element('eAmount').value='12.34';await api.submitEntry({preventDefault(){}});
  element('sheetSuccess').hidden=true;api.openEntry();check(element('eCat').value==='餐饮','last category was forgotten');
  api.setSave(async()=>false);element('eCat').value='购物';element('eAmount').value='5';await api.submitEntry({preventDefault(){}});api.openEntry();check(element('eCat').value==='餐饮','failed save replaced category preference');
 }],
 ['empty search offers clear filters instead of a first-entry action',async html=>{
  const {api,element}=fixture(html);api.configure({db:book([row()]),month:'2026-02'});element('search').value='没有这个商户';api.renderDetails();
  check(element('ledger').innerHTML.includes('data-clear-filters'),'no clear-filter action');check(!element('ledger').innerHTML.includes('data-new-entry'),'search failure encourages duplicate entry');
 }],
 ['trend shows exact monthly values without relying on SVG descriptions',async html=>{
  const {api,element}=fixture(html);api.configure({db:book([row()]),month:'2026-02'});api.renderTrend();
  check(element('trendChart').innerHTML.includes('trend-values'),'monthly value controls missing');check(/<strong[^>]*>¥12\.34<\/strong>/.test(element('trendChart').innerHTML),'visible exact amount missing');
 }],
 ['search label explains its monthly scope',async html=>{
  check(html.includes('搜索本月商户或备注'),'search scope is ambiguous');
 }]
,
 ['skipped import rows beyond the first hundred remain inspectable and downloadable',async html=>{
  const {api,element}=fixture(html);check(api.renderImportPreview&&api.importIssuesCsv,'missing import issue inspection');
  const plans=Array.from({length:150},(_,i)=>({r:{...row(),id:'row-'+i,party:i===149?'=fixture-formula':'模拟商户'},reason:i>=120?'日期无效':''}));
  api.setPlans(plans);element('importIssuesOnly').checked=true;api.renderImportPreview();
  check(element('preview').innerHTML.includes('fixture-formula'),'late issue omitted from filtered preview');
  const csv=api.importIssuesCsv();check(csv.split('\r\n').length===31,'download omitted skipped rows');check(csv.includes("'=fixture-formula"),'CSV formula prefix was not neutralized');
  check(!element('downloadImportIssues').disabled,'issue download disabled');
 }],
 ['ledger page declares an inline favicon',async html=>{
  check(html.includes('rel="icon"'),'ledger page has no favicon');check(html.includes('data:image/svg+xml'),'favicon is not an inline SVG');
 }],
 ['entry category options are escaped like every other category rendering',async html=>{
  check(html.includes("cats.map(c=>'<option>'+esc(c)+'</option>')"),'entry category options are not escaped');
  check(!html.includes("'<option>'+c+'</option>'"),'unescaped category option remains');
 }]
];
export async function runUiRegressions(html){
 const results=[];
 for(const [name,run] of uiCases){try{await run(html);results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:e.message})}}
 return results;
}
