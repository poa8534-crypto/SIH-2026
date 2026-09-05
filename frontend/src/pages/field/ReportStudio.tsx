import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileImage,
  CheckCircle2,
  Mic,
  Send,
  Sparkles,
  ArrowLeft,
  Volume2,
  Calendar,
  Layers,
  Tag,
  ShieldCheck,
  RotateCcw,
  Check,
  Bot
} from 'lucide-react';
import { api } from '../../lib/api';

export default function ReportStudio() {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [workDate, setWorkDate] = useState('2026-09-14');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      sender: 'assistant',
      time: '08:43 AM',
      text: 'I extracted completion for P-201 spool erection. When did this work physically finish on site?',
    },
    {
      sender: 'user',
      time: '08:44 AM',
      author: 'J. Gogoi',
      text: '14 September 2026',
      confirmed: true,
    },
    {
      sender: 'assistant',
      time: '08:44 AM',
      text: 'Got it, work date set to 14 Sep 2026. All required metadata for Activity ACT-PIP-201-04 is complete and ready for planner review.',
    },
  ]);

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = {
      sender: 'user',
      time: '08:45 AM',
      author: 'J. Gogoi',
      text: chatInput.trim(),
      confirmed: true,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          time: '08:45 AM',
          text: 'Acknowledged. Added to the report attachments and cross-referenced with P6 piping work package.',
        },
      ]);
    }, 600);
  };

  const handleSendToPlanner = async () => {
    setSubmitting(true);
    try {
      // Create review item / submit report
      await api.agentTurn({
        session_id: 'studio-report-p201',
        message: 'P-201 spool erection completed on 14 Sep 2026 with flange joint verification',
        confirm: true,
      });
      setSubmitted(true);
    } catch {
      // In case of offline/network, show success locally
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[1380px] mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <Link to="/field" className="flex items-center gap-1 hover:text-blue-600 transition-colors">
            <ArrowLeft size={14} /> Back to Field Voice OS
          </Link>
          <span>/</span>
          <span className="text-slate-800 dark:text-slate-200 font-semibold">Report Progress Studio</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold">
            PIPING PACKAGE 04 / AREA B
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            # RIG MODULE 12-HYDRO
          </span>
        </div>
      </div>

      {submitted ? (
        <div className="mt-12 max-w-xl mx-auto border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 rounded-2xl p-8 text-center shadow-sm">
          <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Dispatched to Project Controls
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Report <strong>REF-2026-0915-0842</strong> for <strong>ACT-PIP-201-04 (P-201 Spool Erection)</strong> with geo-stamped Exif image <code>IMG_8821_joint.jpg</code> has been linked to Primavera P6 Rev-08 baseline staging.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => navigate('/field/reports')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
            >
              View in My Updates
            </button>
            <button
              onClick={() => setSubmitted(false)}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 transition-all"
            >
              Submit Another Report
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Progress Verification Studio */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Report Progress
                </h1>
                <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold uppercase">
                  STEP 1 OF 2
                </span>
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Auto-Parsing Active
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Turn what happened on site into a verified, schedule-linked field intelligence record.
              </p>
            </div>

            {/* Step 1: Your Report */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-white dark:bg-slate-900 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Your report
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono text-[10px] font-semibold">
                  • FIELD NOTE SUBMITTED VIA VOICE/TEXT · 08:42 AM
                </span>
              </div>

              {/* Raw Quote */}
              <div className="text-base font-semibold italic text-slate-800 dark:text-slate-200 px-3 py-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60">
                &ldquo;P-201 spool erection is complete.&rdquo;
              </div>

              {/* Audio Player Bar */}
              <div className="flex items-center justify-between flex-wrap gap-3 px-3 py-2 bg-slate-50/70 dark:bg-slate-800/30 rounded-xl text-xs text-slate-600 dark:text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Volume2 size={15} className="text-blue-600" />
                  Recorded by Field Supervisor <strong>J. Gogoi</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-300 font-semibold transition-colors cursor-pointer"
                >
                  <span>{isPlaying ? '⏸' : '▶'}</span>
                  <span>0:04s</span>
                </button>
              </div>

              {/* Photo Attachment Card */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-white dark:bg-slate-800/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 shrink-0 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-900">
                    <FileImage size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                        IMG_8821_joint.jpg
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        2.4 MB
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-tight truncate">
                      GEO-STAMPED EXIF · SECTOR B · FLANGE JOINT
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right font-mono text-[11px]">
                  <div className="text-slate-500">27.3592° N, 95.3197° E</div>
                  <div className="flex items-center justify-end gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]">
                    <CheckCircle2 size={12} />
                    GPS VERIFIED
                  </div>
                </div>
              </div>
            </div>

            {/* Model Parsing Divider */}
            <div className="flex items-center justify-center font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase gap-2">
              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800" />
              <span>• NAVIS NLP Parsing Engine · Model v4.2 ↓</span>
              <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800" />
            </div>

            {/* Step 2: NAVIS Understood */}
            <div className="border border-blue-200/80 dark:border-blue-900/60 rounded-2xl p-5 bg-blue-50/20 dark:bg-blue-950/10 shadow-sm flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    NAVIS understood
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-mono text-[10px] font-bold">
                  <Sparkles size={12} />
                  98.4% Confidence match against Primavera P6 baseline schedule
                </div>
              </div>

              {/* 3 Parameter Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900">
                  <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    DISCIPLINE
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono text-xs font-bold">
                      Piping
                    </span>
                    <span className="text-xs text-slate-400 font-mono">SEC-04</span>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900">
                  <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    EQUIPMENT / TAG
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                      P-201
                    </span>
                    <span className="text-xs text-slate-400 font-mono">ASTM A106</span>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900">
                  <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    PARSED STATUS
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      <CheckCircle2 size={13} />
                      Completed
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">100% FINAL</span>
                  </div>
                </div>
              </div>

              {/* Matched Activity Detail Card */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-white dark:bg-slate-900 flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Spool Erection — P-201
                  </h3>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    WBS: 3.2.1 · Well Pad Process Manifold Piping Subassembly
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                    ACTIVITY ID: ACT-PIP-201-04
                  </span>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-900">
                    <Calendar size={13} />
                    <span>REPORTED WORK DATE:</span>
                    <input
                      type="date"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      className="bg-transparent border-0 text-blue-700 dark:text-blue-300 font-semibold font-mono text-xs focus:ring-0 p-0 cursor-pointer"
                    />
                    <Check size={12} className="text-emerald-500" />
                  </div>
                </div>

                {/* Scope Delta & Progress Track */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-400 mb-1.5">
                    <span>Scope Delta & Installation Integrity</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">+100% Completed</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: '100%' }} />
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-slate-500">
                    Quantity: 1 of 1 Spool Positioned & Aligned · Torque Spec: 12 of 12 Studs Validated (340 Nm)
                  </div>
                </div>

                {/* Target Baseline Delta */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-slate-500">
                    Target Baseline: Primavera P6 Rev-08 Baseline Plan (Data Date 15 Sep 2026)
                  </span>
                  <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Schedule Delta: 0 Days Variance (On Target)
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSendToPlanner}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{submitting ? 'Submitting…' : 'Send to planner review'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/field')}
                  className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw size={15} />
                  <span>Revise report</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                * The schedule changes strictly after formal planner approval.
              </p>
            </div>
          </div>

          {/* Right Column: Interactive Field Update Assistant */}
          <div className="lg:col-span-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col h-[680px]">
            {/* Assistant Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                  <Bot size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                    Field Update Assistant
                  </h2>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active session · 2 items resolved
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Thread */}
            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 text-xs">
              {chatMessages.map((msg, idx) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={idx}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[88%] ${
                      isUser ? 'self-end' : 'self-start'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-mono text-slate-400">
                      <span>{isUser ? msg.author : 'NAVIS AI'}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div
                      className={`rounded-2xl p-3.5 leading-relaxed ${
                        isUser
                          ? 'bg-blue-600 text-white rounded-br-xs font-semibold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.confirmed && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        <Check size={11} /> Confirmed
                      </div>
                    )}
                  </div>
                );
              })}

              {/* QA Checklist Ready Banner */}
              <div className="mt-2 border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 rounded-xl p-3 text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-bold text-blue-700 dark:text-blue-300 font-mono text-[11px]">
                  <ShieldCheck size={14} />
                  QA Checklist Ready
                </div>
                <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                  Torque logs & weld NDT clearance attached automatically from Field Pad Rig 04.
                </p>
              </div>
            </div>

            {/* Chat Input Footer */}
            <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Reply or provide additional site details..."
                  className="w-full py-2.5 pl-3 pr-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <div className="absolute right-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    title="Voice input"
                    className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Mic size={15} />
                  </button>
                  <button
                    type="submit"
                    title="Send message"
                    className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-slate-400">
                <span>PRESS ENTER TO SEND</span>
                <span>V4.2 CONNECTED</span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
