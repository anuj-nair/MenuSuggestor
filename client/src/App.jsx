import { Route, Routes } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import WeeklyPlanPage from './pages/WeeklyPlanPage.jsx';
import ManagePage from './pages/ManagePage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<WeeklyPlanPage />} />
          <Route path="/manage/*" element={<ManagePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
    </div>
  );
}
