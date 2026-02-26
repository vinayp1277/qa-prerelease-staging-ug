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

const STEPS = [
  { id:"merge", l:"Git Merge", d:"GH GraphQL · master → target branch", ic:"⑂" },
  { id:"build", l:"Image Check", d:"ECR check → Jenkins build if missing", ic:"⚙" },
  { id:"gitops", l:"GitOps Update", d:"Update image tags", ic:"⟲" },
  { id:"deploy", l:"Deploy Sync Status & Notify", d:"ArgoCD gRPC-Web watch + Slack alert", ic:"⎎" },
  { id:"jenkins", l:"Trigger WAP+RESTAPI QA Jobs", d:"Smoke + integration", ic:"⚡" },
];

const TEAMS = ["tw","eu","eu2","am1","dependabot"];
const ENVS = ["staging"];
// No hardcoded service list — populated from ArgoCD gRPC-Web via availableServices prop

const mkSha = () => Array.from({length:8},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const SHAS = {};

const Badge = ({children,color}) => <span style={{fontSize:7.5,fontWeight:700,letterSpacing:".7px",textTransform:"uppercase",padding:"2px 6px",borderRadius:3,color,background:`${color}14`,border:`1px solid ${color}22`,whiteSpace:"nowrap"}}>{children}</span>;
const Dot = ({color}) => <div style={{width:5,height:5,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}80`,animation:"pulse 2s ease-in-out infinite",flexShrink:0}}/>;
const Spinner = ({size=16,color=C.warn}) => <svg width={size} height={size} viewBox="0 0 18 18" style={{animation:"spin 1s linear infinite"}}><circle cx="9" cy="9" r="7" fill="none" stroke={`${color}33`} strokeWidth="2"/><circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="2" strokeDasharray="20 24" strokeLinecap="round"/></svg>;

/**
 * DeployDag — QA Pre-Release Auto Test pipeline component.
 *
 * Props from Python state:
 * - runs_summary: list[dict] — run history
 * - active_run: dict — currently viewed run
 * - active_run_id: str — selected run ID
 * - live_step: str — currently executing step
 * - is_running: bool — pipeline executing
 * - paused: bool — pipeline paused
 * - watch_count: int — gRPC events since pause
 * - health_map: dict — {app: health_status}
 * - diagnostics: str — CEN-PE diagnostics text
 * - slack_sent: bool — Slack alert sent
 * - logs: list[dict] — current step logs
 *
 * Events to Python:
 * - on_start_pipeline()
 * - on_select_run(run_id)
 * - on_retry()
 * - on_force_proceed()
 */
export default function DeployDag(props) {
  return (
    <ErrorBoundary componentName="Pipeline DAG">
      <DeployDagInner {...props} />
    </ErrorBoundary>
  );
}

function DeployDagInner({
  availableServices = [],
  runsSummary = [],
  activeRun = null,
  activeRunId = "",
  liveStep = "",
  isRunning = false,
  paused = false,
  pauseError = "",
  pauseStep = "",
  watchCount = 0,
  healthMap = {},
  deployApps = [],
  expectedTags = {},
  slackSent = false,
  logs = [],
  jenkinsJobs = [],
  mergeStatuses = [],
  buildStatuses = [],
  gitopsStatuses = [],
  roster = {},
  slackChannel = "#qa-goldenpath",
  proposedActions = [],
  forecasts = [],
  diagnostics = "",
  connectionStatuses = {},
  yamlLockAcquired = false,
  onStartPipeline,
  onSelectRun,
  onRetry,
  onForceProceed,
  onRollback,
  onAbort,
  onSaveRoster,
  onApproveAction,
  onSkipAction,
}) {
  // Use ArgoCD services if available, otherwise fall back to hardcoded SVC_GROUPS
  const svcGroups = useMemo(() => availableServices || [], [availableServices]);
  const allSvcs = useMemo(() => svcGroups.flatMap(g => g.svcs || []), [svcGroups]);
  const [vStep, setVStep] = useState("merge");
  const [showRuns, setShowRuns] = useState(false);
  const [pastRun, setPastRun] = useState(null);
  const [pastStep, setPastStep] = useState("merge");
  const [logH, setLogH] = useState(150);
  const [showCfg, setShowCfg] = useState(false);
  const [cfgTeam, setCfgTeam] = useState("tw");
  const [cfgEnv, setCfgEnv] = useState("staging");
  const [cfgCountry] = useState("ug");
  // Services deselected by default (infra/non-deployable, not part of normal automation)
  const [skipJenkins, setSkipJenkins] = useState(false);
  const DEFAULT_DESELECTED = useMemo(() => new Set(["zookeeper", "shared-resources", "shared-resource", "config-server", "fe-web-nuxt"]), []);
  const [cfgSvcs, setCfgSvcs] = useState(() => new Set(allSvcs.filter(s => !DEFAULT_DESELECTED.has(s))));
  // Reset selection when available services change
  useEffect(() => { setCfgSvcs(new Set(allSvcs.filter(s => !DEFAULT_DESELECTED.has(s)))); }, [allSvcs, DEFAULT_DESELECTED]);
  // Roster config
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [rShift, setRShift] = useState(roster?.shift || "APAC Evening");
  const [rOncall, setROncall] = useState(roster?.oncall || "");
  const [rEscalation, setREscalation] = useState(roster?.escalation || "");
  const [rEmails, setREmails] = useState(roster?.emails_raw || "");
  useEffect(() => {
    if (roster?.shift) setRShift(roster.shift);
    if (roster?.oncall) setROncall(roster.oncall);
    if (roster?.escalation !== undefined) setREscalation(roster.escalation);
    if (roster?.emails_raw !== undefined) setREmails(roster.emails_raw);
  }, [roster]);

  const dragging = useRef(false);
  const dragStart = useRef({ y: 0, h: 0 });
  const logRef = useRef(null);

  const onDragStart = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { y: e.clientY, h: logH };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, [logH]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = dragStart.current.y - e.clientY;
      setLogH(Math.max(60, Math.min(500, dragStart.current.h + delta)));
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

  const runs = runsSummary || [];
  const active = activeRun || (runs.length > 0 ? runs[0] : null);
  const aRun = activeRunId || (active ? active.id : "");
  const running = isRunning;
  const retries = active?.retries || 0;
  const hMap = healthMap || {};
  const allLogs = logs || [];
  const logEntries = allLogs.filter(l => l.s === vStep);
  // Service list from health_map keys (populated during deploy step)
  const svcList = Object.keys(hMap);

  // Whether step viz data exists (run completed or in progress)
  const hasStepData = (mergeStatuses||[]).length > 0 || (buildStatuses||[]).length > 0
    || (gitopsStatuses||[]).length > 0 || Object.keys(hMap).length > 0 || (jenkinsJobs||[]).length > 0;
  const showStepViz = running || hasStepData;

  // Lazily populate SHAs for any new services
  svcList.forEach(a => { if (!SHAS[a]) SHAS[a] = mkSha(); });

  // Past build viewing mode
  const viewingPast = !!pastRun;
  const viewRun = viewingPast ? pastRun : active;
  const curStep = viewingPast ? pastStep : vStep;
  const pastLogs = viewingPast ? (pastRun.logs || []) : [];
  const pastLogEntries = pastLogs.filter(l => l.s === curStep);

  // Derive viz data: stored pastRun data when viewing past, live props otherwise
  const vMerge = viewingPast ? (pastRun.merge_statuses || []) : (mergeStatuses || []);
  const vBuild = viewingPast ? (pastRun.build_statuses || []) : (buildStatuses || []);
  const vGitops = viewingPast ? (pastRun.gitops_statuses || []) : (gitopsStatuses || []);
  const vHealth = viewingPast ? (pastRun.health_map || {}) : hMap;
  const vJenkins = viewingPast ? (pastRun.jenkins_jobs || []) : (jenkinsJobs || []);

  // Clear past run when a new pipeline starts
  useEffect(() => {
    if (running) setPastRun(null);
  }, [running]);

  // Auto-follow the live step as the pipeline progresses
  useEffect(() => {
    if (liveStep) setVStep(liveStep);
  }, [liveStep]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logEntries, vStep]);

  const lc = { i:"#555", s:C.ok, w:C.warn, e:C.err, h:"#777", c:C.blu, d:"#2a2a2a" };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(350%)} }
        @keyframes heartbeat {
          0% { transform:scale(1); opacity:.6; }
          25% { transform:scale(1.8); opacity:.3; }
          50% { transform:scale(2.4); opacity:0; }
          100% { transform:scale(2.4); opacity:0; }
        }
        @keyframes ripple {
          0% { transform:scale(.6); opacity:.5; }
          50% { transform:scale(1.6); opacity:.2; }
          100% { transform:scale(2.2); opacity:0; }
        }
        @keyframes completeBanner {
          0% { opacity:0; transform:translateY(8px); }
          100% { opacity:1; transform:translateY(0); }
        }
        @keyframes heartRipple { 0% { transform:scale(1); opacity:1; } 50% { transform:scale(1.3); opacity:0.6; } 100% { transform:scale(1); opacity:1; } }
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(-12px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        button:hover { filter:brightness(1.2); }
      `}</style>

      {/* Header */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:C.sf}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14,opacity:.3}}>◆</span>
          <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>QA Pre-Release Auto Test</span>
          <Badge color={C.ok}>5 stages</Badge>
          {/* Run number indicator — shows past run when viewing past, live run otherwise */}
          {viewingPast && pastRun && <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:4,background:"rgba(255,255,255,0.04)",border:`1px solid ${pastRun.st==="success"?"rgba(34,197,94,0.15)":pastRun.st==="failed"?"rgba(239,68,68,0.15)":"rgba(234,179,8,0.15)"}`}}>
            <span style={{fontSize:12,fontWeight:800,color:pastRun.st==="success"?C.ok:pastRun.st==="failed"?C.err:C.warn,fontVariantNumeric:"tabular-nums"}}>#{pastRun.n}</span>
            <span style={{fontSize:8,color:"#666"}}>{pastRun.st||"—"}</span>
            {pastRun.dur && pastRun.dur !== "\u2014" && <span style={{fontSize:8,color:C.dim,fontVariantNumeric:"tabular-nums"}}>{pastRun.dur}</span>}
          </div>}
          {!viewingPast && active && (running || hasStepData) && <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:4,background:"rgba(255,255,255,0.04)",border:`1px solid ${active.st==="success"?"rgba(34,197,94,0.15)":active.st==="failed"?"rgba(239,68,68,0.15)":running?"rgba(234,179,8,0.15)":"rgba(255,255,255,0.08)"}`}}>
            <span style={{fontSize:12,fontWeight:800,color:active.st==="success"?C.ok:active.st==="failed"?C.err:running?C.warn:"#aaa",fontVariantNumeric:"tabular-nums"}}>#{active.n}</span>
            <span style={{fontSize:8,color:"#666"}}>{running?"running":active.st||"—"}</span>
            {active.dur && active.dur !== "\u2014" && <span style={{fontSize:8,color:C.dim,fontVariantNumeric:"tabular-nums"}}>{active.dur}</span>}
          </div>}
          {/* YAML deploy lock indicator */}
          {yamlLockAcquired && !viewingPast && <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:4,background:"rgba(234,179,8,0.06)",border:"1px solid rgba(234,179,8,0.18)"}}>
            <span style={{fontSize:10}}>🔒</span>
            <span style={{fontSize:8,fontWeight:700,letterSpacing:".5px",textTransform:"uppercase",color:C.warn}}>YAML LOCKED</span>
          </div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
        {viewingPast && <button onClick={() => setPastRun(null)} style={{
          padding:"5px 10px",fontSize:9,fontWeight:500,fontFamily:F,cursor:"pointer",
          background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.12)",
          borderRadius:4,color:C.blu,transition:"all .15s",
        }}>◂ Back</button>}
        <button onClick={() => { setShowRuns(p => { if (p) setPastRun(null); return !p; }); }} style={{
          padding:"5px 10px",fontSize:9,fontWeight:500,fontFamily:F,cursor:"pointer",
          background:showRuns?"rgba(255,255,255,0.06)":"transparent",
          border:`1px solid ${showRuns?"rgba(255,255,255,0.1)":C.bdr}`,
          borderRadius:4,color:showRuns?"#aaa":"#555",transition:"all .15s",
        }}>{showRuns?"◂ Hide Runs":"▸ Past Runs"}{runs.length>0?` (${runs.length})`:""}</button>
        <button onClick={() => setShowRoster(true)} style={{
          padding:"5px 10px",fontSize:9,fontWeight:500,fontFamily:F,cursor:"pointer",
          background:"rgba(96,165,250,0.04)",border:"1px solid rgba(96,165,250,0.08)",
          borderRadius:4,color:"#666",transition:"all .15s",
        }}>✎ Roster</button>
        <button onClick={() => running ? null : setShowCfg(true)} disabled={running} style={{
          padding:"6px 16px",fontSize:10,fontWeight:600,fontFamily:F,cursor:running?"not-allowed":"pointer",
          background:running?"rgba(234,179,8,0.06)":"rgba(34,197,94,0.06)",
          border:`1px solid ${running?"rgba(234,179,8,0.12)":"rgba(34,197,94,0.12)"}`,
          borderRadius:5,color:running?C.warn:C.ok,transition:"all .2s",
        }}>{running?`● Run #${active?.n || "—"} Running...`:"▶ Start Automation"}</button>
        {running && <button onClick={() => setShowAbortConfirm(true)} style={{
          padding:"6px 12px",fontSize:9.5,fontWeight:700,fontFamily:F,cursor:"pointer",
          background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",
          borderRadius:5,color:C.err,transition:"all .2s",letterSpacing:".3px",
        }}>✕ Abort</button>}
        </div>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Past Runs sidebar (toggled) */}
        {showRuns && <div style={{width:170,borderRight:`1px solid ${C.bdr}`,overflowY:"auto",flexShrink:0}}>
          <div style={{padding:"8px 10px",fontSize:7.5,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",color:C.mut}}>Past Runs</div>
          {runs.map(r => {
            const sc = r.st==="success"?C.ok:r.st==="failed"?C.err:r.st==="degraded"?"#f97316":r.st==="interrupted"?"#f97316":C.warn;
            const sel = pastRun?.id === r.id;
            return <div key={r.id} onClick={() => { if (r.id === aRun && running) { setPastRun(null); } else { setPastRun(r); setPastStep("merge"); if (!running) onSelectRun?.(r.id); } }}
              style={{padding:"6px 10px",cursor:"pointer",borderLeft:`3px solid ${sel?sc:"transparent"}`,background:sel?`${sc}08`:"transparent",borderBottom:`1px solid ${C.bdr}`,transition:"all .1s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:9.5,fontWeight:600,color:sel?"#fff":"#555"}}>Run #{r.n}</span>
                <Badge color={sc}>{r.st}</Badge>
              </div>
              <div style={{fontSize:7.5,color:sel?"#555":C.mut,marginTop:2}}>{r.dur} · {r.t}{r.by ? ` · ${r.by}` : ""}</div>
              <div style={{display:"flex",gap:2,marginTop:3}}>
                {STEPS.map(s => {
                  const ss = r.steps?.[s.id] || "pending";
                  const dc = ss==="success"?C.ok:ss==="failed"?C.err:ss==="running"?C.warn:ss==="skipped"?C.blu:C.mut;
                  return <div key={s.id} style={{width:8,height:3,borderRadius:1,background:dc}}/>;
                })}
              </div>
            </div>;
          })}
          {runs.length===0 && <div style={{padding:"12px 10px",fontSize:8.5,color:C.dim,textAlign:"center"}}>No past runs</div>}
        </div>}

        {/* Step Rail */}
        <div style={{width:160,borderRight:`1px solid ${C.bdr}`,overflowY:"auto",flexShrink:0,padding:"8px 0"}}>
          {viewingPast && <div style={{padding:"4px 12px 6px",fontSize:7.5,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.dim,borderBottom:`1px solid ${C.bdr}`,marginBottom:4}}>Run #{pastRun.n} · {pastRun.st}</div>}
          {STEPS.map((s,i) => {
            const st = viewRun?.steps?.[s.id] || "pending";
            const sc = st==="success"?C.ok:st==="running"?C.warn:st==="failed"?C.err:st==="skipped"?C.blu:st==="degraded"||st==="interrupted"?"#f97316":C.mut;
            const v = curStep === s.id;
            return <div key={s.id}>
              <button onClick={() => viewingPast ? setPastStep(s.id) : setVStep(s.id)} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 12px",background:v?`${sc}0c`:"transparent",borderLeft:`3px solid ${v?sc:"transparent"}`,border:"none",borderRight:"none",borderTop:"none",borderBottom:"none",borderLeftWidth:3,borderLeftStyle:"solid",borderLeftColor:v?sc:"transparent",cursor:"pointer",fontFamily:F,textAlign:"left"}}>
                <div style={{width:20,height:20,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",background:`${sc}14`,border:`1px solid ${sc}28`,fontSize:9,color:sc,flexShrink:0,animation:st==="running"?"pulse 1.5s ease infinite":"none"}}>
                  {st==="success"?"✓":st==="running"?"⟳":st==="failed"?"✕":st==="skipped"?"⏭":st==="degraded"?"⚠":st==="interrupted"?"⊘":s.ic}
                </div>
                <div style={{overflow:"hidden"}}>
                  <div style={{fontSize:9.5,fontWeight:v?600:500,color:v?"#ddd":st==="pending"?C.dim:"#777",lineHeight:1.2}}>{s.l}</div>
                  <div style={{fontSize:7.5,color:C.mut,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.d}</div>
                </div>
              </button>
              {i<STEPS.length-1 && <div style={{padding:"0 0 0 21px"}}><div style={{width:1,height:6,background:st==="success"?`${C.ok}30`:C.bdr}}/></div>}
            </div>;
          })}
        </div>

        {/* Content + Logs */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>

            {/* Landing view — shown when pipeline is idle and no past run selected */}
            {!running && !liveStep && !viewingPast && <div>
              {/* Pipeline steps info */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:8}}>Pipeline Sequence</div>
                <div style={{display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                  {STEPS.map((s,i) => <div key={s.id} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:5,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.bdr}`}}>
                      <span style={{fontSize:10,opacity:.5}}>{s.ic}</span>
                      <div>
                        <div style={{fontSize:9.5,fontWeight:600,color:"#888"}}>{s.l}</div>
                        <div style={{fontSize:7.5,color:C.dim}}>{s.d}</div>
                      </div>
                    </div>
                    {i<STEPS.length-1 && <span style={{fontSize:10,color:C.dim}}>→</span>}
                  </div>)}
                </div>
              </div>

              {/* On-Call Roster Card */}
              <div style={{padding:"10px 12px",borderRadius:6,background:"rgba(255,255,255,0.015)",border:`1px solid ${C.bdr}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:9,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut}}>On-Call Roster</div>
                  <button onClick={() => setShowRoster(true)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 8px",borderRadius:3,background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.1)",color:C.blu}}>✎ Configure</button>
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:120,padding:"8px 10px",borderRadius:5,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.bdr}`}}>
                    <div style={{fontSize:7.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Shift</div>
                    <div style={{fontSize:11,fontWeight:600,color:"#aaa"}}>{roster?.shift||"Not configured"}</div>
                  </div>
                  <div style={{flex:1,minWidth:140,padding:"8px 10px",borderRadius:5,background:"rgba(96,165,250,0.02)",border:"1px solid rgba(96,165,250,0.08)"}}>
                    <div style={{fontSize:7.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>On-Call</div>
                    <div style={{fontSize:11,fontWeight:600,color:C.blu}}>{roster?.oncall||"Not configured"}</div>
                  </div>
                  <div style={{flex:1,minWidth:120,padding:"8px 10px",borderRadius:5,background:"rgba(234,179,8,0.02)",border:"1px solid rgba(234,179,8,0.08)"}}>
                    <div style={{fontSize:7.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Escalation</div>
                    <div style={{fontSize:11,fontWeight:600,color:C.warn}}>{roster?.escalation||"Not configured"}</div>
                  </div>
                </div>
              </div>

            </div>}

            {/* Past build detail view */}
            {viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontSize:11,fontWeight:700,color:"#ccc"}}>Run #{pastRun.n}</span>
                <Badge color={pastRun.st==="success"?C.ok:pastRun.st==="failed"?C.err:C.warn}>{pastRun.st}</Badge>
                <span style={{fontSize:9,color:C.dim}}>{pastRun.dur} · started {pastRun.t}{pastRun.by ? ` · by ${pastRun.by}` : ""}</span>
              </div>
              {/* Step summary cards */}
              <div style={{display:"flex",gap:4,marginBottom:12,flexWrap:"wrap"}}>
                {STEPS.map(s => {
                  const ss = pastRun.steps?.[s.id] || "pending";
                  const sc = ss==="success"?C.ok:ss==="failed"?C.err:ss==="running"?C.warn:ss==="skipped"?C.blu:ss==="interrupted"?"#f97316":C.mut;
                  const sel = pastStep === s.id;
                  return <button key={s.id} onClick={() => { setPastStep(s.id); }} style={{
                    display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontFamily:F,
                    background:sel?`${sc}0c`:"rgba(255,255,255,0.015)",
                    border:`1px solid ${sel?`${sc}30`:C.bdr}`,transition:"all .1s",
                  }}>
                    <span style={{fontSize:9,color:sc}}>{ss==="success"?"✓":ss==="failed"?"✕":ss==="skipped"?"⏭":ss==="pending"?"○":ss==="interrupted"?"⊘":"⟳"}</span>
                    <span style={{fontSize:9,fontWeight:sel?600:400,color:sel?"#ccc":ss==="pending"?C.dim:"#777"}}>{s.l}</span>
                  </button>;
                })}
              </div>

              {/* Step visualization — restored from stored run data */}
              {pastStep==="merge" && vMerge.length > 0 && <div style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5}}>
                  {vMerge.map(m => {
                    const ok = m.status==="success"||m.status==="no-op";
                    const fail = m.status==="failed";
                    const bc = ok?C.ok:fail?C.err:C.warn;
                    return <div key={m.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{m.name}</div>
                        <span style={{color:ok?C.ok:C.err,fontSize:11}}>{ok?"✓":"✕"}</span>
                      </div>
                      <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(m.status==="no-op"?"● Up to date":"● Merged"):"▼ Failed"}</span>
                        {m.sha && <span style={{fontSize:8,color:C.blu}}>{m.sha.slice(0,8)}</span>}
                      </div>
                      {m.branch && <div style={{paddingLeft:5,marginTop:3}}>
                        <span style={{fontSize:7.5,color:"#666"}}>master → </span>
                        <span style={{fontSize:7.5,color:C.blu}}>{m.branch}</span>
                      </div>}
                    </div>;
                  })}
                </div>
              </div>}

              {pastStep==="build" && vBuild.length > 0 && <div style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:5}}>
                  {vBuild.map(b => {
                    const ok = b.status==="success";
                    const fail = b.status==="failed";
                    const existed = b.phase==="exists";
                    const jenkinsBuilt = b.phase==="jenkins_built";
                    const jUrl = b.jenkins_url||"";
                    const bc = ok?C.ok:fail?C.err:C.warn;
                    return <div key={b.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{b.name}</div>
                        <span style={{display:"flex",alignItems:"center",gap:4}}>
                          {jUrl && <a href={jUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:7.5,color:C.blu,textDecoration:"none",opacity:0.8}}>⚙ Jenkins</a>}
                          <span style={{color:ok?C.ok:C.err,fontSize:11}}>{ok?"✓":"✕"}</span>
                        </span>
                      </div>
                      <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(existed?"● Image Exists":jenkinsBuilt?"● Jenkins → ECR":"● Built"):"▼ Failed"}</span>
                        {b.tag && <span style={{fontSize:8,color:C.blu}}>{b.tag}</span>}
                      </div>
                    </div>;
                  })}
                </div>
              </div>}

              {pastStep==="gitops" && vGitops.length > 0 && <div style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5}}>
                  {vGitops.map(g => {
                    const ok = g.status==="success";
                    const fail = g.status==="failed";
                    const bc = ok?C.ok:fail?C.err:C.warn;
                    return <div key={g.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                        <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{g.name}</div>
                        <span style={{color:ok?C.ok:C.err,fontSize:11}}>{ok?"✓":"✕"}</span>
                      </div>
                      <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(g.phase==="unchanged"?"○ Unchanged":"● Updated"):"▼ Failed"}</span>
                        {ok && g.phase==="pushed" && <span style={{fontSize:7,color:C.ok,background:"rgba(34,197,94,0.06)",padding:"1px 5px",borderRadius:3}}>pushed ✓</span>}
                        {ok && g.phase==="unchanged" && <span style={{fontSize:7,color:"#888",background:"rgba(136,136,136,0.06)",padding:"1px 5px",borderRadius:3}}>tag current</span>}
                      </div>
                      {g.old_tag && g.phase==="updated" && <div style={{paddingLeft:5,marginTop:3,display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:7.5,color:"#666",textDecoration:"line-through"}}>{g.old_tag}</span>
                        <span style={{fontSize:8,color:"#555"}}>→</span>
                        <span style={{fontSize:7.5,color:C.blu}}>{g.tag}</span>
                      </div>}
                      {!g.old_tag && g.tag && <div style={{paddingLeft:5,marginTop:3}}>
                        <span style={{fontSize:7.5,color:C.blu}}>{g.tag}</span>
                      </div>}
                    </div>;
                  })}
                </div>
              </div>}

              {pastStep==="deploy" && Object.keys(vHealth).length > 0 && <div style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:4}}>
                  {Object.keys(vHealth).map(a => {
                    const h = vHealth[a]||"Healthy";
                    const ok = h==="Healthy", bad = h==="Degraded";
                    const hc = ok?C.ok:bad?C.err:C.warn;
                    return <div key={a} style={{padding:"6px 9px",borderRadius:6,background:ok?"rgba(34,197,94,0.03)":bad?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":bad?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:2,height:"100%",background:hc,borderRadius:"6px 0 0 6px"}}/>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3,paddingLeft:4}}>
                        <div style={{fontSize:9.5,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:5}}>{a}</div>
                        <span style={{flexShrink:0,fontSize:13}}>{ok?"💚":bad?"💔":"🟡"}</span>
                      </div>
                      <div style={{display:"flex",gap:3,paddingLeft:4,alignItems:"center"}}>
                        <span style={{fontSize:8,fontWeight:600,color:hc,background:`${hc}14`,padding:"1px 6px",borderRadius:3}}>{ok?"● Healthy":bad?"▼ Degraded":"◐ Progressing"}</span>
                        <span style={{fontSize:8,color:ok?C.ok:C.warn,background:`${ok?C.ok:C.warn}14`,padding:"1px 6px",borderRadius:3}}>{ok?"✓ Synced":"⟳ OutOfSync"}</span>
                      </div>
                    </div>;
                  })}
                </div>
                {/* Slack notification preview for past deploy */}
                {pastRun.steps?.deploy==="success" && (() => {
                  const pastSvcList = Object.keys(vHealth);
                  const allHealthy = pastSvcList.every(a => (vHealth[a]||"Healthy")==="Healthy");
                  return <div style={{marginTop:8,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                    <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:allHealthy?C.ok:C.err}}>{allHealthy?"✅ HEALTHY":"❌ DEGRADED"}</span></div>
                    <div style={{borderLeft:`3px solid ${allHealthy?C.ok:C.err}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:"#fff",marginBottom:5}}>Staging UG {pastRun?.branch||"pre-release-tw"} — {pastSvcList.filter(a=>(vHealth[a]||"Healthy")==="Healthy").length}/{pastSvcList.length} Healthy</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                        {pastSvcList.map(a => {
                          const hh = (vHealth[a]||"Healthy")==="Healthy";
                          return <span key={a} style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:hh?"rgba(34,197,94,0.04)":"rgba(239,68,68,0.04)",color:hh?C.ok:C.err,border:`1px solid ${hh?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"}`}}>{hh?"💚":"💔"} {a}</span>;
                        })}
                      </div>
                    </div>
                  </div>;
                })()}
              </div>}

              {pastStep==="jenkins" && vJenkins.length > 0 && <div style={{marginBottom:12}}>
                <div style={{display:"flex",gap:7}}>
                  {vJenkins.map(j => {
                    const ok = j.status==="success";
                    const fail = j.status==="failed";
                    const bc = ok?C.ok:fail?C.err:C.warn;
                    const stages = (j.stages || []).filter(s=>s.id!=="q");
                    return <div key={j.name} style={{flex:1,padding:"12px 14px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,paddingLeft:5}}>
                        <span style={{color:ok?C.ok:C.err,fontSize:12}}>{ok?"✓":"✕"}</span>
                        <span style={{fontSize:11,fontWeight:600,color:"#ddd"}}>{j.label}</span>
                        {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" style={{fontSize:8,color:C.blu,textDecoration:"none",marginLeft:"auto"}}>#{j.build_num} ↗</a>}
                      </div>
                      <div style={{paddingLeft:5}}>
                        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:stages.length>0?6:0}}>
                          <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?"● Passed":"▼ Failed"}</span>
                          {!j.url && j.build_num > 0 && <span style={{fontSize:8,color:C.blu}}>#{j.build_num}</span>}
                          {j.duration && j.duration !== "\u2014" && <span style={{fontSize:8,color:C.dim}}>{j.duration}</span>}
                          {j.queue_duration && <span style={{fontSize:7.5,color:"#555"}}><span style={{color:"#777",fontWeight:600}}>Q:</span> {j.queue_duration}</span>}
                          {j.exec_duration && <span style={{fontSize:7.5,color:"#555"}}><span style={{color:"#777",fontWeight:600}}>E:</span> {j.exec_duration}</span>}
                        </div>
                        {stages.length > 0 && <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          {stages.map((s,si) => {
                            const sOk = s.status==="success";
                            const sFail = s.status==="failed";
                            const sColor = sOk?C.ok:sFail?C.err:"#444";
                            return <div key={s.id||si} style={{display:"flex",alignItems:"center",gap:5,padding:"1px 0"}}>
                              <span style={{width:10,textAlign:"center",fontSize:8,color:sColor}}>{sOk?"✓":sFail?"✕":"·"}</span>
                              <span style={{fontSize:8,color:sOk?"#777":sFail?"#c66":"#444"}}>{s.name}</span>
                              {s.duration && s.duration!=="—" && <span style={{fontSize:7,color:"#444",marginLeft:"auto"}}>{s.duration}</span>}
                            </div>;
                          })}
                        </div>}
                      </div>
                    </div>;
                  })}
                </div>
                {/* Slack notification preview for past Jenkins QA */}
                {vJenkins.every(j=>j.status!=="running") && (() => {
                  const allOk = vJenkins.every(j=>j.status==="success");
                  return <div style={{marginTop:10,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                    <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:allOk?C.ok:C.warn}}>{allOk?"✅ ALL PASSED":"⚠️ SOME FAILED"}</span></div>
                    <div style={{borderLeft:`3px solid ${allOk?C.ok:C.warn}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                      <div style={{fontSize:10.5,fontWeight:700,color:allOk?"#fff":C.warn,marginBottom:5}}>WAP+RESTAPI QA Jobs — {allOk?"All Passed":`${vJenkins.filter(j=>j.status==="success").length}/${vJenkins.length} Passed`}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {vJenkins.map(j => {const ok=j.status==="success"; return <span key={j.name} style={{fontSize:8.5,padding:"2px 7px",borderRadius:3,background:ok?"rgba(34,197,94,0.04)":"rgba(239,68,68,0.04)",color:ok?C.ok:C.err,border:`1px solid ${ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"}`}}>{ok?"✓":"✕"} {j.label} #{j.build_num} ({j.duration})</span>;})}
                      </div>
                    </div>
                  </div>;
                })()}
              </div>}

              {/* Step log preview */}
              <div style={{borderRadius:6,border:`1px solid ${C.bdr}`,background:"rgba(3,3,5,0.6)",overflow:"hidden"}}>
                <div style={{padding:"5px 12px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:7.5,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",color:C.mut}}>Logs</span>
                  <span style={{fontSize:9,color:C.dim}}>{STEPS.find(s=>s.id===pastStep)?.l}</span>
                  <span style={{fontSize:7.5,color:C.mut,marginLeft:"auto"}}>{pastLogEntries.length} lines</span>
                </div>
                <div style={{maxHeight:300,overflowY:"auto",padding:"6px 12px"}}>
                  {pastLogEntries.length === 0 && <div style={{fontSize:9,color:C.dim,padding:"8px 0"}}>No logs — step was not executed</div>}
                  {pastLogEntries.map((l,i) => <div key={i} style={{fontSize:10,lineHeight:1.7,color:lc[l.k]||"#444",whiteSpace:"pre-wrap"}}><span style={{color:C.mut,marginRight:7,userSelect:"none"}}>{l.t}</span>{l.x}</div>)}
                </div>
              </div>
            </div>}

            {/* Global pause banner — shows for any step failure */}
            {paused && pauseStep && pauseStep!=="deploy" && !viewingPast && <div style={{marginBottom:10,padding:"10px 12px",borderRadius:7,background:"rgba(239,68,68,0.04)",border:"1px solid rgba(239,68,68,0.15)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,fontWeight:600,color:C.err,marginBottom:2}}>⏸ Pipeline Paused — {(STEPS.find(s=>s.id===pauseStep)||{}).l||pauseStep} Failed</div>
                  <div style={{fontSize:8.5,color:"#888",whiteSpace:"pre-wrap",lineHeight:1.5}}>{pauseError}</div>
                </div>
                <button onClick={() => onRetry?.()} style={{padding:"6px 14px",fontSize:9.5,fontWeight:600,fontFamily:F,cursor:"pointer",background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:5,color:C.blu}}>⟳ Retry</button>
                <button onClick={() => onForceProceed?.()} style={{padding:"6px 14px",fontSize:9.5,fontWeight:600,fontFamily:F,cursor:"pointer",background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)",borderRadius:5,color:C.warn}}>▶ Force Proceed</button>
                <button onClick={() => setShowAbortConfirm(true)} style={{padding:"6px 14px",fontSize:9.5,fontWeight:700,fontFamily:F,cursor:"pointer",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:5,color:C.err}}>✕ Abort</button>
              </div>
            </div>}

            {/* Global CEN-PE Actions — shows for non-deploy step failures */}
            {pauseStep!=="deploy" && (proposedActions||[]).length > 0 && !viewingPast && <div style={{marginBottom:10,padding:"10px 12px",borderRadius:7,background:"rgba(167,139,250,0.04)",border:"1px solid rgba(167,139,250,0.12)"}}>
              <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.agent,marginBottom:8}}>CEN-PE Action Proposals</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {(proposedActions||[]).map(a => {
                  const conf = a.confidence || 0;
                  const confColor = conf >= 80 ? C.ok : conf >= 50 ? C.warn : C.err;
                  const stColor = a.status==="done" ? C.ok : a.status==="failed" ? C.err : a.status==="executing"||a.status==="auto_executing" ? C.warn : a.status==="skipped" ? C.dim : "#888";
                  const stLabel = a.status==="done" ? "DONE" : a.status==="failed" ? "FAILED" : a.status==="executing"||a.status==="auto_executing" ? "EXECUTING" : a.status==="skipped" ? "SKIPPED" : "PROPOSED";
                  return <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:5,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.bdr}`}}>
                    <span style={{fontSize:9,fontWeight:700,color:confColor,minWidth:32,textAlign:"right"}}>[{conf}%]</span>
                    <span style={{fontSize:9,fontWeight:600,color:"#ccc",minWidth:70}}>{a.action}</span>
                    <span style={{fontSize:8.5,color:C.blu}}>→ {a.target}</span>
                    <span style={{fontSize:8,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{a.reason}"</span>
                    <Badge color={stColor}>{stLabel}</Badge>
                    {(a.status==="executing"||a.status==="auto_executing") && <Spinner size={12} color={C.warn}/>}
                    {a.status==="proposed" && <>
                      <button onClick={() => onApproveAction?.(a.id)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 7px",borderRadius:3,background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.15)",color:C.ok}}>Approve</button>
                      <button onClick={() => onSkipAction?.(a.id)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 7px",borderRadius:3,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.bdr}`,color:"#666"}}>Skip</button>
                    </>}
                    {a.result && <span style={{fontSize:7.5,color:a.status==="done"?C.ok:C.err,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.result}>{a.result}</span>}
                  </div>;
                })}
              </div>
            </div>}

            {vStep==="merge" && showStepViz && !viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:600,color:"#999"}}>⑂ Git Merge — {(()=>{const ms=mergeStatuses||[];const branches=[...new Set(ms.map(m=>m.branch).filter(Boolean))];if(branches.length===0) return `master → ${active?.branch||"pre-release-tw"}`;if(branches.length===1) return `master → ${branches[0]}`;return branches.map(b=>`master → ${b}`).join(" · ");})()}</span>
                {(() => {
                  const ms = mergeStatuses||[];
                  const done = ms.filter(m=>m.status!=="running").length;
                  const tot = ms.length;
                  const allOk = tot>0 && done===tot && ms.every(m=>m.status==="success"||m.status==="no-op");
                  return tot > 0 ? <span style={{fontSize:8,color:allOk?C.ok:done<tot?C.warn:"#888"}}>{done}/{tot} complete</span> : null;
                })()}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5}}>
                {(mergeStatuses||[]).map(m => {
                  const ok = m.status==="success"||m.status==="no-op";
                  const fail = m.status==="failed";
                  const run = m.status==="running";
                  const bc = ok?C.ok:fail?C.err:C.warn;
                  return <div key={m.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                      <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{m.name}</div>
                      <span style={{flexShrink:0,display:"inline-flex",alignItems:"center",position:"relative"}}>
                        {ok && <span style={{color:C.ok,fontSize:11}}>✓</span>}
                        {fail && <span style={{color:C.err,fontSize:11}}>✕</span>}
                        {run && <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16}}>
                          <span style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${C.warn}`,animation:"ripple 1.8s ease-out infinite",pointerEvents:"none"}}/>
                          <Spinner size={12}/>
                        </span>}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(m.status==="no-op"?"● Up to date":"● Merged"):fail?"▼ Failed":"◐ Merging"}</span>
                      {m.branch && <span style={{fontSize:7.5,color:"#888",background:"rgba(255,255,255,0.03)",padding:"1px 5px",borderRadius:3,border:"1px solid rgba(255,255,255,0.06)"}}>→ {m.branch}</span>}
                      {m.sha && <span style={{fontSize:8,color:C.blu,fontVariantNumeric:"tabular-nums"}}>{m.sha.slice(0,10)}</span>}
                    </div>
                    {(m.master_sha || m.target_sha) && <div style={{paddingLeft:5,marginTop:4,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                      {m.master_sha && <span style={{fontSize:7.5,color:"#666"}}><span style={{fontWeight:600,color:"#555"}}>master</span> <span style={{color:C.blu,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{m.master_sha.slice(0,10)}</span></span>}
                      {m.target_sha && <span style={{fontSize:7.5,color:"#666"}}><span style={{fontWeight:600,color:"#555"}}>{m.branch||"pre-release-tw"}</span> <span style={{color:C.ok,fontVariantNumeric:"tabular-nums",fontFamily:F}}>{m.target_sha.slice(0,10)}</span></span>}
                    </div>}
                    {m.ecr_tag && (ok) && (()=>{
                      const match = m.deployed_tag && m.ecr_tag === m.deployed_tag;
                      return <div style={{paddingLeft:5,marginTop:4,display:"flex",flexDirection:"column",gap:2}}>
                        {match ? <span style={{fontSize:8,fontFamily:F,color:C.ok}}>✓ Up to date <span style={{color:"#666",fontSize:7}}>({m.ecr_tag})</span></span>
                        : <>
                          <span style={{fontSize:7.5,color:"#888"}}>Expected: <span style={{color:C.blu,fontFamily:F}}>{m.ecr_tag}</span></span>
                          {m.deployed_tag && <span style={{fontSize:7.5,color:"#888"}}>Deployed: <span style={{color:C.warn,fontFamily:F}}>{m.deployed_tag}</span></span>}
                        </>}
                      </div>;
                    })()}
                    {m.message && ok && !m.ecr_tag && <div style={{paddingLeft:5,marginTop:3}}><span style={{fontSize:7.5,color:C.dim}}>{m.message}</span></div>}
                    {m.message && fail && <div style={{paddingLeft:5,marginTop:3}}><span style={{fontSize:7.5,color:C.err,opacity:0.8}}>{m.message}</span></div>}
                    {run && <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"rgba(234,179,8,0.15)",overflow:"hidden"}}>
                      <div style={{width:"40%",height:"100%",background:C.warn,borderRadius:1,animation:"slide 1.5s ease-in-out infinite"}}/>
                    </div>}
                  </div>;
                })}
              </div>
              {/* ECR Image Tag Summary — shows after all merges complete */}
              {(()=>{
                const ms=mergeStatuses||[];
                const allDone=ms.length>0&&ms.every(m=>m.status!=="running");
                const withTags=ms.filter(m=>m.ecr_tag);
                if(!allDone||withTags.length===0) return null;
                const upToDate=withTags.filter(m=>m.deployed_tag && m.ecr_tag===m.deployed_tag).length;
                const needsUpdate=withTags.length-upToDate;
                return <div style={{marginTop:10,padding:"9px 11px",borderRadius:6,background:"rgba(96,165,250,0.02)",border:`1px solid rgba(96,165,250,0.08)`}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                    <span style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.blu}}>Image Tags</span>
                    <span style={{fontSize:7.5,color:C.dim}}>{withTags.length} services</span>
                    {upToDate>0 && <span style={{fontSize:7,color:C.ok,background:"rgba(34,197,94,0.06)",padding:"1px 5px",borderRadius:3}}>✓ {upToDate} up to date</span>}
                    {needsUpdate>0 && <span style={{fontSize:7,color:C.warn,background:"rgba(234,179,8,0.06)",padding:"1px 5px",borderRadius:3}}>{needsUpdate} pending deploy</span>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"minmax(90px,auto) 1fr",gap:"2px 12px",fontSize:8.5,fontFamily:F}}>
                    {withTags.map(m=>{
                      const match=m.deployed_tag && m.ecr_tag===m.deployed_tag;
                      return <React.Fragment key={m.name}>
                        <span style={{color:"#888",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
                        {match
                          ? <span style={{color:C.ok}}>✓ Up to date <span style={{color:"#555",fontSize:7.5}}>({m.ecr_tag})</span></span>
                          : <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <span style={{color:"#888",fontSize:7.5}}>Expected:</span> <span style={{color:C.blu}}>{m.ecr_tag}</span>
                              {m.deployed_tag && <> <span style={{color:"#666",fontSize:7.5}}>Deployed:</span> <span style={{color:C.warn}}>{m.deployed_tag}</span></>}
                            </span>}
                      </React.Fragment>;
                    })}
                  </div>
                </div>;
              })()}

              {/* Slack failure notification for merge */}
              {(mergeStatuses||[]).length > 0 && (mergeStatuses||[]).every(m=>m.status!=="running") && (mergeStatuses||[]).some(m=>m.status==="failed") && <div style={{marginTop:10,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:C.err}}>❌ MERGE FAILED</span></div>
                <div style={{borderLeft:`3px solid ${C.err}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:C.err,marginBottom:5}}>❌ Git Merge Failed — {(mergeStatuses||[]).filter(m=>m.status==="failed").length}/{(mergeStatuses||[]).length} failed</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {(mergeStatuses||[]).filter(m=>m.status==="failed").map(m => <span key={m.name} style={{fontSize:8.5,padding:"2px 7px",borderRadius:3,background:"rgba(239,68,68,0.04)",color:C.err,border:"1px solid rgba(239,68,68,0.08)"}}>✕ {m.name}</span>)}
                  </div>
                </div>
              </div>}
            </div>}

            {vStep==="gitops" && showStepViz && !viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:600,color:"#999"}}>⟲ GitOps Update — Image Tag Update</span>
                {(() => {
                  const gs = gitopsStatuses||[];
                  const done = gs.filter(g=>g.status!=="running").length;
                  const tot = gs.length;
                  const allOk = tot>0 && done===tot && gs.every(g=>g.status==="success");
                  return tot > 0 ? <span style={{fontSize:8,color:allOk?C.ok:done<tot?C.warn:"#888"}}>{done}/{tot} complete</span> : null;
                })()}
                {yamlLockAcquired && <span style={{fontSize:8,fontWeight:600,color:C.warn,display:"inline-flex",alignItems:"center",gap:3}}>
                  <span style={{fontSize:9}}>🔒</span> staging-ug locked
                </span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:5}}>
                {(gitopsStatuses||[]).map(g => {
                  const ok = g.status==="success";
                  const fail = g.status==="failed";
                  const run = g.status==="running";
                  const bc = ok?C.ok:fail?C.err:C.warn;
                  return <div key={g.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                      <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{g.name}</div>
                      <span style={{flexShrink:0,display:"inline-flex",alignItems:"center",position:"relative"}}>
                        {ok && <span style={{color:C.ok,fontSize:11}}>✓</span>}
                        {fail && <span style={{color:C.err,fontSize:11}}>✕</span>}
                        {run && <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16}}>
                          <span style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${C.warn}`,animation:"ripple 1.8s ease-out infinite",pointerEvents:"none"}}/>
                          <Spinner size={12}/>
                        </span>}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(g.phase==="unchanged"?"○ Unchanged":"● Updated"):fail?"▼ Failed":"◐ Updating"}</span>
                      {g.tag && <span style={{fontSize:8,color:C.blu}}>{g.tag}</span>}
                      {ok && g.phase==="pushed" && <span style={{fontSize:7,color:C.ok,background:"rgba(34,197,94,0.06)",padding:"1px 5px",borderRadius:3}}>pushed ✓</span>}
                      {ok && g.phase==="unchanged" && <span style={{fontSize:7,color:"#888",background:"rgba(136,136,136,0.06)",padding:"1px 5px",borderRadius:3}}>tag current</span>}
                    </div>
                    {g.message && ok && <div style={{paddingLeft:5,marginTop:3}}><span style={{fontSize:7.5,color:C.dim}}>{g.message}</span></div>}
                    {run && <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"rgba(234,179,8,0.15)",overflow:"hidden"}}>
                      <div style={{width:"40%",height:"100%",background:C.warn,borderRadius:1,animation:"slide 1.5s ease-in-out infinite"}}/>
                    </div>}
                  </div>;
                })}
              </div>
            </div>}

            {vStep==="build" && showStepViz && !viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:600,color:"#999"}}>⚙ Image Check — ECR + Jenkins Monitor</span>
                {(() => {
                  const bs = buildStatuses||[];
                  const done = bs.filter(b=>b.status!=="running").length;
                  const tot = bs.length;
                  const existed = bs.filter(b=>b.phase==="exists").length;
                  const built = bs.filter(b=>b.phase==="jenkins_built").length;
                  const allOk = tot>0 && done===tot && bs.every(b=>b.status==="success");
                  return tot > 0 ? <><span style={{fontSize:8,color:allOk?C.ok:done<tot?C.warn:"#888"}}>{done}/{tot} complete</span>{done===tot && <span style={{fontSize:7.5,color:C.dim,marginLeft:2}}>({existed} exists, {built} via Jenkins)</span>}</> : null;
                })()}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:6}}>
                {(buildStatuses||[]).map(b => {
                  const ok = b.status==="success";
                  const fail = b.status==="failed";
                  const run = b.status==="running";
                  const existed = b.phase==="exists";
                  const jenkinsBuilt = b.phase==="jenkins_built";
                  const building = b.phase==="building"||b.phase==="monitoring";
                  const bc = ok?C.ok:fail?C.err:C.warn;
                  const stages = b.stages||[];
                  const jUrl = b.jenkins_url||"";
                  return <div key={b.name} style={{padding:"9px 11px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingLeft:5}}>
                      <div style={{fontSize:10,fontWeight:600,color:"#ddd",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:6}}>{b.name}</div>
                      <span style={{flexShrink:0,display:"inline-flex",alignItems:"center",gap:5}}>
                        {jUrl && <a href={jUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:7.5,color:C.blu,textDecoration:"none",opacity:0.8}} title="Open Jenkins build">⚙ Jenkins</a>}
                        {ok && <span style={{color:C.ok,fontSize:11}}>✓</span>}
                        {fail && <span style={{color:C.err,fontSize:11}}>✕</span>}
                        {run && <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16}}>
                          <span style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${C.warn}`,animation:"ripple 1.8s ease-out infinite",pointerEvents:"none"}}/>
                          <Spinner size={12}/>
                        </span>}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:4,paddingLeft:5,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:8.5,fontWeight:600,color:bc,background:`${bc}14`,padding:"1px 7px",borderRadius:3}}>{ok?(existed?"● Image Exists":jenkinsBuilt?"● Jenkins → ECR":"● Built"):fail?(b.phase==="missing_noop"?"⚠ ECR Missing":"▼ Failed"):building?"◐ Jenkins Building...":"◐ Checking ECR"}</span>
                      {b.tag && <span style={{fontSize:8,color:C.blu}}>{b.tag}</span>}
                    </div>
                    {/* Jenkins stage progress (streaming) */}
                    {stages.length > 0 && (run || fail) && <div style={{paddingLeft:5,marginTop:5,display:"flex",gap:3,flexWrap:"wrap"}}>
                      {stages.map(s => {
                        const sok = s.status==="success";
                        const sfail = s.status==="failed";
                        const srun = s.status==="in_progress";
                        const sc = sok?"rgba(34,197,94,0.7)":sfail?"rgba(239,68,68,0.7)":srun?"rgba(234,179,8,0.7)":"#555";
                        return <span key={s.id} style={{fontSize:7,padding:"1px 5px",borderRadius:3,border:`1px solid ${sc}33`,color:sc,background:`${sc}08`}}>
                          {sok?"✓":sfail?"✕":srun?"◐":"○"} {s.name}{s.duration&&s.duration!=="—"?` ${s.duration}`:""}
                        </span>;
                      })}
                    </div>}
                    {/* Message line */}
                    {b.message && (run || fail) && <div style={{paddingLeft:5,marginTop:3,fontSize:7.5,color:fail?"#c66":"#777",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.message}</div>}
                    {run && <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"rgba(234,179,8,0.15)",overflow:"hidden"}}>
                      <div style={{width:"40%",height:"100%",background:C.warn,borderRadius:1,animation:"slide 1.5s ease-in-out infinite"}}/>
                    </div>}
                  </div>;
                })}
              </div>
              {/* Slack failure notification for build */}
              {(buildStatuses||[]).length > 0 && (buildStatuses||[]).every(b=>b.status!=="running") && (buildStatuses||[]).some(b=>b.status==="failed") && <div style={{marginTop:10,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:C.err}}>❌ BUILD FAILED</span></div>
                <div style={{borderLeft:`3px solid ${C.err}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:C.err,marginBottom:5}}>❌ Image Check Failed — {(buildStatuses||[]).filter(b=>b.status==="failed").length}/{(buildStatuses||[]).length} failed</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {(buildStatuses||[]).filter(b=>b.status==="failed").map(b => <span key={b.name} style={{fontSize:8.5,padding:"2px 7px",borderRadius:3,background:"rgba(239,68,68,0.04)",color:C.err,border:"1px solid rgba(239,68,68,0.08)"}}>✕ {b.name}{b.jenkins_url && <a href={b.jenkins_url} target="_blank" rel="noopener noreferrer" style={{color:C.blu,marginLeft:4,fontSize:7}}>⚙ build</a>}</span>)}
                  </div>
                </div>
              </div>}
            </div>}

            {vStep==="jenkins" && showStepViz && !viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:600,color:"#999"}}>⚡ Jenkins QA Jobs</span>
                {(() => {
                  const done = (jenkinsJobs||[]).filter(j=>j.status!=="running").length;
                  const tot = (jenkinsJobs||[]).length;
                  const allOk = tot>0 && done===tot && (jenkinsJobs||[]).every(j=>j.status==="success");
                  return tot > 0 ? <span style={{fontSize:8,color:allOk?C.ok:done<tot?C.warn:"#888"}}>{done}/{tot} complete</span> : null;
                })()}
              </div>
              <div style={{display:"flex",gap:7}}>
                {(jenkinsJobs||[]).map(j => {
                  const ok = j.status==="success";
                  const fail = j.status==="failed";
                  const run = j.status==="running" || j.status==="in_progress";
                  const bc = ok?C.ok:fail?C.err:C.warn;
                  const stages = j.stages || [];
                  const pipeStages = stages.filter(s=>s.id!=="q");
                  const queueStage = stages.find(s=>s.id==="q");
                  const doneStages = pipeStages.filter(s=>s.status==="success"||s.status==="failed");
                  const activeStage = pipeStages.find(s=>s.status==="in_progress");
                  const phase = j.phase || "";
                  const phaseDetail = j.phase_detail || "";
                  const isQueued = phase === "queued";
                  const isExec = phase === "executing";
                  return <div key={j.name} style={{flex:1,padding:"12px 14px",borderRadius:7,background:ok?"rgba(34,197,94,0.03)":fail?"rgba(239,68,68,0.03)":"rgba(234,179,8,0.03)",border:`1px solid ${ok?"rgba(34,197,94,0.12)":fail?"rgba(239,68,68,0.12)":"rgba(234,179,8,0.12)"}`,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:bc,borderRadius:"7px 0 0 7px"}}/>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,paddingLeft:5}}>
                      {ok && <span style={{color:C.ok,fontSize:12}}>✓</span>}
                      {fail && <span style={{color:C.err,fontSize:12}}>✕</span>}
                      {run && <span style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18}}>
                        <span style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${isQueued?"#666":C.warn}`,animation:"ripple 1.8s ease-out infinite",pointerEvents:"none"}}/>
                        <span style={{position:"absolute",inset:0,borderRadius:"50%",border:`2px solid ${isQueued?"#666":C.warn}`,animation:"ripple 1.8s ease-out infinite .5s",pointerEvents:"none"}}/>
                        <Spinner size={14}/>
                      </span>}
                      <span style={{fontSize:11,fontWeight:600,color:"#ddd"}}>{j.label}</span>
                      {j.url && <a href={j.url} target="_blank" rel="noopener noreferrer" style={{fontSize:8,color:C.blu,textDecoration:"none",marginLeft:"auto"}}>#{j.build_num} ↗</a>}
                    </div>
                    <div style={{paddingLeft:5}}>
                      {/* Phase badge row */}
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
                        <span style={{fontSize:8.5,fontWeight:600,color:ok?C.ok:fail?C.err:isQueued?"#888":bc,background:`${ok?C.ok:fail?C.err:isQueued?"#888":bc}14`,padding:"1px 7px",borderRadius:3}}>
                          {ok?"● Passed":fail?"▼ Failed":isQueued?"◉ Queued":"◐ Running"}
                        </span>
                        {!j.url && j.build_num > 0 && <span style={{fontSize:8,color:C.blu}}>#{j.build_num}</span>}
                        {j.duration && j.duration !== "\u2014" && <span style={{fontSize:8,color:C.dim}}>{j.duration}</span>}
                        {run && pipeStages.length>0 && isExec && <span style={{fontSize:8,color:"#666"}}>{doneStages.length}/{pipeStages.length} stages</span>}
                      </div>
                      {/* Queue status banner */}
                      {run && isQueued && <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",marginBottom:6,borderRadius:4,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.04)"}}>
                        <span style={{fontSize:10}}>⏳</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:9,fontWeight:600,color:"#aaa"}}>Waiting in Jenkins Queue</div>
                          {phaseDetail && <div style={{fontSize:8,color:"#666",marginTop:1}}>{phaseDetail}</div>}
                        </div>
                        {queueStage && queueStage.duration && <span style={{fontSize:9,fontWeight:600,color:C.warn,fontVariantNumeric:"tabular-nums"}}>{queueStage.duration}</span>}
                      </div>}
                      {/* Queue + Exec timing summary */}
                      {(j.queue_duration || j.exec_duration) && <div style={{display:"flex",gap:10,marginBottom:5}}>
                        {j.queue_duration && <div style={{fontSize:7.5,color:"#555"}}>
                          <span style={{color:"#777",fontWeight:600}}>Queue:</span> {j.queue_duration}
                        </div>}
                        {j.exec_duration && <div style={{fontSize:7.5,color:"#555"}}>
                          <span style={{color:"#777",fontWeight:600}}>Exec:</span> {j.exec_duration}
                        </div>}
                      </div>}
                      {/* Pipeline stages */}
                      {pipeStages.length > 0 && <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        {pipeStages.map((s,si) => {
                          const sOk = s.status==="success";
                          const sFail = s.status==="failed";
                          const sRun = s.status==="in_progress";
                          const sColor = sOk?C.ok:sFail?C.err:sRun?C.warn:"#333";
                          return <div key={s.id||si} style={{display:"flex",alignItems:"center",gap:5,padding:"1px 0"}}>
                            <span style={{width:10,textAlign:"center",fontSize:8,color:sColor}}>{sOk?"✓":sFail?"✕":sRun?"►":"·"}</span>
                            <span style={{fontSize:8,color:sRun?"#ccc":sOk?"#777":sFail?"#c66":"#444",fontWeight:sRun?600:400}}>{s.name}</span>
                            {(sOk||sFail) && s.duration && s.duration!=="—" && <span style={{fontSize:7,color:"#444",marginLeft:"auto"}}>{s.duration}</span>}
                            {sRun && <span style={{marginLeft:"auto"}}><Spinner size={8}/></span>}
                          </div>;
                        })}
                      </div>}
                    </div>
                    {run && <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`rgba(${isQueued?"255,255,255":"234,179,8"},0.15)`,overflow:"hidden"}}>
                      <div style={{width:`${isQueued?100:pipeStages.length>0?Math.round(doneStages.length/pipeStages.length*100):40}%`,height:"100%",background:isQueued?"#555":C.warn,borderRadius:1,animation:isQueued||pipeStages.length>0?"none":"slide 1.5s ease-in-out infinite",transition:"width 0.5s ease"}}/>
                    </div>}
                  </div>;
                })}
              </div>
              {/* Slack notification preview after completion */}
              {(jenkinsJobs||[]).length > 0 && (jenkinsJobs||[]).every(j=>j.status!=="running") && <div style={{marginTop:10,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — {(() => { const allOk=(jenkinsJobs||[]).every(j=>j.status==="success"); return <>#{slackChannel} <span style={{color:allOk?C.ok:C.warn}}>{allOk?"✅ ALL PASSED":"⚠️ SOME FAILED"}</span></>; })()}</div>
                <div style={{borderLeft:`3px solid ${(jenkinsJobs||[]).every(j=>j.status==="success")?C.ok:C.warn}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:(jenkinsJobs||[]).every(j=>j.status==="success")?"#fff":C.warn,marginBottom:5}}>{(jenkinsJobs||[]).every(j=>j.status==="success")?"✅":"⚠️"} WAP+RESTAPI QA Jobs — {(jenkinsJobs||[]).every(j=>j.status==="success")?"All Passed":`${(jenkinsJobs||[]).filter(j=>j.status==="success").length}/${(jenkinsJobs||[]).length} Passed`}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {(jenkinsJobs||[]).map(j => {const ok=j.status==="success"; return <span key={j.name} style={{fontSize:8.5,padding:"2px 7px",borderRadius:3,background:ok?"rgba(34,197,94,0.04)":"rgba(239,68,68,0.04)",color:ok?C.ok:C.err,border:`1px solid ${ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)"}`}}>{ok?"✓":"✕"} {j.label} #{j.build_num} ({j.duration})</span>;})}
                  </div>
                </div>
              </div>}
            </div>}

            {vStep==="deploy" && showStepViz && !viewingPast && <div>
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:600,color:"#999"}}>⎎ Deploy Sync Status — ArgoCD gRPC-Web Watch</span>
                <span style={{fontSize:8,color:C.dim}}>ns: sportybet-ug</span>
                {running && <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:4,fontSize:8,color:C.ok,background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.1)"}}>
                  <Dot color={C.ok}/> gRPC Watch Active
                  <span style={{color:C.dim,fontVariantNumeric:"tabular-nums",marginLeft:2}}>{watchCount}</span>
                </div>}
                {paused && <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:4,fontSize:8,color:C.ok,background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.1)"}}>
                  <Dot color={C.ok}/> gRPC Watch Active
                  <span style={{color:C.dim,fontVariantNumeric:"tabular-nums",marginLeft:2}}>{watchCount}</span>
                </div>}
                <div style={{flex:1}}/>
                {retries > 0 && running && <span style={{fontSize:8,fontWeight:600,color:C.warn,background:"rgba(234,179,8,0.06)",padding:"2px 7px",borderRadius:3,border:"1px solid rgba(234,179,8,0.12)"}}>Retry {retries}/3</span>}
                {(() => {const sl=svcList; const hc=sl.filter(a=>(Object.keys(hMap).length ? (hMap[a]||"Healthy") : "Healthy")==="Healthy").length; return <span style={{fontSize:8,color:hc===sl.length?C.ok:C.warn}}>{hc}/{sl.length} healthy</span>;})()}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:4}}>
                {(deployApps.length > 0 ? deployApps : svcList.map(a => ({name:a, health:hMap[a]||"Progressing", sync:"OutOfSync", tag:""}))).map(a => {
                  const name = a.name || a;
                  const h = a.health || (hMap[name]||"Progressing");
                  const syncSt = a.sync || "OutOfSync";
                  const tag = a.tag || "";
                  const expTag = (expectedTags||{})[name] || (buildStatuses||[]).find(b => b.name === name)?.tag || "";
                  const ok = h==="Healthy", bad = h==="Degraded", susp = h==="Suspended";
                  const synced = syncSt==="Synced";
                  const hc = ok?C.ok:bad?C.err:susp?"#9ca3af":C.warn;
                  const hEmoji = ok?"💚":bad?"💔":susp?"🩶":null;
                  const hLabel = ok?"Healthy":bad?"Degraded":susp?"Suspended":"Progressing";
                  const hIcon = ok?"●":bad?"▼":susp?"◼":"◐";
                  return <div key={name} style={{position:"relative",padding:"7px 9px",borderRadius:6,background:"rgba(255,255,255,0.018)",border:`1px solid ${C.bdr}`,overflow:"hidden"}}>
                    <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:hc,borderRadius:"6px 0 0 6px"}}/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3,paddingLeft:6}}>
                      <span style={{fontSize:10.5,fontWeight:600,color:"#d4d4d8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,marginRight:5,maxWidth:140}}>{name}</span>
                      {a.is_init && <span style={{fontSize:6.5,fontWeight:700,letterSpacing:".5px",color:C.agent,background:"rgba(167,139,250,0.08)",padding:"1px 5px",borderRadius:3,marginRight:3,border:"1px solid rgba(167,139,250,0.15)"}}>INIT</span>}
                      <span style={{fontSize:7,fontWeight:600,letterSpacing:".5px",color:"#555",background:"rgba(255,255,255,0.03)",padding:"1px 4px",borderRadius:3,marginRight:5}}>staging-ug</span>
                      <span style={{flexShrink:0,display:"inline-flex",alignItems:"center"}}>
                        {hEmoji?<span style={{fontSize:14,lineHeight:1,display:"inline-block",...(ok?{animation:"heartRipple 2.5s ease-in-out infinite"}:{})}}>{hEmoji}</span>:<div style={{width:10,height:10,borderRadius:"50%",background:C.warn,boxShadow:`0 0 8px ${C.warn}80`,animation:"pulse 1s ease-in-out infinite",flexShrink:0}}/>}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:3,paddingLeft:6,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:600,color:hc,background:`${hc}14`,padding:"1px 6px",borderRadius:3}}><span style={{fontSize:5}}>{hIcon}</span> {hLabel}</span>
                      <span style={{fontSize:9,fontWeight:500,color:synced?C.ok:"#f97316",background:`${synced?C.ok:"#f97316"}14`,padding:"1px 6px",borderRadius:3}}>{synced?"Synced":"OutOfSync"}</span>
                      {a.op && <span style={{fontSize:7.5,color:C.warn}}>⟳ {a.op}</span>}
                      {bad && retries>=3 && <span style={{fontSize:7,color:C.err,background:"rgba(239,68,68,0.06)",padding:"1px 4px",borderRadius:3}}>3/3 failed</span>}
                    </div>
                    {a.hpa && (
                      <div style={{display:"flex",alignItems:"center",gap:4,paddingLeft:6,marginTop:2}}>
                        <span style={{fontSize:7,fontWeight:700,letterSpacing:".7px",textTransform:"uppercase",padding:"1px 5px",borderRadius:3,color:a.hpa.cur!==a.hpa.des?C.warn:C.blu,background:a.hpa.cur!==a.hpa.des?"rgba(234,179,8,0.08)":"rgba(96,165,250,0.06)",border:`1px solid ${a.hpa.cur!==a.hpa.des?"rgba(234,179,8,0.15)":"rgba(96,165,250,0.12)"}`}}>HPA</span>
                        <div style={{flex:1,height:4,borderRadius:2,background:"rgba(255,255,255,0.04)",position:"relative",overflow:"hidden",maxWidth:60}}>
                          <div style={{position:"absolute",left:0,top:0,height:"100%",borderRadius:2,transition:"width .6s ease",width:`${Math.min(100,(a.hpa.cur/Math.max(a.hpa.max,1))*100)}%`,background:a.hpa.cur>=a.hpa.max?C.warn:a.hpa.cur>a.hpa.max*0.7?"linear-gradient(90deg,#22c55e,#eab308)":C.ok}}/>
                        </div>
                        <span style={{fontSize:7.5,fontWeight:600,color:"#999",fontVariantNumeric:"tabular-nums"}}>{a.hpa.cur}<span style={{color:"#555"}}>/</span>{a.hpa.max}</span>
                        {a.hpa.cur!==a.hpa.des && <span style={{fontSize:7,color:C.warn,display:"inline-flex",alignItems:"center",gap:2}}>⟳ →{a.hpa.des}</span>}
                      </div>
                    )}
                    <div style={{display:"flex",flexDirection:"column",gap:1,paddingLeft:6,marginTop:3}}>
                      {expTag && <span style={{fontSize:7.5,color:"#888"}}>expected: <span style={{color:C.blu,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block",maxWidth:150,verticalAlign:"bottom"}}>{expTag}</span></span>}
                      {tag && <span style={{fontSize:7.5,color:"#888"}}>current: <span style={{color:tag===expTag?C.ok:C.warn,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block",maxWidth:150,verticalAlign:"bottom"}}>{tag}</span>{tag===expTag && <span style={{color:C.ok,marginLeft:3}}>✓</span>}{tag && expTag && tag!==expTag && <span style={{color:C.err,marginLeft:3}}>✕</span>}</span>}
                      {!tag && !expTag && a.rev && <span style={{fontSize:7,color:"#555"}}>@{a.rev}</span>}
                    </div>
                  </div>;
                })}
              </div>

              {slackSent && active?.steps?.deploy!=="success" && (() => { const hCnt=svcList.filter(a=>hMap[a]==="Healthy"||!hMap[a]).length; const dCnt=svcList.length-hCnt; return <div style={{marginTop:8,padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:C.warn}}>⚠️ DEGRADED</span></div>
                <div style={{borderLeft:`3px solid ${C.warn}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                  <div style={{fontSize:10.5,fontWeight:700,color:C.warn,marginBottom:3}}>⚠️ Deploy pre-release-tw — {hCnt}/{svcList.length} Healthy, {dCnt} Degraded</div>
                  <div style={{fontSize:9,color:"#555",marginBottom:5}}>cc {(roster?.oncall||"").split(/\s+/).filter(Boolean).map((n,i) => <span key={i} style={{color:C.blu,fontWeight:600,marginRight:4}}>{n}</span>)} <span style={{color:C.warn,fontWeight:600}}>{roster?.escalation||""}</span></div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>
                    {svcList.map(a => {const b=hMap[a]&&hMap[a]!=="Healthy"; return <span key={a} style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:b?"rgba(239,68,68,0.04)":"rgba(34,197,94,0.04)",color:b?C.err:C.ok,border:`1px solid ${b?"rgba(239,68,68,0.08)":"rgba(34,197,94,0.08)"}`}}>{b?"💔":"💚"} {a}</span>;})}
                  </div>
                  <div style={{borderTop:`1px solid ${C.bdr}`,paddingTop:5,fontSize:8.5,color:"#555"}}>
                    <div style={{color:"#444",lineHeight:1.5}}>Retries exhausted · Waiting for manual intervention</div>
                  </div>
                </div>
              </div>; })()}

              {paused && pauseStep==="deploy" && <div style={{marginTop:10,padding:"10px 12px",borderRadius:7,background:"rgba(234,179,8,0.04)",border:"1px solid rgba(234,179,8,0.12)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,fontWeight:600,color:C.warn,marginBottom:1}}>⏸ Pipeline Paused — Deploy Failed</div>
                    <div style={{fontSize:8.5,color:C.dim,whiteSpace:"pre-wrap"}}>{pauseError || "Deploy step failed. Waiting for user action."}</div>
                    {watchCount > 0 && <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4,fontSize:8,color:C.ok}}><Dot color={C.ok}/> gRPC watch active · <span style={{fontVariantNumeric:"tabular-nums",color:C.warn}}>{watchCount} events</span></div>}
                  </div>
                  <button onClick={() => onRollback?.()} style={{padding:"6px 14px",fontSize:9.5,fontWeight:700,fontFamily:F,cursor:"pointer",background:"rgba(255,140,0,0.08)",border:"1px solid rgba(255,140,0,0.25)",borderRadius:5,color:"#ff8c00"}}>↩ Rollback</button>
                  <button onClick={() => onRetry?.()} style={{padding:"6px 14px",fontSize:9.5,fontWeight:600,fontFamily:F,cursor:"pointer",background:"rgba(96,165,250,0.08)",border:"1px solid rgba(96,165,250,0.2)",borderRadius:5,color:C.blu}}>⟳ Retry</button>
                  <button onClick={() => onForceProceed?.()} style={{padding:"6px 14px",fontSize:9.5,fontWeight:600,fontFamily:F,cursor:"pointer",background:"rgba(234,179,8,0.08)",border:"1px solid rgba(234,179,8,0.2)",borderRadius:5,color:C.warn}}>▶ Force Proceed</button>
                  <button onClick={() => setShowAbortConfirm(true)} style={{padding:"6px 14px",fontSize:9.5,fontWeight:700,fontFamily:F,cursor:"pointer",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:5,color:C.err}}>✕ Abort</button>
                </div>
              </div>}

              {/* CEN-PE Action Proposals (deploy step only) */}
              {pauseStep==="deploy" && (proposedActions||[]).length > 0 && <div style={{marginTop:10,padding:"10px 12px",borderRadius:7,background:"rgba(167,139,250,0.04)",border:"1px solid rgba(167,139,250,0.12)"}}>
                <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.agent,marginBottom:8}}>CEN-PE Action Proposals</div>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  {(proposedActions||[]).map(a => {
                    const conf = a.confidence || 0;
                    const confColor = conf >= 80 ? C.ok : conf >= 50 ? C.warn : C.err;
                    const stColor = a.status==="done" ? C.ok : a.status==="failed" ? C.err : a.status==="executing"||a.status==="auto_executing" ? C.warn : a.status==="skipped" ? C.dim : "#888";
                    const stLabel = a.status==="done" ? "DONE" : a.status==="failed" ? "FAILED" : a.status==="executing"||a.status==="auto_executing" ? "EXECUTING" : a.status==="skipped" ? "SKIPPED" : "PROPOSED";
                    const isAuto = a.status==="done" && a.result;
                    return <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:5,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.bdr}`}}>
                      <span style={{fontSize:9,fontWeight:700,color:confColor,minWidth:32,textAlign:"right"}}>[{conf}%]</span>
                      <span style={{fontSize:9,fontWeight:600,color:"#ccc",minWidth:70}}>{a.action}</span>
                      <span style={{fontSize:8.5,color:C.blu}}>→ {a.target}</span>
                      <span style={{fontSize:8,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>"{a.reason}"</span>
                      <Badge color={stColor}>{stLabel}</Badge>
                      {(a.status==="executing"||a.status==="auto_executing") && <Spinner size={12} color={C.warn}/>}
                      {a.status==="proposed" && <>
                        <button onClick={() => onApproveAction?.(a.id)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 7px",borderRadius:3,background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.15)",color:C.ok}}>Approve</button>
                        <button onClick={() => onSkipAction?.(a.id)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 7px",borderRadius:3,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.bdr}`,color:"#666"}}>Skip</button>
                      </>}
                      {a.result && <span style={{fontSize:7.5,color:a.status==="done"?C.ok:C.err,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={a.result}>{a.result}</span>}
                    </div>;
                  })}
                </div>
              </div>}

              {/* CEN-PE Diagnostics summary */}
              {diagnostics && diagnostics.length > 0 && pauseStep==="deploy" && <div style={{marginTop:10,padding:"10px 12px",borderRadius:7,background:"rgba(167,139,250,0.03)",border:"1px solid rgba(167,139,250,0.1)"}}>
                <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.agent,marginBottom:6}}>CEN-PE Diagnostics</div>
                <div style={{fontSize:9,color:"#999",lineHeight:1.6,whiteSpace:"pre-wrap",maxHeight:120,overflowY:"auto",fontFamily:F}}>{diagnostics.length > 500 ? diagnostics.slice(0,500)+"…" : diagnostics}</div>
              </div>}

              {/* Predictive Forecast Alerts */}
              {(forecasts||[]).length > 0 && <div style={{marginTop:10,padding:"10px 12px",borderRadius:7,background:"rgba(234,179,8,0.03)",border:"1px solid rgba(234,179,8,0.1)"}}>
                <div style={{fontSize:8,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.warn,marginBottom:8}}>Predictive Alerts ({(forecasts||[]).length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(forecasts||[]).map((f, i) => {
                    const arrow = f.trend==="rising" ? "↑" : f.trend==="falling" ? "↓" : "→";
                    const riskColor = f.risk_level==="critical" ? C.err : f.risk_level==="high" ? C.err : f.risk_level==="medium" ? C.warn : C.ok;
                    const riskLabel = (f.risk_level||"").toUpperCase();
                    return <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px",borderRadius:4,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.bdr}`}}>
                      <span style={{fontSize:11,color:riskColor}}>{arrow}</span>
                      <span style={{fontSize:9,fontWeight:600,color:"#ccc",minWidth:80}}>{f.service}</span>
                      <Badge color={riskColor}>{riskLabel}</Badge>
                      <span style={{fontSize:8.5,color:"#888",flex:1}}>{f.message}</span>
                      <span style={{fontSize:8,color:C.dim,fontVariantNumeric:"tabular-nums"}}>{f.current}% → {f.predicted_30m}%</span>
                    </div>;
                  })}
                </div>
              </div>}

              {/* Slack success */}
              {!paused && active?.steps?.deploy==="success" && <div>
                <div style={{marginTop:8,padding:"6px 10px",borderRadius:4,background:"rgba(34,197,94,0.03)",border:"1px solid rgba(34,197,94,0.08)",fontSize:10,color:C.ok,marginBottom:8}}>💚 All {svcList.length} apps healthy — ArgoCD sync complete</div>
                <div style={{padding:"8px 10px",borderRadius:5,background:"rgba(255,255,255,0.01)",border:`1px solid ${C.bdr}`,marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut}}>Shift Roster</div>
                    <button onClick={() => setShowRoster(true)} style={{fontSize:7.5,fontFamily:F,cursor:"pointer",padding:"2px 7px",borderRadius:3,background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.1)",color:C.blu}}>✎ Configure</button>
                  </div>
                  <div style={{display:"flex",gap:16,fontSize:9}}>
                    <div><span style={{color:"#555"}}>Shift:</span> <span style={{color:"#aaa",fontWeight:600}}>{roster?.shift||"—"}</span></div>
                    <div><span style={{color:"#555"}}>On-Call:</span> <span style={{color:C.blu}}>{roster?.oncall||"—"}</span></div>
                    <div><span style={{color:"#555"}}>Escalation:</span> <span style={{color:C.warn}}>{roster?.escalation||"—"}</span></div>
                  </div>
                </div>
                <div style={{padding:"9px 11px",borderRadius:6,background:"#0a0a12",border:`1px solid ${C.bdr}`}}>
                  <div style={{fontSize:8,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:6}}>Slack — #{slackChannel} <span style={{color:C.ok}}>✅ HEALTHY</span></div>
                  <div style={{borderLeft:`3px solid ${C.ok}`,padding:"8px 10px",background:"rgba(255,255,255,0.01)",borderRadius:"0 5px 5px 0"}}>
                    <div style={{fontSize:10.5,fontWeight:700,color:"#fff",marginBottom:3}}>✅ Deploy pre-release-tw — {svcList.length}/{svcList.length} Healthy</div>
                    <div style={{fontSize:9,color:"#555",marginBottom:5}}>cc {(roster?.oncall||"").split(/\s+/).filter(Boolean).map(n => <span key={n} style={{color:C.blu,fontWeight:600,marginRight:4}}>{n}</span>)}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {svcList.map(a => <span key={a} style={{fontSize:8,padding:"1px 5px",borderRadius:3,background:"rgba(34,197,94,0.04)",color:C.ok,border:"1px solid rgba(34,197,94,0.08)"}}>💚 {a}</span>)}
                    </div>
                  </div>
                </div>
              </div>}
            </div>}
          </div>

          {/* Pipeline Completion Banner — all outcomes */}
          {!running && !viewingPast && active && (active.st === "success" || active.st === "degraded" || active.st === "failed") && (() => {
            const st = active.st;
            const isSuccess = st === "success";
            const isDegraded = st === "degraded";
            const isFailed = st === "failed";
            const skippedSteps = STEPS.filter(s => active.steps?.[s.id] === "skipped");
            const failedSteps = STEPS.filter(s => active.steps?.[s.id] === "failed");
            const successSteps = STEPS.filter(s => active.steps?.[s.id] === "success");
            const hm = active.health_map || healthMap || {};
            const svcs = Object.keys(hm);
            const healthyCount = svcs.filter(s => hm[s] === "Healthy").length;
            const degradedSvcs = svcs.filter(s => hm[s] && hm[s] !== "Healthy");
            const accentColor = isSuccess ? C.ok : isDegraded ? C.warn : C.err;
            const accentRgb = isSuccess ? "34,197,94" : isDegraded ? "234,179,8" : "239,68,68";
            const icon = isSuccess ? "✓" : isDegraded ? "⚠" : "✕";
            const title = isSuccess ? "Pipeline Completed Successfully"
              : isDegraded ? "Pipeline Completed — Degraded"
              : "Pipeline Aborted";

            return <div style={{animation:"completeBanner .5s ease-out",display:"flex",flexDirection:"column",alignItems:"center",flex:1,minHeight:280,padding:"40px 20px",position:"relative",overflowY:"auto",overflowX:"hidden"}}>
              {/* Background glow */}
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:320,height:320,borderRadius:"50%",background:`radial-gradient(circle, rgba(${accentRgb},0.08) 0%, rgba(${accentRgb},0.02) 50%, transparent 70%)`,pointerEvents:"none"}}/>
              {isSuccess && <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle, rgba(${accentRgb},0.05) 0%, transparent 70%)`,animation:"ripple 2s ease-out infinite",pointerEvents:"none"}}/>}

              {/* Icon circle */}
              <div style={{width:56,height:56,borderRadius:"50%",background:`rgba(${accentRgb},0.08)`,border:`2px solid ${accentColor}`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,position:"relative",boxShadow:`0 0 30px rgba(${accentRgb},0.15), 0 0 60px rgba(${accentRgb},0.05)`}}>
                <span style={{fontSize:26,lineHeight:1}}>{icon}</span>
              </div>

              {/* Run number */}
              <div style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"-0.5px",marginBottom:4,fontFamily:F}}>Run #{active.n}</div>

              {/* Status message */}
              <div style={{fontSize:13,fontWeight:600,color:accentColor,marginBottom:4,letterSpacing:"0.5px"}}>{title}</div>

              {/* Duration + timestamp */}
              <div style={{fontSize:10,color:"#666",marginBottom:16,display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
                <span><span style={{color:"#888"}}>Duration</span> <span style={{color:"#ccc",fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{active.dur || "\u2014"}</span></span>
                <span style={{color:"#333"}}>·</span>
                <span><span style={{color:"#888"}}>Started</span> <span style={{color:"#aaa"}}>{active.t}</span></span>
                {active.by ? <><span style={{color:"#333"}}>·</span><span><span style={{color:"#888"}}>by</span> <span style={{color:"#a78bfa"}}>{active.by}</span></span></> : null}
              </div>

              {/* Health bar — compact visual (for runs that had deploy step) */}
              {svcs.length > 0 && <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16,padding:"6px 14px",borderRadius:6,background:`rgba(${accentRgb},0.03)`,border:`1px solid rgba(${accentRgb},0.1)`}}>
                <div style={{display:"flex",gap:1,height:6,borderRadius:3,overflow:"hidden",flex:1,maxWidth:200}}>
                  {svcs.map(s => <div key={s} style={{flex:1,background:hm[s]==="Healthy"?C.ok:hm[s]==="Progressing"?C.warn:hm[s]==="Degraded"||hm[s]==="Missing"?C.err:"#555",transition:"background .3s"}}/>)}
                </div>
                <span style={{fontSize:9,fontWeight:600,color:healthyCount===svcs.length?C.ok:degradedSvcs.length>0?C.warn:"#888",fontVariantNumeric:"tabular-nums"}}>{healthyCount}/{svcs.length} healthy</span>
              </div>}

              {/* Step badges */}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center",marginBottom:20}}>
                {STEPS.map((s,i) => {
                  const stepSt = active.steps?.[s.id];
                  const col = stepSt==="success" ? C.ok : stepSt==="failed" ? C.err : stepSt==="skipped" ? C.blu : "#555";
                  const ico = stepSt==="success" ? "✓" : stepSt==="failed" ? "✕" : stepSt==="skipped" ? "⏭" : "—";
                  const bg = stepSt==="success" ? "rgba(34,197,94,0.05)" : stepSt==="failed" ? "rgba(239,68,68,0.05)" : stepSt==="skipped" ? "rgba(96,165,250,0.05)" : "rgba(255,255,255,0.02)";
                  const bdr = stepSt==="success" ? "rgba(34,197,94,0.12)" : stepSt==="failed" ? "rgba(239,68,68,0.12)" : stepSt==="skipped" ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.06)";
                  const txtCol = stepSt==="success" ? "#8fd4a8" : stepSt==="failed" ? "#f09090" : stepSt==="skipped" ? "#7ab0e8" : "#666";
                  return <div key={s.id} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,background:bg,border:`1px solid ${bdr}`,animation:`completeBanner ${0.4+i*0.08}s ease-out`}}>
                    <span style={{fontSize:10,color:col}}>{ico}</span>
                    <span style={{fontSize:9,fontWeight:500,color:txtCol,fontFamily:F}}>{s.l}</span>
                  </div>;
                })}
              </div>

              {/* Run Timeline */}
              {active.step_times && Object.keys(active.step_times).length > 0 && <div style={{width:"100%",maxWidth:420,marginBottom:20,padding:"12px 16px",borderRadius:6,background:"rgba(255,255,255,0.015)",border:`1px solid ${C.bdr}`}}>
                <div style={{fontSize:7.5,fontWeight:700,letterSpacing:"1.5px",textTransform:"uppercase",color:"#555",marginBottom:10}}>Run Timeline</div>
                {STEPS.map((s,i) => {
                  const t = active.step_times?.[s.id];
                  if (!t) return null;
                  const col = t.status==="success" ? C.ok : t.status==="failed" ? C.err : t.status==="skipped" ? C.blu : "#555";
                  return <div key={s.id}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:8,color:"#555",fontVariantNumeric:"tabular-nums",width:50,textAlign:"right",flexShrink:0}}>{t.start}</span>
                      <div style={{width:8,height:8,borderRadius:"50%",background:col,boxShadow:`0 0 6px ${col}50`,flexShrink:0}}/>
                      <span style={{fontSize:9,fontWeight:500,color:"#aaa",flex:1}}>{s.l}</span>
                      <span style={{fontSize:9,fontWeight:600,color:col,fontVariantNumeric:"tabular-nums"}}>{t.dur}</span>
                    </div>
                    {i < STEPS.length - 1 && active.step_times?.[STEPS[i+1]?.id] && <div style={{marginLeft:54,width:1,height:12,background:"rgba(255,255,255,0.06)"}}/>}
                  </div>;
                })}
              </div>}

              {/* Propagation Stats */}
              {active.propagation_stats?.length > 0 && (() => {
                const healthy = active.propagation_stats.filter(p => p.push_to_healthy_secs > 0);
                if (healthy.length === 0) return null;
                const times = healthy.map(p => p.push_to_healthy_secs);
                const avg = (times.reduce((a,b)=>a+b,0)/times.length).toFixed(1);
                const mn = Math.min(...times).toFixed(1);
                const mx = Math.max(...times).toFixed(1);
                return <div style={{width:"100%",maxWidth:420,marginBottom:12,padding:"8px 14px",borderRadius:5,background:"rgba(96,165,250,0.03)",border:"1px solid rgba(96,165,250,0.08)"}}>
                  <div style={{fontSize:7.5,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.blu,marginBottom:6}}>Image Propagation</div>
                  <div style={{fontSize:9,color:"#888",marginBottom:6}}>Push→Healthy: <span style={{color:"#ccc",fontWeight:600}}>avg {avg}s</span> · <span style={{color:C.ok}}>min {mn}s</span> · <span style={{color:C.warn}}>max {mx}s</span></div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {active.propagation_stats.map(p => {
                      const ok = p.push_to_healthy_secs > 0;
                      const val = ok ? `${p.push_to_healthy_secs}s` : p.status;
                      const c = ok ? C.ok : C.err;
                      return <span key={p.service} style={{fontSize:8,padding:"1px 6px",borderRadius:3,color:c,background:`${c}08`,border:`1px solid ${c}12`}}>{p.service}: {val}</span>;
                    })}
                  </div>
                </div>;
              })()}

              {/* MTTR */}
              {active.mttr_secs > 0 && <div style={{marginBottom:12,padding:"5px 14px",borderRadius:4,background:"rgba(234,179,8,0.04)",border:"1px solid rgba(234,179,8,0.1)"}}>
                <span style={{fontSize:8,fontWeight:700,letterSpacing:"1px",color:C.warn}}>MTTR: </span>
                <span style={{fontSize:9,fontWeight:600,color:"#ccc",fontVariantNumeric:"tabular-nums"}}>{active.mttr_secs >= 60 ? `${Math.floor(active.mttr_secs/60)}m${Math.floor(active.mttr_secs%60).toString().padStart(2,"0")}s` : `${Math.round(active.mttr_secs)}s`}</span>
              </div>}

              {/* Services with health status */}
              {svcs.length > 0 && <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"center",maxWidth:500,marginBottom:12}}>
                {svcs.map((a,i) => {
                  const h = hm[a];
                  const ok = h === "Healthy";
                  const sc = ok ? C.ok : C.err;
                  const sbg = ok ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)";
                  const sbdr = ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
                  return <span key={a} style={{fontSize:8,padding:"2px 8px",borderRadius:4,color:sc,background:sbg,border:`1px solid ${sbdr}`,animation:`completeBanner ${0.6+i*0.05}s ease-out`}}>{ok ? "💚" : "💔"} {a}</span>;
                })}
              </div>}

              {/* Degraded details */}
              {isDegraded && degradedSvcs.length > 0 && <div style={{marginTop:4,fontSize:9,color:"#888",textAlign:"center",maxWidth:400}}>
                <span style={{color:C.warn,fontWeight:600}}>{degradedSvcs.length}</span> service{degradedSvcs.length>1?"s":""} degraded: <span style={{color:"#aaa"}}>{degradedSvcs.join(", ")}</span>
              </div>}

              {/* Failed step detail */}
              {isFailed && failedSteps.length > 0 && <div style={{marginTop:4,fontSize:9,color:"#888",textAlign:"center"}}>
                Failed at: <span style={{color:C.err,fontWeight:600}}>{failedSteps.map(s=>s.l).join(", ")}</span>
              </div>}

              {/* Skipped note */}
              {skippedSteps.length > 0 && <div style={{marginTop:12,fontSize:8.5,color:"#555",display:"flex",alignItems:"center",gap:4}}>
                <span style={{color:C.blu}}>ℹ</span> {skippedSteps.map(s=>s.l).join(", ")} skipped
              </div>}

              {/* Brief diagnostics excerpt (degraded/failed) */}
              {!isSuccess && diagnostics && diagnostics.length > 0 && <div style={{marginTop:12,padding:"8px 12px",borderRadius:5,background:"rgba(167,139,250,0.03)",border:"1px solid rgba(167,139,250,0.08)",maxWidth:460,width:"100%"}}>
                <div style={{fontSize:7.5,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:C.agent,marginBottom:4}}>CEN-PE Diagnostics</div>
                <div style={{fontSize:8.5,color:"#777",lineHeight:1.5,whiteSpace:"pre-wrap",maxHeight:60,overflowY:"auto",fontFamily:F}}>{diagnostics.length > 300 ? diagnostics.slice(0,300)+"…" : diagnostics}</div>
              </div>}
            </div>;
          })()}

          {/* Drag Handle + Log Panel */}
          <div style={{height:logH,borderTop:`1px solid ${C.bdr}`,background:"rgba(3,3,5,0.9)",display:"flex",flexDirection:"column",flexShrink:0}}>
            <div onMouseDown={onDragStart} style={{height:6,cursor:"row-resize",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <div style={{width:36,height:2,borderRadius:1,background:"rgba(255,255,255,0.08)"}}/>
            </div>
            <div style={{padding:"3px 14px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:7,fontWeight:600,letterSpacing:"1.5px",textTransform:"uppercase",color:C.mut}}>Log</span>
              <span style={{fontSize:8.5,color:C.dim}}>{STEPS.find(s=>s.id===vStep)?.l}</span>
              {liveStep===vStep && <Dot color={C.warn}/>}
              <span style={{fontSize:7.5,color:C.mut,marginLeft:"auto"}}>{logEntries.length} lines</span>
            </div>
            <div ref={logRef} style={{flex:1,overflowY:"auto",padding:"4px 14px"}}>
              {logEntries.map((l,i) => <div key={i} style={{fontSize:10,lineHeight:1.7,color:lc[l.k]||"#444",whiteSpace:"pre-wrap"}}><span style={{color:C.mut,marginRight:7,userSelect:"none"}}>{l.t}</span>{l.x}</div>)}
              {liveStep===vStep && liveStep && <span style={{display:"inline-block",width:5,height:11,background:C.warn,animation:"blink 1s step-end infinite",borderRadius:1}}/>}
            </div>
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {showCfg && <div style={{position:"absolute",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
        <div style={{width:680,maxHeight:"85vh",display:"flex",flexDirection:"column",borderRadius:8,background:C.sf,border:`1px solid ${C.bdr}`,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
          {/* Modal header */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>Start Automation</span>
              <Badge color={C.ok}>Configure</Badge>
            </div>
            <button onClick={() => setShowCfg(false)} style={{background:"none",border:"none",color:"#555",fontSize:14,cursor:"pointer",fontFamily:F}}>✕</button>
          </div>

          {/* Config selectors */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px"}}>Team</span>
              <select value={cfgTeam} onChange={e => setCfgTeam(e.target.value)} style={{padding:"4px 8px",borderRadius:4,fontSize:10,fontFamily:F,background:"rgba(255,255,255,0.04)",color:"#ccc",border:`1px solid ${C.bdr}`,cursor:"pointer"}}>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px"}}>Env</span>
              <select value={cfgEnv} onChange={e => setCfgEnv(e.target.value)} style={{padding:"4px 8px",borderRadius:4,fontSize:10,fontFamily:F,background:"rgba(255,255,255,0.04)",color:"#ccc",border:`1px solid ${C.bdr}`,cursor:"pointer"}}>
                {ENVS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <span style={{fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px"}}>Country</span>
              <span style={{padding:"4px 8px",borderRadius:4,fontSize:10,fontFamily:F,background:"rgba(34,197,94,0.06)",color:C.ok,border:"1px solid rgba(34,197,94,0.1)",fontWeight:600}}>{cfgCountry.toUpperCase()}</span>
            </div>
            <div style={{flex:1}}/>
            <span style={{fontSize:9,color:C.dim}}>{cfgSvcs.size}/{allSvcs.length} selected</span>
          </div>

          {/* Service groups */}
          <div style={{flex:1,overflowY:"auto",padding:"8px 16px"}}>
            {svcGroups.map(g => {
              const allChecked = g.svcs.every(s => cfgSvcs.has(s));
              const noneChecked = g.svcs.every(s => !cfgSvcs.has(s));
              const toggleGroup = () => {
                setCfgSvcs(prev => {
                  const nx = new Set(prev);
                  if (allChecked) { g.svcs.forEach(s => nx.delete(s)); }
                  else { g.svcs.forEach(s => nx.add(s)); }
                  return nx;
                });
              };
              const toggleSvc = (svc) => {
                setCfgSvcs(prev => {
                  const nx = new Set(prev);
                  nx.has(svc) ? nx.delete(svc) : nx.add(svc);
                  return nx;
                });
              };
              return <div key={g.id} style={{marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,cursor:"pointer"}} onClick={toggleGroup}>
                  <span style={{fontSize:11,color:allChecked?C.ok:noneChecked?"#555":"#888",userSelect:"none"}}>{allChecked?"☑":noneChecked?"☐":"◧"}</span>
                  <span style={{fontSize:9.5,fontWeight:600,color:"#aaa"}}>{g.l}</span>
                  <span style={{fontSize:8,color:C.dim}}>({g.svcs.filter(s=>cfgSvcs.has(s)).length}/{g.svcs.length})</span>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:2,paddingLeft:4}}>
                  {g.svcs.map(s => {
                    const on = cfgSvcs.has(s);
                    return <button key={s} onClick={() => toggleSvc(s)} style={{
                      padding:"2px 7px",fontSize:8.5,fontFamily:F,cursor:"pointer",borderRadius:3,
                      background:on?"rgba(34,197,94,0.06)":"rgba(255,255,255,0.015)",
                      border:`1px solid ${on?"rgba(34,197,94,0.15)":C.bdr}`,
                      color:on?"#8b8":"#444",transition:"all .1s",
                    }}>{on?"✓ ":""}{s}</button>;
                  })}
                </div>
              </div>;
            })}
          </div>

          {/* Modal footer */}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
            <button onClick={() => { setCfgSvcs(new Set(allSvcs)); }} style={{padding:"5px 12px",fontSize:9,fontFamily:F,cursor:"pointer",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:4,color:"#666"}}>Select All</button>
            <button onClick={() => { setCfgSvcs(new Set()); }} style={{padding:"5px 12px",fontSize:9,fontFamily:F,cursor:"pointer",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:4,color:"#666"}}>Deselect All</button>
            <div style={{flex:1}}/>
            <label onClick={() => setSkipJenkins(v => !v)} style={{display:"inline-flex",alignItems:"center",gap:5,cursor:"pointer",padding:"4px 10px",borderRadius:4,background:skipJenkins?"rgba(234,179,8,0.06)":"transparent",border:`1px solid ${skipJenkins?"rgba(234,179,8,0.15)":C.bdr}`,transition:"all .15s",userSelect:"none"}}>
              <span style={{fontSize:11,color:skipJenkins?C.warn:"#555"}}>{skipJenkins?"☑":"☐"}</span>
              <span style={{fontSize:8.5,fontWeight:600,color:skipJenkins?C.warn:"#666",letterSpacing:".3px"}}>Skip WAP+RESTAPI QA</span>
            </label>
            <button onClick={() => setShowCfg(false)} style={{padding:"6px 16px",fontSize:10,fontFamily:F,cursor:"pointer",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:5,color:"#777"}}>Cancel</button>
            <button onClick={() => { setShowCfg(false); onStartPipeline?.(Array.from(cfgSvcs), skipJenkins); }} disabled={cfgSvcs.size===0} style={{
              padding:"6px 20px",fontSize:10,fontWeight:600,fontFamily:F,cursor:cfgSvcs.size===0?"not-allowed":"pointer",
              background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",
              borderRadius:5,color:C.ok,opacity:cfgSvcs.size===0?0.4:1,
            }}>▶ Start ({cfgSvcs.size} services)</button>
          </div>
        </div>
      </div>}

      {/* Roster Configuration Modal */}
      {showRoster && <div style={{position:"absolute",inset:0,zIndex:110,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}}>
        <div style={{width:440,borderRadius:8,background:C.sf,border:`1px solid ${C.bdr}`,boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
          {/* Header */}
          <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>On-Call Roster</span>
              <Badge color={C.blu}>Configure</Badge>
            </div>
            <button onClick={() => setShowRoster(false)} style={{background:"none",border:"none",color:"#555",fontSize:14,cursor:"pointer",fontFamily:F}}>✕</button>
          </div>

          {/* Fields */}
          <div style={{padding:"16px"}}>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Shift Name</label>
              <input value={rShift} onChange={e => setRShift(e.target.value)} placeholder="e.g. APAC Evening" style={{width:"100%",padding:"7px 10px",borderRadius:5,fontSize:11,fontFamily:F,background:"rgba(255,255,255,0.04)",color:"#ccc",border:`1px solid ${C.bdr}`,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>On-Call (space separated handles)</label>
              <input value={rOncall} onChange={e => setROncall(e.target.value)} placeholder="e.g. @vinay.k @rahul.s" style={{width:"100%",padding:"7px 10px",borderRadius:5,fontSize:11,fontFamily:F,background:"rgba(255,255,255,0.04)",color:C.blu,border:`1px solid ${C.bdr}`,outline:"none",boxSizing:"border-box"}}/>
              <div style={{fontSize:7.5,color:C.dim,marginTop:3}}>These handles appear in Slack deploy notifications as cc</div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Escalation Contact</label>
              <input value={rEscalation} onChange={e => setREscalation(e.target.value)} placeholder="e.g. @fabio.g" style={{width:"100%",padding:"7px 10px",borderRadius:5,fontSize:11,fontFamily:F,background:"rgba(255,255,255,0.04)",color:C.warn,border:`1px solid ${C.bdr}`,outline:"none",boxSizing:"border-box"}}/>
              <div style={{fontSize:7.5,color:C.dim,marginTop:3}}>Notified on degraded deploys alongside on-call</div>
            </div>
            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:8.5,fontWeight:600,color:C.dim,textTransform:"uppercase",letterSpacing:".5px",marginBottom:5}}>Slack Email Map <span style={{fontWeight:400,textTransform:"none",color:"#444"}}>(for @mentions)</span></label>
              <textarea value={rEmails} onChange={e => setREmails(e.target.value)} placeholder={"@vinay.k=vinay.puranik@sporty.com\n@rahul.s=rahul.s@sporty.com"} rows={3} style={{width:"100%",padding:"7px 10px",borderRadius:5,fontSize:10,fontFamily:F,background:"rgba(255,255,255,0.04)",color:"#8b8b8b",border:`1px solid ${C.bdr}`,outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:"1.6"}}/>
              <div style={{fontSize:7.5,color:C.dim,marginTop:3}}>One per line: @handle=email — enables real Slack @mentions (requires users:read.email scope)</div>
            </div>

            {/* Preview */}
            <div style={{padding:"8px 10px",borderRadius:5,background:"rgba(255,255,255,0.015)",border:`1px solid ${C.bdr}`,marginBottom:4}}>
              <div style={{fontSize:7.5,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",color:C.mut,marginBottom:5}}>Preview</div>
              <div style={{display:"flex",gap:14,fontSize:9,flexWrap:"wrap"}}>
                <div><span style={{color:"#555"}}>Shift:</span> <span style={{color:"#aaa",fontWeight:600}}>{rShift||"—"}</span></div>
                <div><span style={{color:"#555"}}>On-Call:</span> <span style={{color:C.blu}}>{rOncall||"—"}</span></div>
                <div><span style={{color:"#555"}}>Escalation:</span> <span style={{color:C.warn}}>{rEscalation||"—"}</span></div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{padding:"10px 16px",borderTop:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
            <span style={{fontSize:8,color:C.dim,flex:1}}>Saved to data/roster.json</span>
            <button onClick={() => setShowRoster(false)} style={{padding:"6px 16px",fontSize:10,fontFamily:F,cursor:"pointer",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:5,color:"#777"}}>Cancel</button>
            <button onClick={() => { onSaveRoster?.({shift:rShift,oncall:rOncall,escalation:rEscalation,emails_raw:rEmails}); setShowRoster(false); }} style={{
              padding:"6px 20px",fontSize:10,fontWeight:600,fontFamily:F,cursor:"pointer",
              background:"rgba(34,197,94,0.08)",border:"1px solid rgba(34,197,94,0.2)",
              borderRadius:5,color:C.ok,
            }}>✓ Save Roster</button>
          </div>
        </div>
      </div>}

      {/* ── Footer: Connection indicators ── */}
      <div style={{padding:"3px 14px",borderTop:`1px solid ${C.bdr}`,display:"flex",alignItems:"center",gap:7,background:"rgba(3,3,6,0.9)",flexShrink:0}}>
        <span style={{fontSize:7,color:"#555",fontWeight:600,letterSpacing:".5px",textTransform:"uppercase"}}>Upstreams</span>
        {[
          {key:"github",       label:"GitHub"},
          {key:"jenkins_build",label:"Jenkins Artifact"},
          {key:"ecr",          label:"ECR"},
          {key:"jenkins_qa",   label:"Jenkins QA"},
          {key:"argocd",       label:"gRPC-Web"},
        ].map(({key,label})=>{
          const st=connectionStatuses[key]||"";
          const clr=st==="ok"?C.ok:st==="err"?C.err:st==="checking"?C.warn:"#444";
          const ic=st==="ok"?"●":st==="err"?"✗":st==="checking"?"◌":"○";
          return <span key={key} title={`${label}: ${st||"unknown"}`} style={{fontSize:7,fontWeight:600,color:clr,letterSpacing:".3px",padding:"1px 4px",borderRadius:2,background:`${clr}08`,border:`1px solid ${clr}12`,cursor:"default",whiteSpace:"nowrap",transition:"all .3s"}}>{ic} {label}</span>;
        })}
      </div>

      {/* ── Abort Confirmation Dialog ── */}
      {showAbortConfirm && <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)"}} onClick={() => setShowAbortConfirm(false)}>
        <div onClick={e => e.stopPropagation()} style={{width:380,background:C.sf,border:`1px solid ${C.err}30`,borderRadius:8,boxShadow:`0 8px 40px rgba(0,0,0,0.6), 0 0 60px ${C.err}08`,overflow:"hidden",animation:"fadeSlideIn .15s ease-out"}}>
          <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${C.bdr}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:18,lineHeight:1}}>⚠</span>
              <span style={{fontSize:12,fontWeight:700,letterSpacing:".5px",color:C.err,fontFamily:F}}>Abort Pipeline</span>
            </div>
            <div style={{fontSize:10,color:"#999",lineHeight:"16px",fontFamily:F}}>
              This will immediately terminate the running pipeline and mark <span style={{color:"#ccc",fontWeight:600}}>Run #{active?.n || "—"}</span> as <span style={{color:C.err,fontWeight:700}}>FAILED</span>.
            </div>
            <div style={{marginTop:8,padding:"6px 10px",borderRadius:4,background:"rgba(239,68,68,0.04)",border:`1px solid ${C.err}15`,fontSize:9,color:"#777",fontFamily:F,lineHeight:"15px"}}>
              All in-progress steps will be cancelled. ArgoCD sync and Jenkins jobs may need manual cleanup.
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,padding:"12px 20px"}}>
            <button onClick={() => setShowAbortConfirm(false)} style={{padding:"7px 20px",fontSize:10,fontWeight:600,fontFamily:F,cursor:"pointer",background:"transparent",border:`1px solid ${C.bdr}`,borderRadius:5,color:"#777",transition:"all .15s"}}>Cancel</button>
            <button onClick={() => { setShowAbortConfirm(false); onAbort?.(); }} style={{padding:"7px 20px",fontSize:10,fontWeight:700,fontFamily:F,cursor:"pointer",background:"rgba(239,68,68,0.1)",border:`1px solid ${C.err}40`,borderRadius:5,color:C.err,transition:"all .15s",letterSpacing:".3px"}}>✕ Abort Pipeline</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
