import { useState, useEffect } from 'react';

interface ActivityDay {
  date: string;
  count: number;
}

export default function ActivityHeatmap() {
  const [activities, setActivities] = useState<ActivityDay[]>([]);

  useEffect(() => {
    // Generate mock activity data for the last 365 days
    // In a real implementation, this would come from the backend
    const data: ActivityDay[] = [];
    const now = new Date();
    for (let i = 364; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toISOString().split('T')[0],
        count: Math.floor(Math.random() * 5), // Mock data
      });
    }
    setActivities(data);
  }, []);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-white/[0.04]';
    if (count === 1) return 'bg-amber-300/20';
    if (count === 2) return 'bg-amber-300/40';
    if (count === 3) return 'bg-amber-300/60';
    return 'bg-amber-300/80';
  };

  // Group by weeks
  const weeks: ActivityDay[][] = [];
  for (let i = 0; i < activities.length; i += 7) {
    weeks.push(activities.slice(i, i + 7));
  }

  return (
    <div className="rounded-[14px] border border-white/[0.06] p-5">
      <div className="text-[14px] font-medium text-white/85 mb-4">Активность за год</div>
      <div className="flex gap-[3px] overflow-x-auto no-scrollbar">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                className={`w-[14px] h-[14px] rounded-[3px] ${getColor(day.count)} transition-cinematic hover:ring-1 hover:ring-white/20`}
                title={`${day.date}: ${day.count} просмотров`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-white/30">
        <span>Меньше</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-white/[0.04]" />
          <div className="w-3 h-3 rounded-sm bg-amber-300/20" />
          <div className="w-3 h-3 rounded-sm bg-amber-300/40" />
          <div className="w-3 h-3 rounded-sm bg-amber-300/60" />
          <div className="w-3 h-3 rounded-sm bg-amber-300/80" />
        </div>
        <span>Больше</span>
      </div>
    </div>
  );
}
