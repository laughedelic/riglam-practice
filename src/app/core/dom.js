/** @type {(id: string) => HTMLElement} */
export const $=id=>document.getElementById(id);
export function el(tag, props, ...kids){
  const n=document.createElement(tag);
  if(props) for(const [k,v] of Object.entries(props)){
    if(v==null||v===false) continue;
    if(k==="class") n.className=v;
    else if(k==="text") n.textContent=v;
    else if(k==="style") n.setAttribute("style",v);
    else if(k.startsWith("on")) n.addEventListener(k.slice(2),v);
    else n.setAttribute(k, v===true?"":v);
  }
  for(const c of kids.flat()) if(c!=null&&c!==false) n.append(c.nodeType?c:document.createTextNode(String(c)));
  return n;
}
export const L=x=>el("span",{class:"L"+(x==="B"?" lb":""),text:x});
