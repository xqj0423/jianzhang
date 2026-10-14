import plistlib,json,uuid,re,os
from urllib.parse import urlparse
from pathlib import Path
root=Path(__file__).resolve().parent
origin=os.environ.get('SHORTCUT_API_ORIGIN','').rstrip('/')
parsed=urlparse(origin)
if parsed.scheme!='https' or not parsed.netloc or parsed.path or parsed.username or parsed.password:
    raise ValueError('请通过环境变量 SHORTCUT_API_ORIGIN 配置 HTTPS 网站来源地址')
actions=[]
def action(name,**params):
    ident=str(uuid.uuid4()).upper();params['UUID']=ident
    actions.append({'WFWorkflowActionIdentifier':'is.workflow.actions.'+name,'WFWorkflowActionParameters':params})
    return {'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'ActionOutput','OutputUUID':ident,'OutputName':name}}
def token(value):
    if isinstance(value,str):return {'WFSerializationType':'WFTextTokenString','Value':{'string':value,'attachmentsByRange':{}}}
    return {'WFSerializationType':'WFTextTokenString','Value':{'string':'\ufffc','attachmentsByRange':{'{0, 1}':value['Value']}}}
def dictionary(values):
    return {'WFSerializationType':'WFDictionaryFieldValue','Value':{'WFDictionaryFieldValueItems':[{'WFItemType':0,'WFKey':token(k),'WFValue':token(v)} for k,v in values.items()]}}
def val(v,key):return action('getvalueforkey',WFInput=v,WFDictionaryKey=key,WFGetDictionaryValueType='Value')
def begin(v,code,n):
    group=str(uuid.uuid4()).upper()
    literal={} if code in (100,101) else {'WFConditionalActionString':str(n)} if code==4 else {'WFNumberValue':n}
    action('conditional',GroupingIdentifier=group,WFControlFlowMode=0,WFInput={'Type':'Variable','Variable':v},WFCondition=code,**literal)
    return group
def end(group,mode):return action('conditional',GroupingIdentifier=group,WFControlFlowMode=mode)
def setvar(name,v):return action('setvariable',WFVariableName=name,WFInput=v)
def variable(name):return {'WFSerializationType':'WFTextTokenAttachment','Value':{'Type':'Variable','VariableName':name}}
def choose(options,prompt):
    listing=action('list',WFItems=[{'WFItemType':0,'WFValue':token(x)} for x in options])
    return action('choosefromlist',WFInput=listing,WFChooseFromListActionPrompt=prompt,WFChooseFromListActionSelectMultiple=False)


def message(parts):
    string='';refs={}
    for p in parts:
        if isinstance(p,str):string+=p
        else:refs['{%d, 1}'%len(string)]=p['Value'];string+='\ufffc'
    return {'WFSerializationType':'WFTextTokenString','Value':{'string':string,'attachmentsByRange':refs}}

def autofield(result,key,name,prompt,options=None):
    value=val(result,key);text=action('gettext',WFTextActionText=token(value));g=begin(text,100,None)
    setvar(name,text);end(g,1)
    manual=choose(options,prompt) if options else action('ask',WFAskActionPrompt=prompt,WFInputType='Text',WFAllowsMultilineText=False)
    setvar(name,manual);end(g,2)
    return variable(name)

action('comment',WFCommentActionText='一次连接：在网站设置复制完整连接配置并粘贴到安装设置。每次只需选择付款详情截图；文字在本账本服务器识别并保存，不再询问金额、收支或来源。无法确定则不保存、保留截图；仅保存成功才删除所选照片。')
config_index=len(actions)
configuration=action('gettext',WFTextActionText='在这里粘贴个人连接配置的完整 JSON')
auth_match=action('text.match',WFMatchTextPattern=r'Bearer [a-zA-Z0-9_-]{8,}',WFInput=configuration,WFMatchTextCaseSensitive=True)
auth_count=action('count',Input=auth_match,WFCountType='Items')
guard=begin(auth_count,0,1)
action('alert',WFAlertActionTitle='需要连接账本',WFAlertActionMessage='网站设置 → 复制连接配置。编辑快捷指令，把最上面的文本替换为完整配置。只需设置一次。',WFAlertActionCancelButtonShown=False)
action('exit');end(guard,2)
authorization=action('gettext',WFTextActionText=token(auth_match))
photo=action('selectphoto',WFSelectMultiplePhotos=False)
imagehash=action('hash',WFInput=photo,WFHashType='SHA256')
extracted=action('extracttextfromimage',WFImage=photo)
raw=action('gettext',WFTextActionText=token(extracted))
result=action('downloadurl',WFURL=origin+'/api/capture',WFHTTPMethod='POST',WFHTTPBodyType='JSON',WFHTTPHeaders=dictionary({'Authorization':authorization,'Content-Type':'application/json'}),WFJSONValues=dictionary({'text':raw,'request_id':imagehash}))
decoded=action('detect.dictionary',WFInput=result)
saved=val(decoded,'save_status');saved_text=action('gettext',WFTextActionText=token(saved))
g=begin(saved_text,4,'saved')
amount=val(decoded,'amount');kind=val(decoded,'type');source=val(decoded,'source');party=val(decoded,'party')
action('notification',WFNotificationActionTitle='已记入简账',WFNotificationActionBody=message([party,' · ',kind,' ¥',amount,' · ',source]),WFNotificationActionSound=False)
action('deletephotos',WFInput=photo,photos=photo)
end(g,1)
error=val(decoded,'error')
action('alert',WFAlertActionTitle='未保存，截图已保留',WFAlertActionMessage=message([error,'\n没有自动删除截图，也没有写入错误金额。']),WFAlertActionCancelButtonShown=False)
end(g,2)
workflow={'WFWorkflowName':'简账截图自动记账4','WFWorkflowClientVersion':'3107.0.8.2','WFWorkflowClientRelease':'22.1','WFWorkflowMinimumClientVersion':900,'WFWorkflowTypes':['NCWidget'],'WFWorkflowInputContentItemClasses':['WFImageContentItem'],'WFWorkflowIcon':{'WFWorkflowIconStartColor':4282601983,'WFWorkflowIconGlyphNumber':61440},'WFWorkflowImportQuestions':[{'ActionIndex':config_index,'ParameterKey':'WFTextActionText','Category':'Parameter','Text':'粘贴网站设置中复制的完整连接配置，只需设置一次。','DefaultValue':''}],'WFWorkflowActions':actions}
(root/'generated').mkdir(exist_ok=True)
unsigned=root/'generated/简账截图记账.unsigned.shortcut'
unsigned.write_bytes(plistlib.dumps(workflow,fmt=plistlib.FMT_XML,sort_keys=False))
assert not any(a['WFWorkflowActionIdentifier'] in ['is.workflow.actions.ask','is.workflow.actions.choosefromlist'] for a in actions)
assert not re.search(r'Bearer\s+[A-Za-z0-9_-]{10,}',unsigned.read_text(encoding='utf-8'))
print('Verified unsigned workflow:',len(actions),'actions; single recognition/save request, no per-record manual fields or embedded credentials')
