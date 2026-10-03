'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {parse,modify,applyEdits}=require('jsonc-parser');
const {atomicWrite,readLimited,assertDirectory,exists}=require('./files.cjs');
const {UserError}=require('./errors.cjs');
const KEY='chatgpt.cliExecutable';
function settingsValue(text){
  const errors=[];const obj=parse(text.replace(/^\uFEFF/,''),errors,{allowTrailingComma:true,allowEmptyContent:false});
  if(errors.length||!obj||Array.isArray(obj)||typeof obj!=='object')throw new UserError('settings.json của VS Code chưa hợp lệ; sửa tệp trước khi kết nối.', 'VSCODE_SETTINGS');
  return obj;
}
class Integration{
  constructor(service,file=path.join(process.env.APPDATA||'', 'Code','User','settings.json')){this.service=service;this.file=file;this.record=path.join(service.root,'vscode-integration.json');}
  async text(){await assertDirectory(path.dirname(this.file));return await exists(this.file)?(await readLimited(this.file,4*1024*1024)).toString('utf8'):'{}';}
  async configure(helper){
    if(!helper||!await exists(helper))throw new UserError('Bật gateway trước khi kết nối VS Code.', 'GATEWAY_STOPPED');
    const original=await this.text();const values=settingsValue(original);
    let record=await exists(this.record)?JSON.parse((await readLimited(this.record)).toString('utf8')):null;
    if(values[KEY]===helper)return;
    if(record&&record.file!==this.file)throw new UserError('Có cấu hình VS Code khác chưa được khôi phục.', 'VSCODE_SETTINGS');
    record=record||{file:this.file,hadValue:Object.hasOwn(values,KEY),previous:values[KEY]??null,helper};
    record.helper=helper;
    const next=applyEdits(original,modify(original,[KEY],helper,{formattingOptions:{insertSpaces:true,tabSize:4,eol:original.includes('\r\n')?'\r\n':'\n'}}));
    // Keep the old single setting only, never copy other potentially sensitive settings into app data.
    await atomicWrite(this.record,JSON.stringify(record));
    if(await this.text()!==original)throw new UserError('VS Code vừa thay đổi cài đặt. Hãy thử lại.', 'VSCODE_CHANGED');
    await atomicWrite(this.file,next);
  }
  async restore(){
    if(!await exists(this.record))throw new UserError('Chưa có cấu hình VS Code do PADSwitcher thay đổi.', 'VSCODE_SETTINGS');
    const record=JSON.parse((await readLimited(this.record)).toString('utf8'));
    if(record.file!==this.file)throw new UserError('Đường dẫn khôi phục không khớp.', 'VSCODE_SETTINGS');
    const text=await this.text();const values=settingsValue(text);
    if(values[KEY]!==record.helper)throw new UserError('Đường dẫn Codex đã được bạn đổi. PADSwitcher giữ nguyên giá trị hiện tại.', 'VSCODE_CHANGED');
    const next=applyEdits(text,modify(text,[KEY],record.hadValue?record.previous:undefined,{formattingOptions:{insertSpaces:true,tabSize:4}}));
    if(await this.text()!==text)throw new UserError('VS Code vừa thay đổi cài đặt. Hãy thử lại.', 'VSCODE_CHANGED');
    await atomicWrite(this.file,next);await fs.unlink(this.record);
  }
}
module.exports={Integration,settingsValue};
