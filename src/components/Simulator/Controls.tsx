import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Zap, Save, FastForward, List } from 'lucide-react';

interface ControlsProps {
  npcCount: number;
  speed: number;
  onApplySettings: (npcCount: number, speed: number) => void;
  onSkipToAllHands: () => void;
  events: any[];
}

// Robust Slider using native input for maximum reliability
const SimpleSlider = ({ value, min, max, step, onChange, label, unit }: any) => (
  <div className="space-y-4 px-2">
    <div className="flex justify-between items-center">
      <span className="font-mono text-sm font-bold flex items-center gap-2">
        {label}
      </span>
      <span className="font-mono text-lg font-bold">{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
    />
  </div>
);

const SPEED_OPTIONS = [
  { label: 'Real Time', value: 1 },
  { label: 'Fast (1m/s)', value: 60 },
  { label: 'Lightning (5m/s)', value: 300 }
];

export const Controls: React.FC<ControlsProps> = ({
  npcCount,
  speed,
  onApplySettings,
  onSkipToAllHands,
  events
}) => {
  const [localNpcCount, setLocalNpcCount] = useState(npcCount);
  const [localSpeed, setLocalSpeed] = useState(speed);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const hasChanges = localNpcCount !== npcCount || localSpeed !== speed;

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 bg-white border-2 border-slate-800 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" /> SIMULATION SETTINGS
            </div>
            {hasChanges && (
              <Badge variant="destructive" className="animate-pulse font-mono">UNSAVED CHANGES</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SimpleSlider
              label={<><Users className="w-3 h-3" /> POPULATION</>}
              value={localNpcCount}
              min={1}
              max={20}
              step={1}
              unit=" PEOPLE"
              onChange={setLocalNpcCount}
            />

            <div className="space-y-4 px-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm font-bold flex items-center gap-2">
                  <Zap className="w-3 h-3" /> SIM SPEED
                </span>
                <span className="font-mono text-xs font-bold text-blue-600">
                  {SPEED_OPTIONS.find(o => o.value === localSpeed)?.label || `${localSpeed}x`}
                </span>
              </div>
              <div className="flex gap-2">
                {SPEED_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={localSpeed === opt.value ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 font-mono text-[10px]"
                    onClick={() => setLocalSpeed(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white font-mono border-2 border-slate-800 shadow-[2px_2px_0px_0px_rgba(30,41,59,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              onClick={() => onApplySettings(localNpcCount, localSpeed)}
            >
              <Save className="w-4 h-4 mr-2" /> SAVE & RESTART
            </Button>
            <Button 
              variant="outline"
              className="border-2 border-slate-800 font-mono shadow-[2px_2px_0px_0px_rgba(30,41,59,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
              onClick={onSkipToAllHands}
            >
              <FastForward className="w-4 h-4 mr-2" /> SKIP TO ALL-HANDS
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-2 border-slate-800 text-slate-100 shadow-[4px_4px_0px_0px_rgba(30,41,59,1)]">
        <CardHeader className="pb-2 border-b border-slate-800">
          <CardTitle className="text-xs font-mono flex items-center gap-2">
            <List className="w-3 h-3" /> RESTROOM EVENT LOG
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[200px] overflow-y-auto font-mono text-[10px] p-4 space-y-2">
            {events.length === 0 && <div className="text-slate-500 italic">Waiting for events...</div>}
            {events.slice(-15).reverse().map((e, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-slate-800/50 pb-1">
                <span className="text-slate-500">[{formatTime(e.timestamp)}]</span>
                <Badge variant="outline" className={`text-[8px] py-0 h-4 ${e.type === 'ENTER' ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400'}`}>
                  {e.type}
                </Badge>
                <span className="text-slate-300 truncate max-w-[60px]">{e.npcId}</span>
                <span className="text-blue-400 ml-auto">{e.restroomId}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
