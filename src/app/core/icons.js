// Line icons of the page: one style (24 px grid, round caps), drawn with the text color. The toolbar uses them at 24 px (class "tbi",
// stroke 1.75, outline when off, filled when on, src/app/styles/25-toolbar.css); lock and key are small ones that sit beside text (class "ico").
const P={
  watch:'<circle class="fa" cx="12" cy="13.5" r="7.5"/><path class="fb" d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  review:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
  chat:'<path d="M4 5h16v11H10l-6 4z"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  skip:'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  sliders:'<path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  back:'<polyline points="15 4 7 12 15 20"/>',
  chev:'<polyline points="9 5 16 12 9 19"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.9"/>',
  key:'<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3m-4 4 3 3m-5.5-.5 2 2"/>'
};
export function tbIcon(name,cls="tbi"){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 24 24"); svg.setAttribute("class",cls); svg.setAttribute("aria-hidden","true"); svg.innerHTML=P[name];
  return svg;
}
/** A small icon beside text. */
export const ico=name=>tbIcon(name,"ico");
/** A closed lock that opens while the button around it is hovered or focused (src/app/styles/25-toolbar.css). */
export function lockIcon(){
  const s=document.createElement("span"); s.className="lockic"; s.setAttribute("aria-hidden","true");
  const a=tbIcon("lock","ico closed"), b=tbIcon("unlock","ico open");
  s.append(a,b);
  return s;
}
