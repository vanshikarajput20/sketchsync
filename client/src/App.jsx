/**
 * client/src/App.jsx
 *
 * Root component — sets up React Router with two routes:
 *   /           → Home (create/join)
 *   /room/:roomId → Room (whiteboard)
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home.jsx';
import { Room } from './pages/Room.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"              element={<Home />} />
        <Route path="/room/:roomId"  element={<Room />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
