import { useState, useEffect } from 'react';

type ViewMode = 'mobile' | 'desktop';

export function useDevice() {
  const [device, setDevice] = useState<ViewMode>('desktop');

  useEffect(() => {
    const updateDevice = () => {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      
      let effectiveMode: ViewMode | null = null;
      
      if (viewParam === 'field') {
        effectiveMode = 'mobile';
      } else if (viewParam === 'planner') {
        effectiveMode = 'desktop';
      } else {
        const stored = localStorage.getItem('view_override');
        if (stored === 'mobile' || stored === 'desktop') {
          effectiveMode = stored as ViewMode;
        }
      }

      if (!effectiveMode) {
        effectiveMode = window.innerWidth < 768 ? 'mobile' : 'desktop';
      }

      setDevice(effectiveMode);
    };

    updateDevice();
    window.addEventListener('resize', updateDevice);
    window.addEventListener('popstate', updateDevice);
    return () => {
      window.removeEventListener('resize', updateDevice);
      window.removeEventListener('popstate', updateDevice);
    };
  }, []);

  const setOverride = (mode: ViewMode | null) => {
    if (mode) {
      localStorage.setItem('view_override', mode);
    } else {
      localStorage.removeItem('view_override');
    }
    window.dispatchEvent(new Event('resize'));
  };

  return { device, setOverride };
}
