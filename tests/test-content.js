'use strict';
// Dependency-free test for reversible DOM adjustments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class CSSStyle {
  constructor() { this.data = {}; }
  getPropertyValue(k) { return this.data[k]?.value || ''; }
  getPropertyPriority(k) { return this.data[k]?.priority || ''; }
  setProperty(k,v,p='') { this.data[k] = {value:v,priority:p}; }
  removeProperty(k) { delete this.data[k]; }
}
class Element {
  constructor(tag,parent=null,original={}) {
    this.tag=tag; this.parentElement=parent; this.original=original;
    this.style=new CSSStyle(); this.children=[];
    if(parent)parent.children.push(this);
  }
  matches(s){return s.split(',').map(x=>x.trim()).includes(this.tag);}
  querySelector(s){return this.children.find(x=>x.matches(s)||x.querySelector(s))||null;}
}
const root=new Element('html');
const body=new Element('body',root,{overflow:'hidden','overflow-y':'hidden'});
const article=new Element('article',body);
const hidden=new Element('section',article,{display:'none'});
const para=new Element('p',hidden);
const blurred=new Element('p',article,{filter:'blur(8px)'});
const overlay=new Element('.demo-overlay',body,{display:'grid'});
let handler;
const document={body,documentElement:root,querySelectorAll(s){
  if(s==='article p')return [para,blurred];
  if(s==='.demo-overlay')return [overlay];
  throw Error('Unexpected selector: '+s);
}};
const ctx=vm.createContext({
  Element,document,
  getComputedStyle(el){
    const val=(p,f)=>el.style.getPropertyValue(p)||el.original[p]||f;
    return {display:val('display','block'),visibility:val('visibility','visible'),
      filter:val('filter','none'),backdropFilter:val('backdrop-filter','none'),
      overflow:val('overflow','visible'),overflowY:val('overflow-y','visible')};
  },
  chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}}}},
  globalThis:null,MutationObserver:class{observe(){} disconnect(){}},setTimeout,clearTimeout
});
ctx.globalThis=ctx;
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','content.js'),'utf8'),ctx);
function send(action,settings){
  let res;
  handler({channel:'CONTENT_UNHIDER_V1',action,settings},null,x=>res=x);
  assert.equal(res.ok,true,JSON.stringify(res));
  return res.data;
}
const applied=send('apply',{
  hideOverlays:true,revealText:true,removeBlur:true,restoreScroll:true,
  watchChanges:false,overlaySelectors:'.demo-overlay',textSelectors:'article p'
});
assert.equal(overlay.style.getPropertyValue('display'),'none');
assert.equal(hidden.style.getPropertyValue('display'),'revert');
assert.equal(blurred.style.getPropertyValue('filter'),'none');
assert.equal(body.style.getPropertyValue('overflow'),'auto');
assert.equal(applied.observerEnabled,false);
assert.ok(applied.elementsChanged>=4);
const restored=send('restore');
assert.ok(restored.elementsRestored>=4);
for(const el of [overlay,hidden,blurred,body])
  assert.equal(el.style.getPropertyValue(el===body?'overflow':el===blurred?'filter':'display'),'');
assert.equal(send('restore').elementsRestored,0);
console.log('PASS: apply, restore and repeated restore');
