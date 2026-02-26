import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

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

/**
 * AgentChat — CEN-PE Agent chat component.
 */
export default function AgentChat(props) {
  return (
    <ErrorBoundary componentName="CEN-PE Agent">
      <AgentChatInner {...props} />
    </ErrorBoundary>
  );
}

function AgentChatInner({
  messages = [],
  isThinking = false,
  inputText = "",
  suggestions = [],
  lokiLogs = [],
  healthData = [],
  grafanaConnected = true,
  lastRefresh = "",
  onSendMessage,
  onSetInput,
  onUseSuggestion,
  onClearChat,
  onRefreshGrafana,
  onNewSession,
  sessionId = "",
  logStreamActive = false,
}) {
  const [panel, setPanel] = useState("logs");
  const [logFilt, setLogFilt] = useState("all");
  const [expandedLog, setExpandedLog] = useState(null);
  const [panelW, setPanelW] = useState(340);
  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, w: 0 });

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, isThinking]);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Drag resize for side panel
  const onDragStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { x: e.clientX, w: panelW };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [panelW]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = dragStart.current.x - e.clientX;
      setPanelW(Math.max(200, Math.min(700, dragStart.current.w + delta)));
    };
    const onUp = () => {
      if (dragging.current) {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const filtLogs = useMemo(() =>
    logFilt === "all" ? lokiLogs : lokiLogs.filter(l => l.lv === logFilt),
    [logFilt, lokiLogs]
  );

  const handleSend = () => {
    if (isThinking) return;
    onSendMessage?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        button:hover { filter:brightness(1.2); }
      `}</style>

      {/* Header */}
      <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:C.sf}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:24,height:24,borderRadius:6,background:`linear-gradient(135deg,${C.agent},#7c3aed)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>⚡</div>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>CEN-PE Agent</div>
            <div style={{fontSize:7.5,color:C.dim}}>Loki + Prometheus + ArgoCD + RunStore</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {sessionId && <span style={{fontSize:7.5,color:C.mut,fontFamily:F}}>{sessionId}</span>}
          <button onClick={() => onNewSession?.()} style={{padding:"4px 10px",fontSize:8.5,fontFamily:F,fontWeight:600,cursor:"pointer",background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",borderRadius:4,color:C.agent,transition:"all .15s"}}>+ New Session</button>
          <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,fontSize:8.5,color:grafanaConnected?C.ok:C.err,background:grafanaConnected?"rgba(34,197,94,0.05)":"rgba(239,68,68,0.05)",border:`1px solid ${grafanaConnected?"rgba(34,197,94,0.1)":"rgba(239,68,68,0.1)"}`}}>
            <Dot color={grafanaConnected?C.ok:C.err}/> {grafanaConnected?"Connected":"Disconnected"}
          </div>
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Chat */}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:200}}>
          <div ref={chatRef} style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
            {messages.length === 0 && (
              <div style={{textAlign:"center",padding:"30px 16px"}}>
                <div style={{fontSize:24,opacity:.06,marginBottom:10}}>⚡</div>
                <div style={{fontSize:10,color:C.dim,lineHeight:1.7,maxWidth:320,margin:"0 auto"}}>Ask about pipeline health, service status, Grafana logs, or deployment issues.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,justifyContent:"center",marginTop:14}}>
                  {suggestions.map(s => <button key={s} onClick={() => onUseSuggestion?.(s)} style={{padding:"4px 9px",fontSize:9,fontFamily:F,background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",borderRadius:8,color:C.agent,cursor:"pointer"}}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{marginBottom:10,display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{fontSize:7,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:2}}>
                  {m.role==="user"?"You":"CEN-PE Agent"} <span style={{color:"#161616",marginLeft:3}}>{m.timestamp}</span>
                </div>
                <div style={{maxWidth:"88%",padding:"8px 11px",borderRadius:m.role==="user"?"8px 8px 2px 8px":"8px 8px 8px 2px",background:m.role==="user"?`${C.agent}10`:"rgba(255,255,255,0.018)",border:`1px solid ${m.role==="user"?"rgba(167,139,250,0.18)":C.bdr}`,fontSize:10,lineHeight:1.7,color:"#bbb",whiteSpace:"pre-wrap"}}>{m.text}</div>
              </div>
            ))}
            {isThinking && <div style={{display:"flex",alignItems:"center",padding:"5px 0"}}>
              <Spinner size={14} color={C.agent}/>
            </div>}
          </div>
          {/* Input */}
          <div style={{padding:"8px 12px",borderTop:`1px solid ${C.bdr}`,background:"rgba(3,3,6,0.8)"}}>
            <div style={{display:"flex",gap:5}}>
              <input
                ref={inputRef}
                value={inputText}
                onChange={e => onSetInput?.(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about health, logs, pipelines..."
                style={{flex:1,padding:"7px 10px",fontSize:10.5,fontFamily:F,background:"rgba(255,255,255,0.025)",color:"#ccc",border:`1px solid ${C.bdr}`,borderRadius:4,outline:"none"}}
              />
              <button onClick={handleSend} disabled={isThinking} style={{padding:"7px 13px",fontSize:10,fontFamily:F,fontWeight:600,background:`linear-gradient(135deg,${C.agent},#7c3aed)`,border:"none",borderRadius:4,color:"#fff",cursor:"pointer",opacity:isThinking?.4:1}}>Send</button>
            </div>
          </div>
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={onDragStart}
          style={{width:6,cursor:"col-resize",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:"transparent",transition:"background .15s"}}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
          onMouseLeave={e => { if (!dragging.current) e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{width:2,height:36,borderRadius:1,background:"rgba(255,255,255,0.08)"}}/>
        </div>

        {/* Side panel */}
        <div style={{width:panelW,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{display:"flex",borderBottom:`1px solid ${C.bdr}`}}>
            {[{id:"logs",l:"Loki Logs",c:"#ff6600"},{id:"health",l:"Health",c:C.ok}].map(t =>
              <button key={t.id} onClick={() => setPanel(t.id)} style={{flex:1,padding:"7px 0",fontSize:9,fontFamily:F,fontWeight:panel===t.id?600:400,color:panel===t.id?t.c:C.dim,background:"transparent",border:"none",borderBottom:`2px solid ${panel===t.id?t.c:"transparent"}`,cursor:"pointer"}}>{t.l}</button>
            )}
          </div>
          {panel === "logs" && (
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"5px 8px",display:"flex",gap:3,borderBottom:`1px solid ${C.bdr}`,alignItems:"center"}}>
                {["all","error","warn","info"].map(f =>
                  <button key={f} onClick={() => setLogFilt(f)} style={{padding:"1px 6px",fontSize:8,fontFamily:F,textTransform:"uppercase",cursor:"pointer",background:logFilt===f?(f==="error"?"rgba(239,68,68,0.08)":f==="warn"?"rgba(234,179,8,0.08)":"rgba(255,255,255,0.04)"):"transparent",border:`1px solid ${logFilt===f?(f==="error"?"rgba(239,68,68,0.12)":f==="warn"?"rgba(234,179,8,0.12)":"rgba(255,255,255,0.1)"):C.bdr}`,borderRadius:3,color:logFilt===f?(f==="error"?C.err:f==="warn"?C.warn:"#ccc"):C.dim}}>{f}</button>
                )}
                {logStreamActive && <span style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:3,fontSize:7,fontWeight:700,color:C.ok,letterSpacing:".5px"}}><Dot color={C.ok}/> LIVE</span>}
                <span style={{marginLeft:"auto",fontSize:7.5,color:C.mut}}>{filtLogs.length}</span>
              </div>
              <div style={{flex:1,overflowY:"auto"}}>
                {filtLogs.map((l, i) => {
                  const isExpanded = expandedLog === i;
                  return <div key={i} onClick={() => setExpandedLog(isExpanded ? null : i)} style={{padding:"4px 8px",borderBottom:`1px solid ${C.bdr}`,cursor:"pointer",background:isExpanded?"rgba(255,255,255,0.02)":"transparent",transition:"background .1s"}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:4,fontSize:9}}>
                      <span style={{color:C.mut,minWidth:40,flexShrink:0}}>{l.ts}</span>
                      <span style={{fontSize:7,fontWeight:700,textTransform:"uppercase",padding:"1px 3px",borderRadius:2,minWidth:26,textAlign:"center",color:l.lv==="error"?C.err:l.lv==="warn"?C.warn:C.dim,background:l.lv==="error"?"rgba(239,68,68,0.06)":l.lv==="warn"?"rgba(234,179,8,0.06)":"rgba(255,255,255,0.02)"}}>{l.lv}</span>
                      <span style={{color:C.blu,minWidth:80,flexShrink:0,fontSize:8.5}}>{l.svc}</span>
                      {!isExpanded && <span style={{color:C.dim,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.msg}</span>}
                      {l.n > 1 && <span style={{fontSize:7,padding:"1px 3px",borderRadius:4,background:"rgba(255,255,255,0.018)",color:C.dim,border:`1px solid ${C.bdr}`,flexShrink:0}}>{l.n}×</span>}
                    </div>
                    {isExpanded && <div style={{marginTop:4,padding:"6px 8px",background:"rgba(0,0,0,0.3)",borderRadius:4,fontSize:9,lineHeight:1.6,color:"#aaa",whiteSpace:"pre-wrap",wordBreak:"break-all",fontFamily:F,maxHeight:200,overflowY:"auto"}}>{l.msg}</div>}
                  </div>;
                })}
              </div>
              <div style={{padding:"4px 8px",borderTop:`1px solid ${C.bdr}`,fontSize:8,color:C.mut,display:"flex",justifyContent:"space-between"}}>
                <span>LogQL: {`{namespace="sportybet-ug"}`}</span>
                {lastRefresh && <span style={{color:logStreamActive?"#555":"#333"}}>↻ {lastRefresh}</span>}
              </div>
            </div>
          )}
          {panel === "health" && (
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{flex:1,overflowY:"auto"}}>
                {healthData.map((h, i) => (
                  <div key={i} style={{padding:"6px 8px",borderBottom:`1px solid ${C.bdr}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontSize:10,fontWeight:600,color:"#ccc"}}>{h.svc}</span>
                      <Badge color={h.st==="critical"?C.err:h.st==="degraded"?C.warn:C.ok}>{h.st}</Badge>
                    </div>
                    <div style={{display:"flex",gap:7,fontSize:8,color:C.dim}}>
                      <span>CPU <span style={{color:parseInt(h.cpu)>80?C.err:parseInt(h.cpu)>60?C.warn:C.dim}}>{h.cpu}</span></span>
                      <span>Mem <span style={{color:parseInt(h.mem)>80?C.err:parseInt(h.mem)>60?C.warn:C.dim}}>{h.mem}</span></span>
                      <span>Pods {h.pods}</span>
                      <span>↻{h.rst}</span>
                      <span>p95 {h.p95}</span>
                    </div>
                    <div style={{display:"flex",gap:7,fontSize:8,color:C.dim}}>
                      <span style={{fontWeight:600,color:"#555"}}>Pod</span>
                      <span>24h <span style={{color:uptimeColor(h.up24)}}>{h.up24}</span></span>
                      <span>7d <span style={{color:uptimeColor(h.up7d)}}>{h.up7d}</span></span>
                      <span>30d <span style={{color:uptimeColor(h.up30d)}}>{h.up30d}</span></span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{padding:"4px 8px",borderTop:`1px solid ${C.bdr}`,fontSize:8,color:C.mut}}>PromQL: up{`{namespace="sportybet-ug"}`}</div>
            </div>
          )}
        </div>
      </div>
      {/* Footer */}
      <div style={{padding:"4px 18px",borderTop:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:7,fontSize:8,color:C.mut,background:"rgba(3,3,6,0.9)"}}>
        <span style={{color:C.agent,fontWeight:600}}>CEN-PE v1.0</span>
        <span>Tools: LokiQuery · PrometheusHealth · ArgocdSync · RunStore · YamlRepoGit · Rollback</span>
      </div>
    </div>
  );
}
