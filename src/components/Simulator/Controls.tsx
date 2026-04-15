import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap, FastForward, List, ShieldCheck } from 'lucide-react';

interface ControlsProps {
  speed: number;
  predictiveMode: boolean;
  onSetSpeed: (speed: number) => void;
  onSkipToAllHands: () => void;
  onTogglePredictive: (enabled: boolean) => void;
  events: any[];
}

const SPEED_OPTIONS = [
  { label: 'Real Time', value: 1 },
  { label: 'Fast (1m/s)', value: 60 },
  { label: 'Lightning (5m/s)', value: 300 }
];

const EVENT_BADGE_STYLES: Record<string, string> = {
  ENTER: 'border-green-500 text-green-400',
  EXIT: 'border-red-500 text-red-400',
  WORK_ORDER_CREATED: 'border-yellow-500 text-yellow-400',
  CLEANING_STARTED: 'border-orange-500 text-orange-400',
  CLEANING_COMPLETED: 'border-emerald-500 text-emerald-400',
  OCCUPANCY_COUNT: 'border-blue-500 text-blue-400',
};

export const Controls: React.FC<ControlsProps> = ({
  speed, predictiveMode,
  onSetSpeed, onSkipToAllHands, onTogglePredictive, events
}) => {
  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Settings */}
      <Card className="bg-white border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono flex items-center gap-2">
            <Zap className="w-4 h-4" /> SIMULATION CONTROLS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Speed */}
          <div className="space-y-2 px-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm font-bold flex items-center gap-2">
                <Zap className="w-3 h-3" /> SIM SPEED
              </span>
              <span className="font-mono text-xs font-bold text-blue-600">
                {SPEED_OPTIONS.find(o => o.value === speed)?.label || `${speed}x`}
              </span>
            </div>
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt) => (
                <Button key={opt.value}
                  variant={speed === opt.value ? 'default' : 'outline'}
                  size="sm" className="flex-1 font-mono text-[10px]"
                  onClick={() => onSetSpeed(opt.value)}>
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Cleaning mode */}
          <div className="space-y-2 px-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> CLEANING MODE
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant={predictiveMode ? 'default' : 'outline'}
                size="sm" className="flex-1 font-mono text-[10px]"
                onClick={() => onTogglePredictive(true)}>
                PREDICTIVE
              </Button>
              <Button
                variant={!predictiveMode ? 'default' : 'outline'}
                size="sm" className="flex-1 font-mono text-[10px]"
                onClick={() => onTogglePredictive(false)}>
                SCHEDULED (5 PM)
              </Button>
            </div>
          </div>

          {/* Skip to all-hands */}
          <div className="px-2 pt-2">
            <Button variant="outline"
              className="w-full border-2 border-slate-800 font-mono shadow-[2px_2px_0px_0px_rgba(30,41,59,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              onClick={onSkipToAllHands}>
              <FastForward className="w-4 h-4 mr-2" /> SKIP TO ALL-HANDS
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Event Log */}
      <Card className="bg-slate-900 border-2 border-slate-800 text-slate-100 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-xs font-mono flex items-center gap-2">
            <List className="w-3 h-3" /> EVENT LOG
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[250px] overflow-y-auto font-mono text-[10px] p-4 space-y-2">
            {events.length === 0 && <div className="text-slate-500 italic">Waiting for events...</div>}
            {events.slice(-20).reverse().map((e, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                <span className="text-slate-500">[{formatTime(e.timestamp)}]</span>
                <Badge variant="outline" className={`text-[8px] py-0 h-4 ${EVENT_BADGE_STYLES[e.type] || 'border-slate-500 text-slate-400'}`}>
                  {e.type.replace(/_/g, ' ')}
                </Badge>
                {e.type === 'OCCUPANCY_COUNT' ? (
                  <span className="text-slate-300 ml-auto">
                    EMP:{e.employeeCount} · GST:{e.guestCount}
                  </span>
                ) : (
                  <>
                    <span className="text-slate-300 truncate max-w-[60px]">{e.npcId}</span>
                    <span className="text-blue-400 ml-auto">{e.restroomId}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
