import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ContainerOption {
  id: string;
  name: string;
  location_name: string | null;
}

interface ContainerSelectorProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export const ContainerSelector: React.FC<ContainerSelectorProps> = ({ value, onChange }) => {
  const [options, setOptions] = useState<ContainerOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContainers = async () => {
      const { data } = await supabase
        .from('containers')
        .select('id, name, location:locations(name)')
        .order('name');

      if (data) {
        setOptions(
          data.map((c: any) => ({
            id: c.id,
            name: c.name,
            location_name: c.location?.name || null,
          }))
        );
      }
      setLoading(false);
    };
    fetchContainers();
  }, []);

  if (loading) return null;
  if (options.length === 0) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        No containers yet. Add locations first to organize tools.
      </div>
    );
  }

  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <MapPin className="w-3 h-3" /> Save to Container
      </label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-3 py-2.5 border rounded-lg bg-[hsl(var(--background))] text-[hsl(var(--foreground))] text-sm mt-1.5 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
      >
        <option value="">No container (unorganized)</option>
        {options.map(opt => (
          <option key={opt.id} value={opt.id}>
            {opt.location_name ? `${opt.location_name} > ${opt.name}` : opt.name}
          </option>
        ))}
      </select>
    </div>
  );
};
