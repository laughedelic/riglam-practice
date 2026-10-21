// Line icons of the page: one style (24 px grid, round caps), drawn with the text color. The toolbar uses them at 24 px (class "tbi",
// stroke 1.75, outline when off, filled when on, src/app/styles/25-toolbar.css); lock and key are small ones that sit beside text (class "ico").
const P={
  watch:'<circle class="fa" cx="12" cy="13.5" r="7.5"/><path class="fb" d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  review:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear:'<path d="M10.38 4.98L10.65 2.39L13.35 2.39L13.62 4.98L15.82 5.89L17.84 4.25L19.75 6.16L18.11 8.18L19.02 10.38L21.61 10.65L21.61 13.35L19.02 13.62L18.11 15.82L19.75 17.84L17.84 19.75L15.82 18.11L13.62 19.02L13.35 21.61L10.65 21.61L10.38 19.02L8.18 18.11L6.16 19.75L4.25 17.84L5.89 15.82L4.98 13.62L2.39 13.35L2.39 10.65L4.98 10.38L5.89 8.18L4.25 6.16L6.16 4.25L8.18 5.89Z"/><circle cx="12" cy="12" r="3"/>',
  refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
  chat:'<path d="M3 3h11v7H7.5L5 12.5V10H3z"/><path d="M10 13h11v7h-2v2.5L16.5 20H10z"/>',
  recent:'<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4v4.5H8"/><path d="M12 7.5V12l3 2"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  skip:'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/>',
  speak:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
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
