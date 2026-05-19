'use client';

import React from 'react';
import { MessageCircle, Send, FileText, Zap } from 'lucide-react';
import { SmsTab } from './sms-client';

interface SmsSidebarProps {
  activeTab: SmsTab;
  setActiveTab: (tab: SmsTab) => void;
}

export function SmsSidebar({ activeTab, setActiveTab }: SmsSidebarProps) {
  const tabs = [
    {
      id: 'inbox' as SmsTab,
      label: 'Inbox',
      icon: MessageCircle,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'campaigns' as SmsTab,
      label: 'Campaigns',
      icon: Send,
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'templates' as SmsTab,
      label: 'Templates',
      icon: FileText,
      color: 'from-orange-500 to-red-500',
    },
  ];

  return (
    <aside className="w-72 bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700 flex flex-col shadow-2xl">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-slate-750">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-lg">
            <Zap size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SMS Hub</h2>
            <p className="text-xs text-slate-400">Campaign Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                isActive
                  ? `bg-gradient-to-r ${tab.color} text-white shadow-lg`
                  : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
              }`}
            >
              <Icon
                size={20}
                className={`transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}
              />
              <span className="font-semibold text-sm flex-1">{tab.label}</span>
              {isActive && (
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-4 bg-slate-900/50">
        <div className="text-xs text-slate-400 font-medium px-2">
          💬 SMS Management System
        </div>
      </div>
    </aside>
  );
}
