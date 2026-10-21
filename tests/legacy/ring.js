// The focus-ring check the legacy tests use: `ringScan` runs in the page and lists every control whose 4 px focus ring a container
// that clips sideways would cut. The same check is part of the layout specs (tests/support/layout-scans.js).
const {open}=require('./harness.js');
const ORDER={mi:0,'3ab':1,'3ba':2,'4':3,con:4};
const ringScan=()=>{
  const out=[];
  const els=[...document.querySelectorAll('button,input,select,textarea,summary,[tabindex]')].filter(n=>{const cs=getComputedStyle(n),r=n.getBoundingClientRect();return cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0&&n.tabIndex>=0&&!n.disabled;});
  for(const n of els){
    if(getComputedStyle(n).getPropertyValue('--ring-inset').trim()==='1') continue; // draws its ring inside itself (the menu rows)
    const r=n.getBoundingClientRect(); let a=n.parentElement;
    while(a&&a!==document.documentElement){
      const cs=getComputedStyle(a);
      if(/hidden|clip|auto|scroll/.test(cs.overflowX)){
        const b=a.getBoundingClientRect(), L=b.left+parseFloat(cs.borderLeftWidth), R=b.right-parseFloat(cs.borderRightWidth);
        // only report when the element is inside the visible part of the container vertically
        if(r.bottom>b.top&&r.top<b.bottom&&(r.left-4<L-0.5||r.right+4>R+0.5)) out.push(n.tagName+'.'+String(n.className).split(' ')[0]+'#'+n.id+' ('+(n.textContent||n.placeholder||'').trim().slice(0,18)+') in '+a.tagName+'.'+String(a.className).split(' ')[0]+'#'+a.id+' gap L'+Math.round(r.left-L)+' R'+Math.round(R-r.right));
      }
      a=a.parentElement;
    }
  }
  return [...new Set(out)];
};
module.exports={ringScan,ORDER};
