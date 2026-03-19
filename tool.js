import React, { useState, useEffect, useCallback } from 'react';
import { Lock, Unlock, Settings, AlertCircle, Circle, Triangle, Wand2, CheckCircle2, LockKeyhole, Code2, Copy } from 'lucide-react';

export default function App() {
  const [state, setState] = useState({
    pitch: 3.0,
    arcOffset: 1.5,
    edgeOffset: 1.5,
    startOffset: true,
    endOffset: true,
    r: 27.8,
    a: 103.78,
    c: 43.75,
    h: 10.74, // Height (Sagitta)
    locks: { r: false, a: true, c: true },
    n: 0,
    slack: 0
  });

  const [fcPrefix, setFcPrefix] = useState('<<Spreadsheet>>.');
  const [names, setNames] = useState({
    pitch: 'Pitch',
    arcOffset: 'StitchMargin',
    edgeOffset: 'EdgeMargin',
    r: 'Radius',
    a: 'Angle',
    c: 'Chord',
    h: 'Height',
    n: 'HoleCount'
  });
  const [copied, setCopied] = useState(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgContainerRef = React.useRef(null);

  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const zoomChange = e.deltaY * -0.002;
      setZoom(z => Math.min(Math.max(0.2, z + zoomChange * z), 20));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const updateGeometry = useCallback((field, val, currentState) => {
    let { pitch, arcOffset, edgeOffset, startOffset, endOffset, r, a, c, locks } = { ...currentState };

    // 1. Update base input constraints
    if (field === 'r') r = Math.max(arcOffset + 0.1, val);
    if (field === 'a') a = Math.max(0.1, Math.min(359.9, val));
    if (field === 'c') c = Math.max(0.1, val);
    if (field === 'pitch') pitch = Math.max(0.1, val);
    if (field === 'arcOffset') arcOffset = Math.max(0, val);
    if (field === 'edgeOffset') edgeOffset = Math.max(0, val);
    if (field === 'startOffset') startOffset = val;
    if (field === 'endOffset') endOffset = val;

    let aRad = (a * Math.PI) / 180;

    // 2. Pure Mathematical Constraints (Parametric CAD logic)
    if (field === 'r') {
      if (locks.a) c = 2 * r * Math.sin(aRad / 2);
      else if (locks.c) {
        c = Math.min(c, 2 * r);
        aRad = 2 * Math.asin(c / (2 * r));
        a = (aRad * 180) / Math.PI;
      } else c = 2 * r * Math.sin(aRad / 2);
    } else if (field === 'a') {
      if (locks.r) c = 2 * r * Math.sin(aRad / 2);
      else if (locks.c) r = c / (2 * Math.sin(aRad / 2));
      else c = 2 * r * Math.sin(aRad / 2);
    } else if (field === 'c') {
      if (locks.r) {
        c = Math.min(c, 2 * r);
        aRad = 2 * Math.asin(c / (2 * r));
        a = (aRad * 180) / Math.PI;
      } else if (locks.a) {
        r = c / (2 * Math.sin(aRad / 2));
      } else {
        r = c / (2 * Math.sin(aRad / 2));
      }
    } else {
      // Configuration change, preserve geometry based on locks
      if (locks.r && locks.a) c = 2 * r * Math.sin(aRad / 2);
      else if (locks.r && locks.c) {
        aRad = 2 * Math.asin(c / (2 * r));
        a = (aRad * 180) / Math.PI;
      } else if (locks.a && locks.c) r = c / (2 * Math.sin(aRad / 2));
    }

    // Mathematical sanity checks & derived values
    c = 2 * r * Math.sin((a * Math.PI / 180) / 2);
    let h = r * (1 - Math.cos((a * Math.PI / 180) / 2));

    // 3. Slack Calculation
    let oStart = startOffset ? edgeOffset : 0;
    let oEnd = endOffset ? edgeOffset : 0;
    let L_s_target = (r - arcOffset) * (a * Math.PI / 180);
    let availableStitchLength = L_s_target - oStart - oEnd;
    let N = Math.max(2, Math.round(availableStitchLength / pitch) + 1);
    let L_s_true = (N - 1) * pitch + oStart + oEnd;

    let slack = L_s_target - L_s_true;

    return { ...currentState, pitch, arcOffset, edgeOffset, startOffset, endOffset, r, a, c, h, n: N, slack, locks };
  }, []);

  const handleOptimize = () => {
    setState(s => {
      let { pitch, arcOffset, edgeOffset, startOffset, endOffset, r, a, c, locks } = s;
      let oStart = startOffset ? edgeOffset : 0;
      let oEnd = endOffset ? edgeOffset : 0;
      let aRad = (a * Math.PI) / 180;

      let L_s_target = (r - arcOffset) * aRad;
      let availableStitchLength = L_s_target - oStart - oEnd;
      let N = Math.max(2, Math.round(availableStitchLength / pitch) + 1);
      let L_s_true = (N - 1) * pitch + oStart + oEnd;

      let activeLocksCount = (locks.r ? 1 : 0) + (locks.a ? 1 : 0) + (locks.c ? 1 : 0);
      if (activeLocksCount >= 2) return s; // Fully constrained

      let snapVar = 'a';
      if (locks.r) snapVar = 'a';
      else if (locks.a) snapVar = 'r';
      else if (locks.c) snapVar = 'a_bisect';

      if (snapVar === 'a') {
        aRad = L_s_true / (r - arcOffset);
        a = (aRad * 180) / Math.PI;
        c = 2 * r * Math.sin(aRad / 2);
      } else if (snapVar === 'r') {
        r = L_s_true / aRad + arcOffset;
        c = 2 * r * Math.sin(aRad / 2);
      } else if (snapVar === 'a_bisect') {
        let low = 0.0001;
        let high = 2 * Math.PI;
        let mid = 0;
        for (let i = 0; i < 40; i++) {
          mid = (low + high) / 2;
          let R_test = c / (2 * Math.sin(mid / 2));
          let L_test = mid * (R_test - arcOffset);
          if (L_test > L_s_true) high = mid;
          else low = mid;
        }
        aRad = mid;
        a = (aRad * 180) / Math.PI;
        r = c / (2 * Math.sin(aRad / 2));
      }

      L_s_target = (r - arcOffset) * aRad;
      availableStitchLength = L_s_target - oStart - oEnd;
      N = Math.max(2, Math.round(availableStitchLength / pitch) + 1);
      let slack = L_s_target - ((N - 1) * pitch + oStart + oEnd);
      let h = r * (1 - Math.cos(aRad / 2));

      return { ...s, r, a, c, h, n: N, slack };
    });
  };

  useEffect(() => {
    setState(s => updateGeometry('init', null, s));
  }, [updateGeometry]);

  const handleChange = (field, val) => {
    setState(s => {
      const parsedVal = typeof val === 'boolean' ? val : (parseFloat(val) || 0);
      return updateGeometry(field, parsedVal, s);
    });
  };

  const handleToggleLock = (field) => {
    setState(s => {
      const newLocks = { ...s.locks, [field]: !s.locks[field] };
      const activeLocks = (newLocks.r ? 1 : 0) + (newLocks.a ? 1 : 0) + (newLocks.c ? 1 : 0);
      if (activeLocks > 2) return s;
      return { ...s, locks: newLocks };
    });
  };

  const handleNameChange = (key, val) => {
    setNames(s => ({ ...s, [key]: val }));
  };

  const copyText = (text, id) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  // ViewBox and Canvas Math
  const aRad = (state.a * Math.PI) / 180;
  const startAngle = -Math.PI / 2 - aRad / 2;
  const endAngle = -Math.PI / 2 + aRad / 2;
  const rs = state.r - state.arcOffset;
  const oStart = state.startOffset ? state.edgeOffset : 0;

  const viewBoxPadding = 20;
  const minX = -state.r - viewBoxPadding;
  const maxX = state.r + viewBoxPadding;
  const minY = -state.r - viewBoxPadding;
  let maxY = -state.r * Math.cos(aRad / 2);
  if (state.a > 180) maxY = Math.max(maxY, state.r);
  maxY += viewBoxPadding + 10;

  const baseWidth = maxX - minX;
  const baseHeight = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const viewWidth = baseWidth / zoom;
  const viewHeight = baseHeight / zoom;
  const viewMinX = cx - viewWidth / 2 + pan.x;
  const viewMinY = cy - viewHeight / 2 + pan.y;

  const markers = [];
  for (let i = 0; i < state.n; i++) {
    const distanceAlongStitch = oStart + i * state.pitch;
    const angleOffset = distanceAlongStitch / rs;
    const markerAngle = startAngle + angleOffset;
    markers.push({ x: rs * Math.cos(markerAngle), y: rs * Math.sin(markerAngle) });
  }

  const describeArc = (x, y, radius, sAngle, eAngle) => {
    const start = { x: x + radius * Math.cos(sAngle), y: y + radius * Math.sin(sAngle) };
    const end = { x: x + radius * Math.cos(eAngle), y: y + radius * Math.sin(eAngle) };
    const largeArcFlag = eAngle - sAngle <= Math.PI ? "0" : "1";
    return ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y].join(" ");
  };

  const handleMouseDown = (e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); };
  const handleMouseMove = (e) => {
    if (!isDragging || !svgContainerRef.current) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const scaleFactor = viewWidth / svgContainerRef.current.clientWidth;
    setPan(p => ({ x: p.x - dx * scaleFactor, y: p.y - dy * scaleFactor }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUpOrLeave = () => setIsDragging(false);

  const activeLocksCount = (state.locks.r ? 1 : 0) + (state.locks.a ? 1 : 0) + (state.locks.c ? 1 : 0);
  const hasSlack = Math.abs(state.slack) > 0.01;
  
  // Driven dimensions logically cannot be edited
  const isRDriven = !state.locks.r && activeLocksCount >= 2;
  const isADriven = !state.locks.a && activeLocksCount >= 2;
  const isCDriven = !state.locks.c && activeLocksCount >= 2;

  // FreeCAD Equation Generators
  const getOffsetSum = () => {
    let parts = [];
    if (state.startOffset) parts.push(`${fcPrefix}${names.edgeOffset}`);
    if (state.endOffset) parts.push(`${fcPrefix}${names.edgeOffset}`);
    if (parts.length === 2) return `(2 * ${fcPrefix}${names.edgeOffset})`;
    if (parts.length === 1) return parts[0];
    return '0';
  };

  const offsetSum = getOffsetSum();

  // Angle variants
  const strAngleStitch = `(((${fcPrefix}${names.n} - 1) * ${fcPrefix}${names.pitch} + ${offsetSum}) / (${fcPrefix}${names.r} - ${fcPrefix}${names.arcOffset})) * 180 / pi`;
  const strAngleGeom = `4 * atan(2 * ${fcPrefix}${names.h} / ${fcPrefix}${names.c}) * 180 / pi`;

  // Radius variants
  const strRadiusStitch = `(((${fcPrefix}${names.n} - 1) * ${fcPrefix}${names.pitch} + ${offsetSum}) / (${fcPrefix}${names.a} * pi / 180)) + ${fcPrefix}${names.arcOffset}`;
  const strRadiusGeom = `(${fcPrefix}${names.c}^2 / (8 * ${fcPrefix}${names.h})) + (${fcPrefix}${names.h} / 2)`;

  // Independent formulas
  const strChord = `2 * ${fcPrefix}${names.r} * sin(${fcPrefix}${names.a} / 2)`;
  const strStitchLength = `(${fcPrefix}${names.n} - 1) * ${fcPrefix}${names.pitch} + ${offsetSum}`;
  const strHeightAngle = `${fcPrefix}${names.r} * (1 - cos(${fcPrefix}${names.a} / 2))`;
  const strHeightChord = `${fcPrefix}${names.r} - sqrt(${fcPrefix}${names.r}^2 - (${fcPrefix}${names.c} / 2)^2)`;

  const ParamLabel = ({ label, nameKey, isDriven }) => (
    <div className="flex flex-col gap-0.5">
      <label className="text-sm font-medium text-neutral-700 flex flex-col">
        {label}
        {isDriven && <span className="text-[10px] text-amber-600 font-bold uppercase">Driven by constraints</span>}
      </label>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-neutral-400 font-mono">var:</span>
        <input
          type="text"
          value={names[nameKey]}
          onChange={(e) => handleNameChange(nameKey, e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
          className="text-[10px] font-mono text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 focus:bg-white border border-transparent focus:border-indigo-300 rounded px-1 py-0.5 outline-none w-20 transition-colors"
          title="Variable name for FreeCAD expressions"
        />
      </div>
    </div>
  );

  const FormulaRow = ({ title, description, formulas, id }) => (
    <div className="p-4 md:p-6 hover:bg-neutral-50 transition-colors flex flex-col gap-3 group border-b border-neutral-100 last:border-0">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
      </div>
      <div className="flex flex-col gap-2 mt-1">
        {formulas.map((f, idx) => (
          <div key={idx} className="flex flex-col md:flex-row gap-2 md:items-center">
            {f.label && <span className="text-[10px] uppercase font-bold text-neutral-400 w-24 shrink-0 text-right md:text-left">{f.label}</span>}
            <div className="flex-1 font-mono text-xs bg-neutral-100 text-neutral-700 p-2 rounded border border-neutral-200 break-all select-all">
              {f.value}
            </div>
            <button
              onClick={() => copyText(f.value, `${id}-${idx}`)}
              className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-sm transition-all w-24"
            >
              {copied === `${id}-${idx}` ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {copied === `${id}-${idx}` ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-100 p-4 md:p-8 font-sans text-neutral-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="bg-white rounded-2xl shadow-sm p-6 flex items-center justify-between border border-neutral-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Leathercraft Arc Designer</h1>
            <p className="text-sm text-neutral-500 mt-1">Perfectly calculate pricking iron pitches and arc radiuses.</p>
          </div>
          <div className="hidden sm:flex h-12 w-12 bg-neutral-900 rounded-full items-center justify-center text-white">
            <Settings size={24} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white rounded-2xl shadow-sm p-6 border border-neutral-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
                <Settings size={16} /> Global Parameters
              </h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <ParamLabel label="Pricking Pitch (mm)" nameKey="pitch" />
                  <input type="number" min="0.1" step="0.01" value={Math.round(state.pitch * 1000) / 1000} onChange={(e) => handleChange('pitch', e.target.value)} className="w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all" />
                </div>
                
                <div className="flex justify-between items-center">
                  <ParamLabel label="Stitching Margin (mm)" nameKey="arcOffset" />
                  <input type="number" min="0" step="0.1" value={Math.round(state.arcOffset * 1000) / 1000} onChange={(e) => handleChange('arcOffset', e.target.value)} className="w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all" />
                </div>

                <div className="pt-4 border-t border-neutral-100">
                  <div className="flex justify-between items-center">
                    <ParamLabel label="Edge Margin (mm)" nameKey="edgeOffset" />
                    <input type="number" min="0" step="0.1" value={Math.round(state.edgeOffset * 1000) / 1000} onChange={(e) => handleChange('edgeOffset', e.target.value)} className="w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all" />
                  </div>
                  
                  <div className="flex gap-4 mt-3">
                    <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                      <input type="checkbox" checked={state.startOffset} onChange={(e) => handleChange('startOffset', e.target.checked)} className="rounded text-neutral-900 focus:ring-neutral-900" />
                      Apply Start
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                      <input type="checkbox" checked={state.endOffset} onChange={(e) => handleChange('endOffset', e.target.checked)} className="rounded text-neutral-900 focus:ring-neutral-900" />
                      Apply End
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6 border border-neutral-200">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-4 flex items-center gap-2">
                <Triangle size={16} /> Arc Geometry
              </h2>

              <div className="space-y-6">
                
                <div className="flex justify-between items-center">
                  <ParamLabel label="Radius (R, mm)" nameKey="r" isDriven={isRDriven} />
                  <div className="flex items-center gap-2">
                    <input type="number" min={Math.ceil(state.arcOffset + 0.1)} step="0.1" value={Math.round(state.r * 1000) / 1000} onChange={(e) => handleChange('r', e.target.value)} disabled={state.locks.r || isRDriven} className={`w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all ${state.locks.r || isRDriven ? 'bg-neutral-100 text-neutral-500 border-neutral-200' : ''}`} />
                    <button onClick={() => handleToggleLock('r')} disabled={isRDriven} className={`p-1.5 rounded-md transition-colors ${state.locks.r ? 'bg-amber-100 text-amber-700' : isRDriven ? 'bg-neutral-100 text-neutral-300' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'}`}>
                      {state.locks.r ? <Lock size={14} /> : isRDriven ? <LockKeyhole size={14} /> : <Unlock size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <ParamLabel label="Angle (θ, °)" nameKey="a" isDriven={isADriven} />
                  <div className="flex items-center gap-2">
                    <input type="number" min="0.1" max="359.9" step="0.1" value={Math.round(state.a * 1000) / 1000} onChange={(e) => handleChange('a', e.target.value)} disabled={state.locks.a || isADriven} className={`w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all ${state.locks.a || isADriven ? 'bg-neutral-100 text-neutral-500 border-neutral-200' : ''}`} />
                    <button onClick={() => handleToggleLock('a')} disabled={isADriven} className={`p-1.5 rounded-md transition-colors ${state.locks.a ? 'bg-amber-100 text-amber-700' : isADriven ? 'bg-neutral-100 text-neutral-300' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'}`}>
                      {state.locks.a ? <Lock size={14} /> : isADriven ? <LockKeyhole size={14} /> : <Unlock size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <ParamLabel label="Chord (C, mm)" nameKey="c" isDriven={isCDriven} />
                  <div className="flex items-center gap-2">
                    <input type="number" min="0.1" step="0.1" value={Math.round(state.c * 1000) / 1000} onChange={(e) => handleChange('c', e.target.value)} disabled={state.locks.c || isCDriven} className={`w-24 p-1.5 text-right text-sm border border-neutral-300 rounded-md focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 outline-none transition-all ${state.locks.c || isCDriven ? 'bg-neutral-100 text-neutral-500 border-neutral-200' : ''}`} />
                    <button onClick={() => handleToggleLock('c')} disabled={isCDriven} className={`p-1.5 rounded-md transition-colors ${state.locks.c ? 'bg-amber-100 text-amber-700' : isCDriven ? 'bg-neutral-100 text-neutral-300' : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'}`}>
                      {state.locks.c ? <Lock size={14} /> : isCDriven ? <LockKeyhole size={14} /> : <Unlock size={14} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
                  <ParamLabel label="Arc Height (Sagitta)" nameKey="h" isDriven={true} />
                  <div className="flex items-center gap-2">
                    <input type="number" value={Math.round(state.h * 1000) / 1000} disabled className="w-24 p-1.5 text-right text-sm border border-neutral-200 rounded-md bg-neutral-50 text-neutral-500 outline-none" title="Depth of the curve. Driven strictly by Radius and Angle." />
                    <div className="p-1.5 w-[28px]"></div> {/* spacer for alignment */}
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col space-y-6">
            
            <div className={`px-4 py-4 rounded-xl flex gap-3 items-start shadow-sm border ${hasSlack ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              {hasSlack ? <AlertCircle className="shrink-0 mt-0.5 text-amber-600" size={20} /> : <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-600" size={20} />}
              <div className="text-sm flex-1">
                <p className="font-semibold text-base">{hasSlack ? 'Manual Adjustment Active' : 'Perfect Fit!'}</p>
                {hasSlack ? (
                  <>
                    <p className="mt-1 text-amber-700/80">
                      The current geometry leaves <strong>{Math.abs(state.slack).toFixed(2)} mm</strong> of {state.slack > 0 ? 'slack' : 'overlap'} along the stitch line.
                    </p>
                    {activeLocksCount >= 2 ? (
                      <p className="mt-3 font-medium text-red-600">The arc is fully constrained by geometry. Unlock a dimension to optimize.</p>
                    ) : (
                      <button onClick={handleOptimize} className="mt-4 flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-neutral-800 transition-colors shadow-sm">
                        <Wand2 size={16} /> Optimize Geometry
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-emerald-700/80">Holes fit flawlessly along the stitching line with your current settings.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-xs text-neutral-500 font-medium">Total Holes</div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-neutral-400 font-mono">var:</span>
                      <input
                        type="text"
                        value={names.n}
                        onChange={(e) => handleNameChange('n', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        className="text-[10px] font-mono text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 focus:bg-white border border-transparent focus:border-indigo-300 rounded px-1 py-0 outline-none w-14 transition-colors text-right"
                      />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-neutral-900">{state.n}</div>
               </div>
               <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200">
                  <div className="text-xs text-neutral-500 font-medium mb-1">Outer Arc Length</div>
                  <div className="text-2xl font-bold text-neutral-900">{(state.r * aRad).toFixed(1)} <span className="text-sm font-normal text-neutral-400">mm</span></div>
               </div>
               <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200">
                  <div className="text-xs text-neutral-500 font-medium mb-1">Stitch Line Length</div>
                  <div className="text-2xl font-bold text-neutral-900">{(rs * aRad).toFixed(1)} <span className="text-sm font-normal text-neutral-400">mm</span></div>
               </div>
               <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-200">
                  <div className="text-xs text-neutral-500 font-medium mb-1">Actual Hole Spacing</div>
                  <div className="text-2xl font-bold text-neutral-900">{((state.n - 1) * state.pitch).toFixed(1)} <span className="text-sm font-normal text-neutral-400">mm</span></div>
               </div>
            </div>

            <div 
              ref={svgContainerRef}
              className="w-full bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 flex items-center justify-center relative overflow-hidden min-h-[400px] cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
            >
              
              <div className="absolute top-4 left-4 text-xs font-mono text-neutral-400 flex flex-col gap-1 z-10 pointer-events-none">
                <span>R: {state.r.toFixed(2)}</span>
                <span>θ: {state.a.toFixed(2)}°</span>
                <span>C: {state.c.toFixed(2)}</span>
              </div>

              <div className="absolute top-4 right-4 flex flex-col bg-white rounded-lg shadow-sm border border-neutral-200 z-10">
                <button onClick={() => setZoom(z => Math.min(z * 1.2, 20))} className="p-2 hover:bg-neutral-100 rounded-t-lg border-b border-neutral-100 text-neutral-600 font-bold" title="Zoom In">+</button>
                <button onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }} className="p-2 hover:bg-neutral-100 border-b border-neutral-100 text-neutral-600 text-xs font-medium" title="Reset View">FIT</button>
                <button onClick={() => setZoom(z => Math.max(z / 1.2, 0.2))} className="p-2 hover:bg-neutral-100 rounded-b-lg text-neutral-600 font-bold" title="Zoom Out">−</button>
              </div>

              <svg 
                className="w-full h-full pointer-events-none select-none"
                viewBox={`${viewMinX} ${viewMinY} ${viewWidth} ${viewHeight}`} 
                preserveAspectRatio="xMidYMid meet"
              >
                <circle cx="0" cy="0" r={state.r * 0.02} fill="#e5e5e5" />
                <path d={`M 0 ${-state.r*0.05} L 0 ${state.r*0.05} M ${-state.r*0.05} 0 L ${state.r*0.05} 0`} stroke="#d4d4d4" strokeWidth={state.r*0.005} />

                <line x1="0" y1="0" x2={state.r * Math.cos(startAngle)} y2={state.r * Math.sin(startAngle)} stroke="#f0f0f0" strokeWidth={state.r*0.005} strokeDasharray="4 4" />
                <line x1="0" y1="0" x2={state.r * Math.cos(endAngle)} y2={state.r * Math.sin(endAngle)} stroke="#f0f0f0" strokeWidth={state.r*0.005} strokeDasharray="4 4" />

                <line 
                  x1={state.r * Math.cos(startAngle)} y1={state.r * Math.sin(startAngle)}
                  x2={state.r * Math.cos(endAngle)} y2={state.r * Math.sin(endAngle)}
                  stroke="#e5e5e5" strokeWidth={Math.max(0.5, state.r*0.01)} strokeDasharray="3 3"
                />

                {/* Sagitta / Height Visualization */}
                <line 
                  x1={state.r * Math.cos(startAngle + aRad/2)} y1={state.r * Math.sin(startAngle + aRad/2)}
                  x2={(state.r - state.h) * Math.cos(startAngle + aRad/2)} y2={(state.r - state.h) * Math.sin(startAngle + aRad/2)}
                  stroke="#fbbf24" strokeWidth={Math.max(0.5, state.r*0.01)} strokeDasharray="2 2"
                />

                <path 
                  d={describeArc(0, 0, state.r, startAngle, endAngle)} 
                  fill="none" 
                  stroke="#171717" 
                  strokeWidth={Math.max(1, state.r*0.015)} 
                  strokeLinecap="round"
                />

                <path 
                  d={describeArc(0, 0, rs, startAngle, endAngle)} 
                  fill="none" 
                  stroke="#3b82f6" 
                  strokeWidth={Math.max(0.5, state.r*0.008)} 
                  strokeDasharray="4 4" 
                />

                {markers.map((m, i) => (
                  <circle 
                    key={i} 
                    cx={m.x} 
                    cy={m.y} 
                    r={Math.max(0.8, state.r * 0.015)} 
                    fill="#ef4444" 
                    stroke="#ffffff"
                    strokeWidth={Math.max(0.2, state.r * 0.005)}
                  />
                ))}
              </svg>
            </div>

            {/* FreeCAD Integration Panel */}
            <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-900 px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <h2 className="text-sm font-bold tracking-wider text-white flex items-center gap-2">
                  <Code2 size={16} /> FreeCAD Integration
                </h2>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-400">Prefix:</span>
                  <input
                    type="text"
                    value={fcPrefix}
                    onChange={(e) => setFcPrefix(e.target.value.replace(/[^a-zA-Z0-9_\.\<\>]/g, ''))}
                    className="bg-neutral-800 text-neutral-200 border border-neutral-700 rounded px-2 py-1 outline-none focus:border-neutral-500 w-32 font-mono"
                    placeholder="<<Spreadsheet>>."
                  />
                </div>
              </div>
              <div className="p-0">
                <FormulaRow
                  title="Angle (θ) Constraint"
                  description="Calculates the final Angle. Choose 'Via Stitch Rules' to drive it directly by your leathercraft pricking rules, or 'Via Arc Height' to avoid referencing Radius."
                  id="angle"
                  formulas={[
                    { label: 'Via Stitch Rules', value: strAngleStitch },
                    { label: 'Via Arc Height', value: strAngleGeom }
                  ]}
                />
                <FormulaRow
                  title="Radius (R) Constraint"
                  description="Calculates the final Radius. Choose 'Via Stitch Rules' to drive it directly by your leathercraft pricking rules, or 'Via Arc Height' to avoid referencing Angle."
                  id="radius"
                  formulas={[
                    { label: 'Via Stitch Rules', value: strRadiusStitch },
                    { label: 'Via Arc Height', value: strRadiusGeom }
                  ]}
                />
                <FormulaRow
                  title="Chord (C) Constraint"
                  description="Calculates the geometric straight-line distance from edge to edge."
                  id="chord"
                  formulas={[{ value: strChord }]}
                />
                <FormulaRow
                  title="Stitch Line Length"
                  description="Calculates the physical length of the curve where your pricking irons will strike."
                  id="stitch"
                  formulas={[{ value: strStitchLength }]}
                />
                <FormulaRow
                  title="Arc Height (Sagitta)"
                  description="Calculates the physical depth of the curve from the chord line to the apex."
                  id="height"
                  formulas={[
                    { label: 'Via Angle', value: strHeightAngle },
                    { label: 'Via Chord', value: strHeightChord }
                  ]}
                />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
