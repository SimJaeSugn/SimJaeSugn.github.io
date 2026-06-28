/* AgenticERM 홍보영상 — scenes. Reads timeline engine globals from window. */
const { Stage, Sprite, useTime, useTimeline, Easing, interpolate, animate, clamp } = window;

// ── palette ──────────────────────────────────────────────────────────────
const BG     = '#0b0e14';
const BARBG  = '#0d1119';
const PANEL  = '#141a24';
const CARD   = '#161d29';
const CARDHD = '#1b2433';
const LINE   = '#283346';
const STROKE = '#33415a';
const SUB    = '#7d8aa0';
const INK    = '#e8edf5';
const BLUE   = '#5b9dff';
const BLUE2  = '#2f63e0';
const GREEN  = '#46c08a';
const AMBER  = '#e0a955';
const RED    = '#e2606a';
const KFONT  = "'Noto Sans KR', system-ui, sans-serif";
const MONO   = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const E = Easing.easeInOutCubic;

// ── camera ───────────────────────────────────────────────────────────────
const camT  = [0,   4.0, 5.0, 9.5, 10.0,13.0,16.5,17.0,21.5,22.0,26.5,27.0,30];
const camCx = [600, 615, 1095,1095,470, 560, 660, 640, 640, 640, 640, 640, 640];
const camCy = [372, 372, 360, 360, 360, 360, 360, 372, 372, 376, 376, 360, 360];
const camCz = [1.00,1.07,1.36,1.38,1.30,1.30,1.30,1.16,1.16,1.12,1.12,1.00,1.00];
const fCx = interpolate(camT, camCx, E);
const fCy = interpolate(camT, camCy, E);
const fCz = interpolate(camT, camCz, E);

function Camera({ children }) {
  const t = useTime();
  const z = fCz(t), cx = fCx(t), cy = fCy(t);
  const tx = 640 - cx * z, ty = 360 - cy * z;
  return (
    <div style={{
      position:'absolute', left:0, top:0, width:1280, height:720,
      transformOrigin:'0 0',
      transform:`translate(${tx}px, ${ty}px) scale(${z})`,
    }}>{children}</div>
  );
}

// ── ERD table data ─────────────────────────────────────────────────────────
const T = {
  dept:  { x:250, y:96,  w:152, title:'부서', std:10.3, rows:[
    {k:'PK', en:'ID', ko:'ID', t:'bigint', keep:true},
    {k:'',   en:'DEPT_CODE', ko:'부서코드', t:'varchar'},
    {k:'',   en:'NAME', ko:'부서명', t:'varchar'},
    {k:'FK', en:'PARENT_DEPT_CODE', ko:'상위부서코드', t:'varchar'},
    {k:'',   en:'EFFECTIVE_FROM', ko:'적용시작일', t:'date'},
  ]},
  emp:   { x:250, y:330, w:182, title:'직원', std:12.0, rows:[
    {k:'PK', en:'EMP_NO', ko:'사번', t:'varchar', keep:false},
    {k:'',   en:'NAME', ko:'성명', t:'varchar'},
    {k:'',   en:'EMAIL', ko:'이메일', t:'varchar'},
    {k:'',   en:'PHONE', ko:'전화번호', t:'varchar'},
    {k:'FK', en:'POSITION_ID', ko:'직위ID', t:'int'},
    {k:'',   en:'HIRED_ON', ko:'입사일', t:'date'},
    {k:'',   en:'STATUS', ko:'상태', t:'varchar'},
  ]},
  att:   { x:470, y:96,  w:158, title:'근태', std:11.4, rows:[
    {k:'PK', en:'ID', ko:'ID', t:'bigint', keep:true},
    {k:'FK', en:'EMP_NO', ko:'사번', t:'varchar'},
    {k:'',   en:'WORK_DATE', ko:'근무일자', t:'date'},
    {k:'',   en:'CHECK_IN_AT', ko:'출근시각', t:'datetime'},
    {k:'',   en:'CHECK_OUT_AT', ko:'퇴근시각', t:'datetime'},
    {k:'',   en:'STATUS', ko:'상태', t:'varchar'},
  ]},
  head:  { x:470, y:372, w:152, title:'부서장', std:10.8, rows:[
    {k:'PK', en:'ID', ko:'ID', t:'bigint', keep:true},
    {k:'FK', en:'DEPT_CODE', ko:'부서코드', t:'varchar'},
    {k:'FK', en:'EMP_NO', ko:'사번', t:'varchar'},
    {k:'',   en:'EFFECTIVE_FROM', ko:'적용시작일', t:'date'},
  ]},
  pos:   { x:700, y:120, w:150, title:'직위', std:13.4, rows:[
    {k:'PK', en:'ID', ko:'ID', t:'bigint', keep:true},
    {k:'',   en:'NAME', ko:'직위명', t:'varchar'},
    {k:'',   en:'SORT_ORDER', ko:'정렬순서', t:'int'},
    {k:'',   en:'IS_ACTIVE', ko:'사용여부', t:'tinyint'},
  ]},
  grade: { x:700, y:360, w:150, title:'직위등급', std:13.9, rows:[
    {k:'PK', en:'POSITION_ID', ko:'직위ID', t:'int'},
    {k:'',   en:'GRADE', ko:'등급', t:'varchar'},
    {k:'',   en:'NOTE', ko:'비고', t:'varchar'},
  ]},
};
const ROW_H = 21, HEAD_H = 26;

function cardH(d){ return HEAD_H + d.rows.length*ROW_H + 8; }

function TableCard({ d }) {
  const t = useTime();
  const h = cardH(d);
  const stdDone = t > d.std + d.rows.length*0.1 + 0.4;
  return (
    <div style={{
      position:'absolute', left:d.x, top:d.y, width:d.w,
      background:CARD, border:`1px solid ${stdDone?BLUE:STROKE}`,
      borderRadius:7, overflow:'hidden',
      boxShadow:'0 10px 24px rgba(0,0,0,.38)',
      fontFamily:KFONT, transition:'border-color .3s',
    }}>
      <div style={{
        height:HEAD_H, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 9px', background:CARDHD, borderBottom:`1px solid ${LINE}`,
      }}>
        <span style={{ fontSize:12, fontWeight:700, color:INK, letterSpacing:'.01em' }}>{d.title}</span>
        <span style={{
          fontSize:8.5, fontWeight:700, color:BLUE, fontFamily:MONO,
          opacity: clamp((t-(d.std+d.rows.length*0.1+0.2))/0.4,0,1),
          border:`1px solid ${BLUE}55`, borderRadius:3, padding:'1px 4px',
        }}>✓ 표준</span>
      </div>
      {d.rows.map((r,i)=>{
        const flipT = d.std + i*0.1;
        const flipped = t > flipT && !r.keep;
        const hl = clamp(1 - Math.abs(t - flipT)/0.45, 0, 1);
        const label = flipped ? r.ko : r.en;
        return (
          <div key={i} style={{
            height:ROW_H, display:'flex', alignItems:'center', gap:5, padding:'0 9px',
            background: hl>0 ? `rgba(91,157,255,${0.22*hl})` : 'transparent',
            borderBottom: i<d.rows.length-1?`1px solid ${LINE}55`:'none',
          }}>
            <span style={{
              fontSize:7.5, fontFamily:MONO, fontWeight:700, width:14,
              color: r.k==='PK'?AMBER : r.k==='FK'?BLUE : '#56627a',
            }}>{r.k||'N'}</span>
            <span style={{
              flex:1, fontSize:10, color: flipped?INK:'#9aa6bb',
              fontFamily: flipped?KFONT:MONO, fontWeight: flipped?500:400,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            }}>{label}</span>
            <span style={{ fontSize:7.5, fontFamily:MONO, color:'#4d586e' }}>{r.t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── relations ───────────────────────────────────────────────────────────────
const RELCOL = '#5a86c4';
const RELS = [
  { pts:[[325,216],[325,278],[336,278],[336,330]], many:'end',   one:'start', label:'1:N', lp:[345,268] },
  { pts:[[432,372],[432,168],[470,168]],           many:'end',   one:'start', label:'1:N', lp:[441,182] },
  { pts:[[432,420],[470,423]],                      many:'end',   one:'start', label:'1:N', lp:[438,438] },
  { pts:[[432,396],[560,396],[560,182],[700,182]],  many:'start', one:'end',   label:'1:N', lp:[470,388] },
  { pts:[[775,240],[775,360]],                      many:'none',  one:'both',  label:'1:1', lp:[783,304] },
];
function crowFoot(ax,ay,bx,by,col){
  const dx=bx-ax, dy=by-ay, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, px=-uy, py=ux;
  const Bx=ax+ux*13, By=ay+uy*13;
  return <g key="f" stroke={col} strokeWidth="1.4" fill="none" strokeLinecap="round">
    <line x1={Bx} y1={By} x2={ax} y2={ay}/>
    <line x1={Bx} y1={By} x2={ax+px*5} y2={ay+py*5}/>
    <line x1={Bx} y1={By} x2={ax-px*5} y2={ay-py*5}/>
  </g>;
}
function oneBar(ax,ay,bx,by,col){
  const dx=bx-ax, dy=by-ay, L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, px=-uy, py=ux;
  const Cx=ax+ux*9, Cy=ay+uy*9;
  return <line key="b" x1={Cx+px*5} y1={Cy+py*5} x2={Cx-px*5} y2={Cy-py*5} stroke={col} strokeWidth="1.4" strokeLinecap="round"/>;
}
function relMarkers(r, col){
  const p=r.pts, n=p.length, out=[];
  if (r.many==='end')   out.push(crowFoot(p[n-1][0],p[n-1][1],p[n-2][0],p[n-2][1],col));
  if (r.many==='start') out.push(crowFoot(p[0][0],p[0][1],p[1][0],p[1][1],col));
  if (r.one==='end'  || r.one==='both') out.push(oneBar(p[n-1][0],p[n-1][1],p[n-2][0],p[n-2][1],col));
  if (r.one==='start'|| r.one==='both') out.push(oneBar(p[0][0],p[0][1],p[1][0],p[1][1],col));
  return out;
}
function CardLabel({x,y,text}){
  return <g>
    <rect x={x-3} y={y-9} width={text.length*6.4+6} height={14} rx="3" fill="#0d1119" opacity="0.85"/>
    <text x={x} y={y+1.5} fontSize="9.5" fontFamily={MONO} fill="#94a9c8">{text}</text>
  </g>;
}
function Relations(){
  const t = useTime();
  const draw = clamp((t-14.2)/1.1, 0, 1);
  const newR = { pts:[[402,150],[540,150],[540,372]], many:'end', one:'start', label:'1:N', lp:[548,300] };
  const np = newR.pts.map(p=>p.join(',')).join(' ');
  return (
    <svg width="1280" height="720" style={{ position:'absolute', left:0, top:0, pointerEvents:'none' }}>
      {RELS.map((r,i)=>(
        <g key={i}>
          <polyline points={r.pts.map(p=>p.join(',')).join(' ')} fill="none" stroke={RELCOL} strokeWidth="1.5" strokeLinejoin="round"/>
          {relMarkers(r, RELCOL)}
          <CardLabel x={r.lp[0]} y={r.lp[1]} text={r.label}/>
        </g>
      ))}
      {draw>0 && <g>
        <polyline points={np} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round"
          strokeDasharray="430" strokeDashoffset={430*(1-draw)}/>
        {draw>0.92 && relMarkers(newR, BLUE)}
        {draw>0.92 && <CardLabel x={newR.lp[0]} y={newR.lp[1]} text={newR.label}/>}
      </g>}
    </svg>
  );
}

// ── app shell (static chrome) ────────────────────────────────────────────────
function MenuItem({ children }){ return <span style={{ fontSize:11.5, color:'#aab4c6', marginRight:17 }}>{children}</span>; }

function TBtn({ d, active, dim }){
  return (
    <div style={{ width:25, height:23, borderRadius:5, background: active?BLUE2:'#161d29',
      border:`1px solid ${active?BLUE2:LINE}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke={active?'#fff':(dim?'#5a6680':'#9aa6bb')} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    </div>
  );
}

function AppShell(){
  const ents = [['감사로그',8],['권한할당',5],['근태',12],['로그인시도',5],['부서',7],['부서일정',10],['부서장',7],['알람빅버전',1],['업무일지',10],['일정',10],['조직할당',7],['직원',12],['직위',4],['직위등급',3],['할일카드',11]];
  return (
    <div style={{ position:'absolute', inset:0, fontFamily:KFONT }}>
      {/* title bar */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:34, background:BARBG,
        borderBottom:`1px solid ${LINE}`, display:'flex', alignItems:'center', padding:'0 14px' }}>
        <span style={{ fontSize:13, fontWeight:800, color:INK, marginRight:24, letterSpacing:'-.01em' }}>
          <span style={{ color:BLUE }}>◆</span> AgenticERM</span>
        <MenuItem>파일</MenuItem><MenuItem>편집</MenuItem><MenuItem>보기</MenuItem>
        <MenuItem>도구</MenuItem><MenuItem>공유</MenuItem><MenuItem>설정</MenuItem><MenuItem>Help</MenuItem>
        <span style={{ flex:1 }} />
        <div style={{ display:'flex', alignItems:'center', gap:11, color:SUB, fontSize:12, fontFamily:MONO }}>
          <span>−</span><span style={{ color:'#aab4c6' }}>56%</span><span>+</span>
          <span style={{ marginLeft:8, color:'#56627a', letterSpacing:'3px' }}>⊟⊞▥</span>
          <span style={{ marginLeft:8, color:'#56627a', letterSpacing:'4px' }}>—☐✕</span>
        </div>
      </div>
      {/* toolbar */}
      <div style={{ position:'absolute', top:34, left:0, right:0, height:36, background:'#0e131b',
        borderBottom:`1px solid ${LINE}`, display:'flex', alignItems:'center', padding:'0 12px', gap:6 }}>
        <TBtn d={<><path d="M4 8h6a3 3 0 0 1 0 6H7"/><path d="M4 8l2.5-2.5M4 8l2.5 2.5"/></>} />
        <TBtn d={<><path d="M12 8H6a3 3 0 0 0 0 6h3"/><path d="M12 8l-2.5-2.5M12 8l-2.5 2.5"/></>} />
        <TBtn d={<><path d="M8 3.5v9M3.5 8h9"/></>} />
        <TBtn d={<><path d="M4 12l1-3 6-6 2 2-6 6-3 1z"/></>} />
        <TBtn d={<><path d="M3 3h7l3 3v7H3z"/><path d="M6 3v3h4M6 13v-3h4v3"/></>} />
        <TBtn d={<><path d="M3 6V3h3M13 6V3h-3M3 10v3h3M13 10v3h-3"/></>} />
        <div style={{ display:'flex', marginLeft:6, border:`1px solid ${LINE}`, borderRadius:6, overflow:'hidden' }}>
          <div style={{ padding:'3px 13px', fontSize:11.5, fontWeight:700, background:BLUE2, color:'#fff' }}>논리</div>
          <div style={{ padding:'3px 13px', fontSize:11.5, color:SUB, background:'#161d29' }}>물리</div>
        </div>
        <TBtn dim d={<><path d="M6.5 9.5l3-3"/><path d="M6 7L4.5 8.5a2.1 2.1 0 0 0 3 3L9 10M10 7l1.5-1.5a2.1 2.1 0 0 0-3-3L7 4"/></>} />
        <TBtn dim d={<><rect x="3" y="3" width="10" height="10" rx="1.5" strokeDasharray="2 1.6"/></>} />
        <TBtn dim d={<><circle cx="7" cy="7" r="3"/><path d="M11.5 11.5L9.2 9.2"/></>} />
        <TBtn dim d={<><path d="M3 5h2l1-1.5h4L11 5h2v7H3z"/><circle cx="8" cy="8.5" r="2"/></>} />
        <TBtn dim d={<><path d="M3 4h10M3 8h7M3 12h10"/></>} />
      </div>
      {/* sidebar */}
      <div style={{ position:'absolute', top:70, left:0, bottom:0, width:204, background:'#0e131b',
        borderRight:`1px solid ${LINE}`, padding:'10px 0', overflow:'hidden' }}>
        <div style={{ fontSize:10.5, color:SUB, fontWeight:700, padding:'0 14px 8px', letterSpacing:'.04em',
          display:'flex', justifyContent:'space-between' }}><span>탐색기</span><span style={{ color:'#4d586e' }}>◀</span></div>
        <div style={{ fontSize:10.5, color:SUB, fontWeight:700, padding:'2px 14px 5px', display:'flex', justifyContent:'space-between' }}>
          <span>다이어그램</span><span style={{ color:BLUE }}>＋</span></div>
        <div style={{ fontSize:11, color:'#aab4c6', padding:'4px 14px' }}>● 기본 ERD</div>
        <div style={{ fontSize:11, color:BLUE, padding:'4px 14px', background:'#5b9dff14', borderLeft:`2px solid ${BLUE}` }}>◆ 새로운 다이어그램</div>
        <div style={{ fontSize:10.5, color:SUB, fontWeight:700, padding:'11px 14px 5px', display:'flex', justifyContent:'space-between' }}>
          <span>엔티티</span><span style={{ color:'#4d586e' }}>15</span></div>
        {ents.map(([n,c],i)=>(
          <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'3.5px 14px 3.5px 18px', fontSize:10.5, color:'#aab4c6' }}>
            <span>{n}</span><span style={{ color:'#4d586e', fontFamily:MONO, fontSize:9 }}>{c}</span></div>
        ))}
      </div>
      {/* canvas bg */}
      <div style={{ position:'absolute', top:70, left:204, right:340, bottom:0, background:BG,
        backgroundImage:'radial-gradient(circle, rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize:'22px 22px' }} />
      {/* legend / minimap pills */}
      <div style={{ position:'absolute', left:218, bottom:34, display:'flex', flexDirection:'column', gap:8 }}>
        {['범례','미니맵'].map((l,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:18, background:'#141a24', border:`1px solid ${LINE}`,
            borderRadius:8, padding:'6px 8px 6px 13px', fontSize:11, color:'#c2ccdb', minWidth:96, boxShadow:'0 6px 16px rgba(0,0,0,.3)' }}>
            <span style={{ flex:1 }}>{l}</span>
            <span style={{ width:18, height:18, borderRadius:5, background:'#1b2433', border:`1px solid ${LINE}`, color:SUB,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>＋</span>
          </div>
        ))}
      </div>
      {/* status bar */}
      <div style={{ position:'absolute', bottom:0, left:204, right:340, height:24, background:BARBG,
        borderTop:`1px solid ${LINE}`, display:'flex', alignItems:'center', padding:'0 14px',
        fontSize:9.5, color:SUB, fontFamily:MONO }}>
        <span>엔티티 15 · 관계 10 · 메모 0 · 선택 15개</span>
        <span style={{ flex:1 }} />
        <span style={{ color:AMBER }}>● 변경됨</span>
        <span style={{ marginLeft:14, color:'#56627a' }}>2498, 971 · 56%</span>
      </div>
    </div>
  );
}

// ── chat panel ───────────────────────────────────────────────────────────────
function ChatPanel(){
  const t = useTime();
  const typed = '모든 컬럼을 표준용어사전으로 표준화해줘';
  const nTyped = Math.floor(clamp((t-4.7)/0.9,0,1)*typed.length);
  const showInputText = t>4.7 && t<5.7;
  return (
    <div style={{ position:'absolute', top:70, right:0, bottom:0, width:340, background:PANEL,
      borderLeft:`1px solid ${LINE}`, fontFamily:KFONT, display:'flex', flexDirection:'column' }}>
      <div style={{ height:38, display:'flex', alignItems:'center', gap:8, padding:'0 14px', borderBottom:`1px solid ${LINE}` }}>
        <span style={{ width:16, height:16, borderRadius:4, background:BLUE2, display:'inline-flex',
          alignItems:'center', justifyContent:'center', fontSize:9, color:'#fff' }}>✦</span>
        <span style={{ fontSize:12.5, fontWeight:700, color:INK }}>Agent v3</span>
        <span style={{ fontSize:9.5, color:SUB, fontFamily:MONO }}>V3-M1 · ReAct</span>
      </div>
      {/* messages */}
      <div style={{ flex:1, position:'relative', padding:'12px', overflow:'hidden' }}>

        <Sprite start={5.6} end={27}>{({localTime})=>(
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10,
            opacity:clamp(localTime/0.3,0,1), transform:`translateY(${(1-clamp(localTime/0.3,0,1))*8}px)` }}>
            <div style={{ maxWidth:230, background:BLUE2, color:'#fff', fontSize:11.5, lineHeight:1.5,
              padding:'8px 11px', borderRadius:'12px 12px 3px 12px' }}>모든 컬럼을 표준용어사전으로 표준화해줘</div>
          </div>
        )}</Sprite>

        <Sprite start={6.1} end={27}>{({localTime})=>{
          const o=clamp(localTime/0.3,0,1);
          return (
          <div style={{ opacity:o, transform:`translateY(${(1-o)*8}px)`, marginBottom:9,
            background:'#0e1622', border:`1px solid ${LINE}`, borderRadius:9, padding:'10px 11px' }}>
            <div style={{ fontSize:11, color:INK, fontWeight:700, marginBottom:8 }}>
              실행 계획 · <span style={{ color:BLUE }}>1단계</span></div>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(70,192,138,.1)',
              border:`1px solid ${GREEN}44`, borderRadius:7, padding:'7px 9px', marginBottom:8 }}>
              <span style={{ width:15, height:15, borderRadius:4, background:GREEN, color:'#06210f', fontSize:10,
                fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>✓</span>
              <span style={{ fontSize:10.5, color:'#d4e7dd', fontWeight:600 }}>표준용어사전 일괄 적용 (15건)</span>
            </div>
            <div style={{ fontSize:10, color:SUB, fontWeight:600, marginBottom:4 }}>▸ 처리 단계 (3단계)</div>
            {['표준용어사전 로드','컬럼 논리명 대조·매핑','15개 테이블 일괄 적용'].map((s,i)=>(
              <div key={i} style={{ fontSize:10, color:'#aab4c6', display:'flex', gap:6, padding:'2px 0 2px 8px' }}>
                <span style={{ color:'#56627a', fontFamily:MONO }}>{i+1}.</span>{s}</div>
            ))}
          </div>);
        }}</Sprite>

        <ToolChip start={6.9} name="get_statistics" result='{"entityCount":15,"columnsTotal":112}' />
        <ToolChip start={7.5} name="fetch_db_schema" result="DB 테이블 15개 · 컬럼 112개" />
        <ToolChip start={8.2} name="apply_standard_terms" result="112개 컬럼 매핑 적용 (15 테이블)" />

        <Sprite start={9.0} end={27}>{({localTime})=>{
          const o=clamp(localTime/0.3,0,1);
          return (
          <div style={{ opacity:o, transform:`translateY(${(1-o)*8}px)`, marginTop:2,
            fontSize:11, color:GREEN, fontWeight:600, display:'flex', gap:6, alignItems:'center' }}>
            <span>✓</span> 112개 컬럼 표준화 완료</div>);
        }}</Sprite>

      </div>
      {/* input */}
      <div style={{ padding:'10px 12px', borderTop:`1px solid ${LINE}` }}>
        <div style={{ height:34, borderRadius:8, background:'#0e1622', border:`1px solid ${t>4.7&&t<5.7?BLUE:LINE}`,
          display:'flex', alignItems:'center', padding:'0 11px', fontSize:11, color: showInputText?INK:'#5a6480' }}>
          {showInputText ? typed.slice(0,nTyped) : '메시지를 입력하세요...'}
          {showInputText && <span style={{ width:1.5, height:14, background:BLUE, marginLeft:1, opacity:(Math.floor(t*2)%2)?1:0.2 }} />}
          <span style={{ flex:1 }} />
          <span style={{ width:22, height:22, borderRadius:6, background:BLUE2, color:'#fff', fontSize:11,
            display:'flex', alignItems:'center', justifyContent:'center' }}>✦</span>
        </div>
      </div>
    </div>
  );
}

function ToolChip({ start, name, result }){
  return (
    <Sprite start={start} end={27}>{({localTime})=>{
      const o=clamp(localTime/0.3,0,1);
      const done = localTime>0.5;
      return (
        <div style={{ opacity:o, transform:`translateY(${(1-o)*8}px)`, marginBottom:7,
          background:'#101826', border:`1px solid ${LINE}`, borderRadius:8, padding:'7px 10px',
          display:'flex', alignItems:'center', gap:8, fontFamily:KFONT }}>
          <span style={{ fontSize:10, color: done?GREEN:AMBER }}>{done?'✓':'◷'}</span>
          <span style={{ fontSize:10, fontFamily:MONO, color:BLUE, fontWeight:600 }}>{name}</span>
          <span style={{ fontSize:9.5, color:SUB, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{result}</span>
        </div>
      );
    }}</Sprite>
  );
}

// ── standardization counter (canvas overlay) ─────────────────────────────────
function StdCounter(){
  const t = useTime();
  const n = Math.round(clamp((t-10.3)/4.4,0,1)*112);
  const vis = clamp((t-10.1)/0.4,0,1) * clamp((16.6-t)/0.4,0,1);
  if (vis<=0.01) return null;
  const bar = clamp((t-10.3)/4.4,0,1);
  return (
    <div style={{ position:'absolute', left:1006, bottom:62, transform:`translateY(${(1-clamp((t-10.1)/0.4,0,1))*10}px)`,
      opacity:vis, fontFamily:KFONT }}>
      <div style={{ display:'flex', flexDirection:'column', gap:7, background:'rgba(14,22,34,.94)',
        border:`1px solid ${BLUE}55`, borderRadius:11, padding:'11px 18px', boxShadow:'0 12px 30px rgba(0,0,0,.5)', minWidth:248 }}>
        <div style={{ display:'flex', alignItems:'baseline', gap:7, justifyContent:'center' }}>
          <span style={{ fontSize:26, fontWeight:800, color:BLUE, fontFamily:MONO, fontVariantNumeric:'tabular-nums' }}>{n}</span>
          <span style={{ fontSize:12.5, color:SUB }}>/ 112 컬럼 표준화</span>
        </div>
        <div style={{ height:4, borderRadius:2, background:'#222c3c', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${bar*100}%`, background:`linear-gradient(90deg,${BLUE2},${BLUE})`, borderRadius:2 }} />
        </div>
      </div>
    </div>
  );
}

// ── gauge (표준 준수율) ──────────────────────────────────────────────────────
function ComplianceGauge(){
  const C = 2*Math.PI*70;
  return (
    <Sprite start={17} end={21.6}>{({localTime,duration})=>{
      const o = clamp(localTime/0.4,0,1) * clamp((duration-localTime)/0.4,0,1);
      const p = clamp((localTime-0.3)/2.2,0,1);
      const val = (98.6*p);
      return (
        <div style={{ position:'absolute', left:415, top:225, width:450, height:300, opacity:o,
          transform:`scale(${0.96+0.04*clamp(localTime/0.4,0,1)})`, transformOrigin:'center',
          background:'rgba(16,22,34,.96)', border:`1px solid ${STROKE}`, borderRadius:16,
          boxShadow:'0 30px 70px rgba(0,0,0,.55)', fontFamily:KFONT, display:'flex', alignItems:'center', padding:'0 36px', gap:28 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r="70" fill="none" stroke="#222c3c" strokeWidth="16" />
            <circle cx="90" cy="90" r="70" fill="none" stroke={BLUE} strokeWidth="16" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C*(1-p*0.986)} transform="rotate(-90 90 90)" />
            <text x="90" y="86" textAnchor="middle" fontSize="38" fontWeight="800" fill={INK} fontFamily={MONO}>{val.toFixed(1)}</text>
            <text x="90" y="110" textAnchor="middle" fontSize="15" fill={SUB} fontFamily={KFONT}>%</text>
          </svg>
          <div>
            <div style={{ fontSize:13, color:BLUE, fontWeight:700, marginBottom:4 }}>표준 준수율</div>
            <div style={{ fontSize:21, fontWeight:800, color:INK, marginBottom:14 }}>기본 ERD 다이어그램</div>
            {[['표준 컬럼',110,GREEN],['검토 필요',2,AMBER]].map(([l,v,c],i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                <span style={{ width:9, height:9, borderRadius:2, background:c }} />
                <span style={{ fontSize:12.5, color:'#c2ccdb', width:78 }}>{l}</span>
                <span style={{ fontSize:13, fontWeight:700, color:INK, fontFamily:MONO }}>{v}개</span>
              </div>
            ))}
          </div>
        </div>
      );
    }}</Sprite>
  );
}

// ── Gap 분석 보고서 ──────────────────────────────────────────────────────────
function GapReport(){
  const rows = [
    ['employee.middle_name','DB에만 존재 · 다이어그램 누락','누락',RED],
    ['attendance.note','길이 불일치 varchar(255) ↔ (100)','불일치',AMBER],
    ['position.is_active','타입·논리명 일치','일치',GREEN],
    ['dept_head.dept_code','관계 매핑 추가됨','보강',BLUE],
    ['audit_log.after_json','신규 컬럼 동기화','신규',BLUE],
  ];
  return (
    <Sprite start={22} end={26.6}>{({localTime,duration})=>{
      const o = clamp(localTime/0.4,0,1) * clamp((duration-localTime)/0.4,0,1);
      return (
        <div style={{ position:'absolute', left:392, top:188, width:496, height:368, opacity:o,
          transform:`translateY(${(1-clamp(localTime/0.5,0,1))*14}px)`,
          background:'rgba(16,22,34,.97)', border:`1px solid ${STROKE}`, borderRadius:16,
          boxShadow:'0 30px 70px rgba(0,0,0,.55)', fontFamily:KFONT, overflow:'hidden' }}>
          <div style={{ padding:'16px 22px 12px', borderBottom:`1px solid ${LINE}`, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:10.5, color:BLUE, fontFamily:MONO, fontWeight:700, letterSpacing:'.06em' }}>GAP ANALYSIS</div>
              <div style={{ fontSize:19, fontWeight:800, color:INK, marginTop:3 }}>Gap 분석 보고서</div>
              <div style={{ fontSize:11, color:SUB, marginTop:2 }}>DB 스키마 ↔ 기본 ERD 다이어그램</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:24, fontWeight:800, color:INK, fontFamily:MONO }}>7<span style={{ fontSize:13, color:SUB }}> 차이</span></div>
              <div style={{ fontSize:11, color:GREEN }}>105 일치</div>
            </div>
          </div>
          <div style={{ padding:'8px 14px' }}>
            {rows.map((r,i)=>{
              const ri = clamp((localTime-0.4-i*0.18)/0.35,0,1);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 8px',
                  borderBottom:i<rows.length-1?`1px solid ${LINE}66`:'none',
                  opacity:ri, transform:`translateX(${(1-ri)*-12}px)` }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:r[3], flexShrink:0 }} />
                  <span style={{ fontSize:11, fontFamily:MONO, color:INK, width:172, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r[0]}</span>
                  <span style={{ fontSize:11, color:'#aab4c6', flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r[1]}</span>
                  <span style={{ fontSize:9.5, fontWeight:700, color:r[3], border:`1px solid ${r[3]}55`, borderRadius:4, padding:'2px 7px' }}>{r[2]}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }}</Sprite>
  );
}

// dim behind result overlays
function Dim({ start, end }){
  return (
    <Sprite start={start} end={end}>{({localTime,duration})=>{
      const o = clamp(localTime/0.4,0,1) * clamp((duration-localTime)/0.4,0,1);
      return <div style={{ position:'absolute', top:70, left:204, right:340, bottom:0, background:`rgba(7,9,14,${0.55*o})` }} />;
    }}</Sprite>
  );
}

// ── captions (screen space lower-third) ──────────────────────────────────────
function CaptionScrim(){
  return (
    <Sprite start={0.2} end={26.6}>{({localTime,duration})=>{
      const o = clamp(localTime/0.5,0,1) * clamp((duration-localTime)/0.5,0,1);
      return <div style={{ position:'absolute', left:0, right:0, bottom:0, height:230, opacity:o,
        background:'linear-gradient(to top, rgba(8,10,16,.96) 0%, rgba(8,10,16,.8) 38%, rgba(8,10,16,0) 100%)',
        pointerEvents:'none' }} />;
    }}</Sprite>
  );
}
const CAPS = [
  [0.4, 4.3,  '복잡한 스키마 작업', '테이블 15 · 컬럼 112 · 관계 10 — 모두 손으로 할 일'],
  [5.0, 9.4,  '말 한마디로 지시', 'ReAct 에이전트가 스스로 도구를 호출해 추론'],
  [10.2,16.4, '표준용어사전으로 일괄 표준화', '112개 컬럼 논리명을 한 번에 한글 표준어로'],
  [17.1,21.4, '표준 준수율을 즉시 측정', '다이어그램 품질을 정량 지표로 확인'],
  [22.1,26.4, 'DB와 비교해 Gap 분석서 자동 작성', '누락·불일치를 한눈에, 보고서까지 손쉽게'],
];
function Captions(){
  return (
    <>
      {CAPS.map((c,i)=>(
        <Sprite key={i} start={c[0]} end={c[1]}>{({localTime,duration})=>{
          const inO = clamp(localTime/0.45,0,1);
          const outO = clamp((duration-localTime)/0.4,0,1);
          const o = Math.min(inO,outO);
          return (
            <div style={{ position:'absolute', left:48, bottom:54, opacity:o,
              transform:`translateY(${(1-inO)*12}px)`, fontFamily:KFONT }}>
              <div style={{ width:34, height:3, background:BLUE, borderRadius:2, marginBottom:11 }} />
              <div style={{ fontSize:34, fontWeight:800, color:'#fff', letterSpacing:'-.02em', textShadow:'0 2px 20px rgba(0,0,0,.6)' }}>{c[2]}</div>
              <div style={{ fontSize:16, color:'#b9c3d4', marginTop:7, textShadow:'0 2px 14px rgba(0,0,0,.6)' }}>{c[3]}</div>
            </div>
          );
        }}</Sprite>
      ))}
    </>
  );
}

// ── end card ─────────────────────────────────────────────────────────────────
function EndCard(){
  return (
    <Sprite start={26.6} end={30}>{({localTime})=>{
      const o = clamp(localTime/0.5,0,1);
      const ks = 0.94 + 0.06*Easing.easeOutCubic(clamp(localTime/0.6,0,1));
      const tagO = clamp((localTime-0.5)/0.5,0,1);
      return (
        <div style={{ position:'absolute', inset:0, background:BG, opacity:o,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:KFONT }}>
          <div style={{ transform:`scale(${ks})` }}>
            <svg width="118" height="118" viewBox="0 0 200 200" fill="none">
              <defs><linearGradient id="es" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6aa6ff"/><stop offset="1" stopColor="#2f63e0"/></linearGradient></defs>
              <line x1="100" y1="84" x2="54" y2="132" stroke="#3a4658" strokeWidth="3" strokeLinecap="round"/>
              <line x1="100" y1="84" x2="146" y2="132" stroke="#3a4658" strokeWidth="3" strokeLinecap="round"/>
              <line x1="100" y1="84" x2="100" y2="152" stroke="#3a4658" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="54" cy="132" r="11" fill="#161d29" stroke={BLUE} strokeWidth="2.5"/>
              <circle cx="146" cy="132" r="11" fill="#161d29" stroke={BLUE} strokeWidth="2.5"/>
              <circle cx="100" cy="152" r="11" fill="#161d29" stroke={BLUE} strokeWidth="2.5"/>
              <circle cx="100" cy="84" r="29" fill="url(#es)"/>
              <polygon points="100,65 107,77 119,84 107,91 100,103 93,91 81,84 93,77" fill="#fff"/>
            </svg>
          </div>
          <div style={{ fontSize:46, fontWeight:800, color:'#fff', letterSpacing:'-.02em', marginTop:18 }}>AgenticERM</div>
          <div style={{ fontSize:19, color:BLUE, fontWeight:600, marginTop:10, opacity:tagO }}>대화로 설계하는 데이터 모델</div>
          <div style={{ fontSize:14, color:SUB, marginTop:8, opacity:tagO }}>복잡한 스키마 작업을, 에이전트가 대신합니다</div>
        </div>
      );
    }}</Sprite>
  );
}

// ── root ─────────────────────────────────────────────────────────────────────
function PromoVideo(){
  return (
    <Stage width={1280} height={720} duration={30} background={BG} persistKey="agenticerm-promo">
      <Camera>
        <AppShell />
        <Relations />
        {Object.keys(T).map(k => <TableCard key={k} d={T[k]} />)}
        <ChatPanel />
        <Dim start={17} end={21.6} />
        <ComplianceGauge />
        <Dim start={22} end={26.6} />
        <GapReport />
      </Camera>
      <CaptionScrim />
      <StdCounter />
      <Captions />
      <EndCard />
    </Stage>
  );
}

window.PromoVideo = PromoVideo;
