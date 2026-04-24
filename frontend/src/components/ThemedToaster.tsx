import type { ReactElement } from 'react';
import { Toaster } from 'sonner';
import { useSettings } from '../hooks/useSettings';

const ThemedToaster = (): ReactElement => {
  const { effectiveTheme } = useSettings();
  return (
    <Toaster
      position="bottom-right"
      theme={effectiveTheme}
      richColors
      closeButton
    />
  );
};

export default ThemedToaster;
