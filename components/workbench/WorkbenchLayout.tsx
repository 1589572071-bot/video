import React from 'react';
import { User, Zap } from 'lucide-react';
import ConfigStatusBanner from './ConfigStatusBanner';
import NextStepButton from './NextStepButton';
import ExportButton from './ExportButton';

interface WorkbenchLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  rightPanel: React.ReactNode;
  bottomTimeline: React.ReactNode;
}

export default function WorkbenchLayout({
  sidebar,
  main,
  rightPanel,
  bottomTimeline,
}: WorkbenchLayoutProps) {
  return (
    <div className="h-screen w-screen bg-[#0B0E14] text-white flex flex-col overflow-hidden">
      {/* TopBar */}
      <div className="h-14 border-b border-white/10 bg-[#131821] flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0FF] to-[#F5B041] flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#0B0E14]" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">MetaCut</div>
              <div className="text-[10px] text-white/40 -mt-1">AI 短视频创作迁移平台</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ExportButton />
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-64 border-r border-white/10 bg-[#0B0E14] flex flex-col shrink-0">
          {sidebar}
        </div>

        {/* Center Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0B0E14] relative">
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <ConfigStatusBanner />
            {main}
          </div>
          <NextStepButton />
          
          {/* Bottom Timeline */}
          <div className="h-64 border-t border-white/10 bg-[#131821] shrink-0 overflow-y-auto custom-scrollbar p-4">
            {bottomTimeline}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-80 border-l border-white/10 bg-[#131821] flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
