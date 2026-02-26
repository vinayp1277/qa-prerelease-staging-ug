import React, { useState, useMemo, useCallback } from "react";

const F = "'JetBrains Mono','Fira Code',monospace";
const C = { bg:"#08080c", sf:"#0c0c14", ok:"#22c55e", err:"#ef4444", warn:"#eab308", blu:"#60a5fa", agent:"#a78bfa", bdr:"rgba(255,255,255,0.05)", dim:"#333", mut:"#1e1e1e" };

/* ── ErrorBoundary: terminal-themed crash page ── */
const EB_CSS = `@keyframes eb-glitch{0%,100%{transform:translateX(0);opacity:1}10%{transform:translateX(-2px)}20%{transform:translateX(2px);opacity:.8}30%{transform:translateX(0);opacity:1}92%{transform:translateX(0);opacity:1}94%{transform:translateX(3px);opacity:.7}96%{transform:translateX(-3px);opacity:.9}98%{transform:translateX(1px);opacity:1}}@keyframes eb-scan{0%{top:-10%}100%{top:110%}}@keyframes eb-blink{0%,100%{opacity:1}50%{opacity:0}}@keyframes eb-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`;
const EB_SKULL = ["     ░░▒▒▓▓██▓▓▒▒░░","   ░▒  ┌─────────┐  ▒░","   ▒▓  │  ×    ×  │  ▓▒","   ▓█  │    ───    │  █▓","   ▒▓  └─────────┘  ▓▒","     ░░▒▒▓▓██▓▓▒▒░░"];
class ErrorBoundary extends React.Component {
  constructor(p){super(p);this.state={hasError:false,error:null,showDetails:false};}
  static getDerivedStateFromError(e){return{hasError:true,error:e};}
  componentDidCatch(e,i){console.error(`[ErrorBoundary:${this.props.componentName||"?"}]`,e,i);}
  render(){
    if(!this.state.hasError)return this.props.children;
    const nm=this.props.componentName||"Component",msg=this.state.error?.message||"Unknown",stk=this.state.error?.stack||"";
    const btn={fontFamily:F,fontSize:11,fontWeight:700,borderRadius:4,padding:"8px 20px",cursor:"pointer",letterSpacing:"1px",transition:"all .15s"};
    return(<div style={{position:"relative",width:"100%",height:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:F,color:"#ccc",overflow:"hidden"}}>
      <style>{EB_CSS}</style>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:2}}><div style={{position:"absolute",left:0,width:"100%",height:"2px",background:`linear-gradient(90deg,transparent,${C.err}15,transparent)`,animation:"eb-scan 4s linear infinite"}}/></div>
      <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.15) 2px,rgba(0,0,0,.15) 4px)",pointerEvents:"none",opacity:.04,zIndex:3}}/>
      <div style={{position:"relative",zIndex:4,textAlign:"center",maxWidth:520,padding:"40px 32px",animation:"eb-in .6s ease-out"}}>
        <div style={{border:`1px solid ${C.err}30`,borderRadius:4,padding:"32px 28px",background:`${C.sf}cc`,boxShadow:`0 0 40px ${C.err}08,inset 0 0 60px ${C.bg}80`}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:"2px",textTransform:"uppercase",color:C.err,marginBottom:20,opacity:.8}}>{"▄▄▄▄▄ system fault ▄▄▄▄▄"}</div>
          <div style={{animation:"eb-glitch 4s ease-in-out infinite",marginBottom:24}}>{EB_SKULL.map((l,i)=><div key={i} style={{fontSize:11,lineHeight:"16px",color:i===2||i===3?C.err:`${C.err}88`,letterSpacing:"1px",whiteSpace:"pre"}}>{l}</div>)}</div>
          <div style={{fontSize:12,fontWeight:700,letterSpacing:"3px",color:C.err,marginBottom:8}}>ERR::RENDER_FAULT</div>
          <div style={{display:"inline-block",fontSize:8,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"3px 10px",borderRadius:3,color:C.warn,background:`${C.warn}14`,border:`1px solid ${C.warn}22`,marginBottom:16}}>{nm}</div>
          <div style={{fontSize:11,color:"#888",lineHeight:"20px",marginBottom:24}}><div>Something went sideways.</div><div>{"Our circuits are recalibrating"}<span style={{display:"inline-block",width:7,height:13,background:C.ok,marginLeft:4,verticalAlign:"text-bottom",animation:"eb-blink 1s step-end infinite"}}/></div></div>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:20}}>
            <button onClick={()=>this.setState({hasError:false,error:null,showDetails:false})} style={{...btn,color:C.ok,background:`${C.ok}12`,border:`1px solid ${C.ok}30`}}>{">"} retry</button>
            <button onClick={()=>{window.location.href="/";}} style={{...btn,color:C.blu,background:`${C.blu}12`,border:`1px solid ${C.blu}30`}}>{">"} cd /</button>
          </div>
          <div>
            <button onClick={()=>this.setState(s=>({showDetails:!s.showDetails}))} style={{fontFamily:F,fontSize:9,color:"#555",background:"transparent",border:"none",cursor:"pointer",letterSpacing:"1px",textTransform:"uppercase",padding:"4px 8px"}}>{this.state.showDetails?"▼":"▶"} error details</button>
            {this.state.showDetails&&<div style={{marginTop:8,padding:12,background:C.bg,border:`1px solid ${C.dim}`,borderRadius:4,textAlign:"left",maxHeight:160,overflowY:"auto"}}><div style={{fontSize:9,color:C.err,marginBottom:6,wordBreak:"break-all"}}>{msg}</div><pre style={{fontSize:8,color:"#444",lineHeight:"14px",whiteSpace:"pre-wrap",wordBreak:"break-all",margin:0}}>{stk}</pre></div>}
          </div>
        </div>
      </div>
    </div>);
  }
}

const Badge = ({children,color}) => <span style={{fontSize:7.5,fontWeight:700,letterSpacing:".7px",textTransform:"uppercase",padding:"2px 6px",borderRadius:3,color,background:`${color}14`,border:`1px solid ${color}22`,whiteSpace:"nowrap"}}>{children}</span>;
const Dot = ({color}) => <div style={{width:5,height:5,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}80`,animation:"pulse 2s ease-in-out infinite",flexShrink:0}}/>;
const Spinner = ({size=16,color=C.warn}) => <svg width={size} height={size} viewBox="0 0 18 18" style={{animation:"spin 1s linear infinite"}}><circle cx="9" cy="9" r="7" fill="none" stroke={`${color}33`} strokeWidth="2"/><circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="2" strokeDasharray="20 24" strokeLinecap="round"/></svg>;

const uptimeColor = (v) => {
  if (!v || v === "-") return "#333";
  const n = parseFloat(v);
  if (n >= 99.9) return "#22c55e";
  if (n >= 99)   return "#60a5fa";
  if (n >= 95)   return "#eab308";
  return "#ef4444";
};

const HC = {
  Healthy:     { c:C.ok,    ic:"●", h:"💚" },
  Degraded:    { c:C.err,   ic:"▼", h:"💔" },
  Progressing: { c:C.warn,  ic:"◐", h:"loader" },
  Suspended:   { c:"#6b7280", ic:"⏸", h:"🩶" },
  Missing:     { c:"#f97316", ic:"✕", h:"💔" },
  Unknown:     { c:"#6b7280", ic:"?", h:"🩶" },
};

/**
 * HealthGrid — ArgoCD Health Stream component.
 *
 * Props from Python state:
 * - apps: list[dict] — all apps with health/sync/tag/market
 * - connected: bool — gRPC stream active
 * - last_event: str — latest event description
 * - events_count: int — total events since stream start
 *
 * Events to Python:
 * - on_hard_sync(market, name)
 */
export default function HealthGrid(props) {
  return (
    <ErrorBoundary componentName="Health Board">
      <HealthGridInner {...props} />
    </ErrorBoundary>
  );
}

function HealthGridInner({
  apps = [],
  connected = false,
  lastEvent = "Connecting...",
  eventsCount = 0,
  uptimeMap = {},
  onHardSync,
}) {
  const [filter, setFilter] = useState("All");
  const [mkt, setMkt] = useState("All");
  const [q, setQ] = useState("");
  const [syncingKeys, setSyncingKeys] = useState({});

  const handleHardSync = useCallback((market, name) => {
    const key = `${market}-${name}`;
    setSyncingKeys(p => ({...p, [key]: true}));
    onHardSync?.(market, name);
    // Auto-clear syncing state after 3.5s (sync completes on backend)
    setTimeout(() => {
      setSyncingKeys(p => { const nx = {...p}; delete nx[key]; return nx; });
    }, 3500);
  }, [onHardSync]);

  const EXCLUDED_APPS = useMemo(() => new Set(["shared-resources", "zookeeper"]), []);

  // Filter out excluded infra apps before computing stats/markets
  const visibleApps = useMemo(() => apps.filter(a => {
    const n = a.name.toLowerCase();
    for (const ex of EXCLUDED_APPS) { if (n.includes(ex)) return false; }
    return true;
  }), [apps, EXCLUDED_APPS]);

  const stats = useMemo(() => {
    const s = { total: visibleApps.length, oos: 0, hpa: 0 };
    for (const a of visibleApps) {
      s[a.health] = (s[a.health] || 0) + 1;
      if (a.sync === "OutOfSync") s.oos++;
      if (a.hpa) s.hpa++;
    }
    return s;
  }, [visibleApps]);

  const markets = useMemo(() => [...new Set(visibleApps.map(a => a.market))].sort(), [visibleApps]);
  const filtered = useMemo(() => visibleApps.filter(a => {
    if (filter !== "All" && a.health !== filter) return false;
    if (mkt !== "All" && a.market !== mkt) return false;
    if (q && !a.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [visibleApps, filter, mkt, q]);

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes heartRipple { 0% { transform:scale(1); opacity:1; } 50% { transform:scale(1.3); opacity:0.6; } 100% { transform:scale(1); opacity:1; } }
        button:hover { filter:brightness(1.2); }
      `}</style>

      {/* Header */}
      <div style={{padding:"14px 20px 10px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:C.sf}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:15,opacity:.3}}>⎎</span>
            <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>STG-UG Services Health</span>
            <Badge color={C.ok}>gRPC Watch</Badge>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:4,fontSize:9,color:connected?C.ok:C.err,background:connected?"rgba(34,197,94,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${connected?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)"}`}}>
            <Dot color={connected?C.ok:C.err}/> {connected?"Stream Active":"Disconnected"}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {[{l:"Total",v:stats.total,c:"#8b8fa3"},{l:"Healthy",v:stats.Healthy||0,c:C.ok},{l:"Degraded",v:stats.Degraded||0,c:C.err},{l:"Progress",v:stats.Progressing||0,c:C.warn},{l:"OutOfSync",v:stats.oos,c:"#f97316"},{l:"HPA",v:stats.hpa||0,c:C.blu}].map(s =>
            <div key={s.l} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:`${s.c}0d`,border:`1px solid ${s.c}18`,minWidth:70}}>
              <span style={{fontSize:17,fontWeight:800,color:s.c,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{s.v}</span>
              <span style={{fontSize:8,fontWeight:600,color:"#666",textTransform:"uppercase",letterSpacing:".5px"}}>{s.l}</span>
            </div>
          )}
          <div style={{flex:1}}/>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:7.5,color:C.dim,letterSpacing:"1px",textTransform:"uppercase"}}>Events</div>
            <div style={{fontSize:14,fontWeight:800,color:C.warn,fontVariantNumeric:"tabular-nums"}}>{eventsCount}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"flex",gap:4,padding:"7px 20px",borderBottom:`1px solid ${C.bdr}`,alignItems:"center",flexWrap:"wrap"}}>
        {["All","Healthy","Degraded","Progressing","Suspended"].map(f =>
          <button key={f} onClick={() => setFilter(f)} style={{padding:"2px 9px",borderRadius:4,fontSize:9.5,fontWeight:500,cursor:"pointer",fontFamily:F,border:`1px solid ${filter===f?"rgba(255,255,255,0.1)":C.bdr}`,background:filter===f?"rgba(255,255,255,0.06)":"transparent",color:filter===f?"#fff":"#555"}}>{f==="All"?`All (${stats.total})`:`${f} (${stats[f]||0})`}</button>
        )}
        <div style={{width:1,height:14,background:C.bdr,margin:"0 2px"}}/>
        <span style={{padding:"2px 9px",borderRadius:4,fontSize:9.5,fontWeight:600,fontFamily:F,background:"rgba(34,197,94,0.06)",color:C.ok,border:"1px solid rgba(34,197,94,0.1)"}}>staging-ug</span>
        <div style={{flex:1}}/>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." style={{padding:"3px 9px",borderRadius:4,fontSize:10,fontFamily:F,background:"rgba(255,255,255,0.03)",color:"#ccc",border:`1px solid ${C.bdr}`,outline:"none",width:140}}/>
        <span style={{fontSize:8.5,color:C.mut,fontVariantNumeric:"tabular-nums"}}>{filtered.length}</span>
      </div>

      {/* Grid */}
      <div style={{flex:1,overflowY:"auto",padding:"8px 20px 50px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:4}}>
          {filtered.map(a => {
            const h = HC[a.health] || HC.Unknown;
            const key = `${a.market}-${a.name}`;
            const isSyncing = !!syncingKeys[key];
            return <div key={key} style={{position:"relative",padding:"7px 9px",borderRadius:6,background:"rgba(255,255,255,0.018)",border:`1px solid ${C.bdr}`,overflow:"hidden"}}>
              <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:h.c,borderRadius:"6px 0 0 6px"}}/>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3,paddingLeft:6}}>
                <span style={{fontSize:10.5,fontWeight:600,color:"#d4d4d8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:5,maxWidth:125}}>{a.name}</span>
                {a.is_init && <span style={{fontSize:6.5,fontWeight:700,letterSpacing:".5px",color:C.agent,background:"rgba(167,139,250,0.08)",padding:"1px 5px",borderRadius:3,marginRight:3,border:"1px solid rgba(167,139,250,0.15)"}}>INIT</span>}
                <span style={{fontSize:7,fontWeight:600,letterSpacing:".5px",color:"#555",background:"rgba(255,255,255,0.03)",padding:"1px 4px",borderRadius:3,marginRight:5}}>staging-ug</span>
                <span style={{flexShrink:0,display:"inline-flex",alignItems:"center"}}>
                  {h.h==="loader"?<Spinner size={14}/>:<span style={{fontSize:14,lineHeight:1,display:"inline-block",...(a.health==="Healthy"?{animation:"heartRipple 2.5s ease-in-out infinite"}:{})}}>{h.h}</span>}
                </span>
              </div>
              <div style={{display:"flex",gap:3,paddingLeft:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:600,color:h.c,background:`${h.c}14`,padding:"1px 6px",borderRadius:3}}><span style={{fontSize:5}}>{h.ic}</span> {a.health}</span>
                <span style={{fontSize:9,fontWeight:500,color:a.sync==="Synced"?C.ok:"#f97316",background:`${a.sync==="Synced"?C.ok:"#f97316"}14`,padding:"1px 6px",borderRadius:3}}>{a.sync}</span>
                {a.op && <span style={{fontSize:7.5,color:C.warn}}>⟳ {a.op}</span>}
              </div>
              {a.hpa && (
                <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:6,marginTop:2}}>
                  <span style={{fontSize:7,fontWeight:700,letterSpacing:".7px",textTransform:"uppercase",
                    padding:"1px 5px",borderRadius:3,
                    color: a.hpa.cur !== a.hpa.des ? C.warn : C.blu,
                    background: a.hpa.cur !== a.hpa.des ? "rgba(234,179,8,0.08)" : "rgba(96,165,250,0.06)",
                    border: `1px solid ${a.hpa.cur !== a.hpa.des ? "rgba(234,179,8,0.15)" : "rgba(96,165,250,0.12)"}`,
                  }}>HPA</span>
                  <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.04)",position:"relative",overflow:"hidden",maxWidth:60}}>
                    <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:2,transition:"width .6s ease",
                      width: `${Math.min(100, (a.hpa.cur / Math.max(a.hpa.max, 1)) * 100)}%`,
                      background: a.hpa.cur >= a.hpa.max ? C.warn
                        : a.hpa.cur > a.hpa.max * 0.7 ? "linear-gradient(90deg,#22c55e,#eab308)"
                        : C.ok,
                    }}/>
                  </div>
                  <span style={{fontSize:7.5,fontWeight:600,color:"#999",fontVariantNumeric:"tabular-nums"}}>
                    {a.hpa.cur}<span style={{color:"#555"}}>/</span>{a.hpa.max}
                  </span>
                  {a.hpa.cur !== a.hpa.des && (
                    <span style={{fontSize:7,color:C.warn,display:"inline-flex",alignItems:"center",gap:2}}>
                      ⟳ →{a.hpa.des}
                    </span>
                  )}
                </div>
              )}
              {(() => { const ut = uptimeMap[a.name]; return ut ? (
                <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:6,marginTop:2}}>
                  <span style={{fontSize:7,fontWeight:700,letterSpacing:".7px",color:"#555"}}>POD</span>
                  <span style={{fontSize:7.5,color:uptimeColor(ut.up24)}}>{ut.up24}</span>
                  <span style={{fontSize:6.5,color:"#333"}}>·</span>
                  <span style={{fontSize:7.5,color:uptimeColor(ut.up7d)}}>{ut.up7d}</span>
                  <span style={{fontSize:6.5,color:"#333"}}>·</span>
                  <span style={{fontSize:7.5,color:uptimeColor(ut.up30d)}}>{ut.up30d}</span>
                  <span style={{fontSize:6,color:"#2a2a2a",marginLeft:2}}>24h·7d·30d</span>
                </div>
              ) : null; })()}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingLeft:6,marginTop:3}}>
                <span style={{fontSize:7.5,color:C.blu,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>{a.tag}{a.rev && <span style={{fontSize:7,color:"#888",marginLeft:3}}>@{a.rev}</span>}</span>
                <button onClick={() => !isSyncing && handleHardSync(a.market, a.name)} disabled={isSyncing} style={{
                  padding:"1px 6px",fontSize:7.5,fontWeight:600,fontFamily:F,cursor:isSyncing?"not-allowed":"pointer",
                  background:isSyncing?"rgba(234,179,8,0.06)":"rgba(96,165,250,0.06)",
                  border:`1px solid ${isSyncing?"rgba(234,179,8,0.12)":"rgba(96,165,250,0.12)"}`,
                  borderRadius:3,color:isSyncing?C.warn:C.blu,transition:"all .15s",opacity:isSyncing?0.7:1,
                }}>{isSyncing?"⟳ Syncing...":"⟳ Hard Sync"}</button>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{background:"rgba(5,5,10,0.94)",borderTop:`1px solid ${C.bdr}`,padding:"5px 20px",display:"flex",alignItems:"center",gap:8,fontSize:8.5}}>
        <span style={{fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",color:C.dim}}>Stream</span>
        <span style={{color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lastEvent}</span>
        <div style={{flex:1}}/>
        <span style={{color:C.mut,fontVariantNumeric:"tabular-nums"}}>{eventsCount} events</span>
      </div>
    </div>
  );
}
