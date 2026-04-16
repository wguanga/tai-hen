import { useState } from 'react';
import { AiPanel } from './components/AiPanel';
import { NotesPanel } from './components/NotesPanel';
import { PaperList } from './components/PaperList';
import { PdfReader } from './components/PdfReader';
import { SettingsModal } from './components/SettingsModal';
import { Toolbar } from './components/Toolbar';
import { AppStoreProvider } from './store/app-store';

export default function App() {
  return (
    <AppStoreProvider>
      <Layout />
    </AppStoreProvider>
  );
}

function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <PaperList />
        <div className="flex-1 min-w-0">
          <PdfReader />
        </div>
        <div className="w-96 border-l flex flex-col flex-shrink-0">
          <div className="flex-1 min-h-0">
            <AiPanel />
          </div>
          <div className="h-56 border-t flex-shrink-0">
            <NotesPanel />
          </div>
        </div>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
